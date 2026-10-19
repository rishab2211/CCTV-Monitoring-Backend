/**
 * @file camera.service.ts
 * @description Manages camera entities, including registration, status updates, 
 * assignment to operators, and tracking network configurations.
 */
import mongoose from "mongoose";
import { Camera, CameraDocument, redactRtspCredentials } from "../models/Camera";
import { User } from "../models/User";
import { Franchise } from "../models/Franchise";
import { logActivity } from "../models/ActivityLog";
import { ApiError } from "../utils/ApiError";
import { parsePaginationParams } from "../utils/pagination";
import { CameraStatus, JwtAccessPayload } from "../types";
import {
  CreateCameraInput,
  UpdateCameraInput,
  AssignCameraInput,
  ListCamerasQuery,
  HeartbeatInput,
  BuildRtspUrlInput,
  ProvisionCameraInput,
  PTZCommandInput,
} from "../validators/camera.validator";
import crypto from "crypto";
import { generateGb28181DeviceId } from "../utils/gb28181";
import { dispatchPtzCommand } from "./gb28181/ptz.service";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import {
  listMediaMTXPaths,
  getMediaMTXPathStatus,
  getCameraStreamPath,
  resolveActiveStreamPath,
  getCameraPathAliases,
  addMediaMTXPath,
  isDirectPublishStream,
  toPathName,
} from "../config/mediamtx.service";
import { socketService } from "./socket.service";
import * as notificationService from "./notification.service";

// ─── Ownership/Access Helper ──────────────────────────────────────────────────

/**
 * Validates if the authenticated user has access to view/modify the camera.
 * Throws 403 Forbidden if access is denied.
 */
export const validateCameraAccess = async (
  camera: CameraDocument,
  user: JwtAccessPayload
): Promise<void> => {
  const { role, userId } = user;

  // Super Admin & Admin have full bypass
  if (role === "super_admin" || role === "admin" || userId === "system") {
    return;
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Franchise access check
  if (role === "franchise" || role === "franchise_admin") {
    // 1. Directly assigned franchise (using franchiseId from token)
    if (user.franchiseId && camera.franchiseId && camera.franchiseId.toString() === user.franchiseId) {
      return;
    }
    // 2. Camera owned by a customer registered under this franchise
    if (camera.customerId && user.franchiseId) {
      const customer = await User.findOne({
        _id: camera.customerId,
        role: "customer",
        "customerDetails.assignedFranchise": new mongoose.Types.ObjectId(user.franchiseId),
        isDeleted: false,
      }).select("_id");
      
      if (customer) return;
    }
    throw ApiError.forbidden("You do not have access to this camera's franchise network");
  }

  // Operator access check
  if (role === "operator") {
    const isAssignedByCamera = (camera.operatorIds || []).some((id) =>
      typeof (id as any).equals === "function" ? (id as any).equals(userObjectId) : id.toString() === user.userId
    );
    if (isAssignedByCamera) return;

    // Symmetrical check: User.operatorDetails.assignedCameras
    const operator = await User.findById(user.userId).select("operatorDetails.assignedCameras").lean();
    const isAssignedByUser = (operator?.operatorDetails?.assignedCameras || []).some(
      (camId: any) => camId.toString() === (camera as any)._id.toString()
    );
    if (isAssignedByUser) return;

    throw ApiError.forbidden("You are not assigned to monitor this camera");
  }

  // Customer access check
  if (role === "customer") {
    const isOwner = camera.customerId && camera.customerId.equals(userObjectId);
    const isShared = camera.sharedWith && camera.sharedWith.some(id => id.equals(userObjectId));
    if (!isOwner && !isShared) {
      throw ApiError.forbidden("You do not own or have shared access to this camera");
    }
    return;
  }

  // Technician access check
  if (role === "technician") {
    // Technicians generally have read/configure access for installation
    return;
  }

  throw ApiError.forbidden("Role not authorized to access this camera");
};

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Create a new camera.
 */
export const createCamera = async (
  input: CreateCameraInput,
  createdBy: string,
  franchiseScope?: string | null
): Promise<CameraDocument> => {
  // Check unique serial number
  const exists = await Camera.findOne({ serialNumber: input.serialNumber, isDeleted: false });
  if (exists) {
    throw ApiError.conflict(`A camera with serial number "${input.serialNumber}" already exists`);
  }

  // Purge any stale soft-deleted document with identical serial to prevent unique index collision
  await Camera.deleteMany({ serialNumber: input.serialNumber, isDeleted: true });

  const camera = await Camera.create({
    ...input,
    franchiseId: franchiseScope || undefined, // Inject franchise binding
    status: "offline",
    health: {
      cpuUsage: 0,
      memoryUsage: 0,
      temperature: 0,
      storageUsage: 0,
      lastPing: null,
    },
  });

  // Keep operatorDetails.assignedCameras in sync if operatorIds were provided at creation
  const rawOperatorIds = (input as any).operatorIds;
  if (Array.isArray(rawOperatorIds) && rawOperatorIds.length > 0) {
    const operatorObjIds = rawOperatorIds.map((id: string) => new mongoose.Types.ObjectId(id));
    await User.updateMany(
      { _id: { $in: operatorObjIds } },
      { $addToSet: { "operatorDetails.assignedCameras": camera._id } }
    );
  }

  logActivity({
    userId: createdBy === "system" ? camera._id : new mongoose.Types.ObjectId(createdBy),
    action: "CAMERA_CREATED",
    description: `Camera "${camera.name}" added successfully (Serial: ${camera.serialNumber})`,
    metadata: { cameraId: camera._id, serialNumber: camera.serialNumber },
  });

  // If external RTSP stream, register with MediaMTX immediately for zero-delay onboarding
  if (!isDirectPublishStream(camera) && camera.rtspUrl) {
    const slug = toPathName(camera.serialNumber);
    await addMediaMTXPath(slug, camera.rtspUrl).catch((err) => {
      logger.warn(`[CameraService] Non-fatal MediaMTX registration failed on create: ${err.message}`);
    });
  }

  logger.info(`📹 Camera created: ${camera.name} (${camera.serialNumber}) by ${createdBy}`);
  return camera;
};

/**
 * List Cameras
 * Retrieves a paginated, filtered list of cameras. Enforces RBAC so that 
 * Operators only see their assigned cameras, and Customers only see their owned cameras.
 * 
 * @param query - Pagination and filtering query params
 * @param user - The authenticated user requesting the list
 */
export const listCameras = async (
  query: ListCamerasQuery,
  user: JwtAccessPayload
) => {
  const { page, limit, sortBy, sortOrder } = parsePaginationParams(query as Record<string, unknown>);
  const skip = (page - 1) * limit;
  const sortDir = sortOrder === "asc" ? 1 : -1;

  const filter: Record<string, unknown> = { isDeleted: false };

  if (query.status) {
    filter.status = query.status;
  }

  if (query.search) {
    const searchRegex = new RegExp(query.search, "i");
    filter.$or = [{ name: searchRegex }, { serialNumber: searchRegex }];
  }

  // Role-based scoping of the filter
  const { role, userId } = user;
  const userObjectId = new mongoose.Types.ObjectId(userId);

  if (role === "franchise" || role === "franchise_admin") {
    // Find all customers managed by this franchise
    if (!user.franchiseId) {
      throw ApiError.forbidden("No franchise associated with your account");
    }
    const fId = new mongoose.Types.ObjectId(user.franchiseId);
    
    const customers = await User.find({
      "customerDetails.assignedFranchise": fId,
      role: "customer",
      isDeleted: false,
    }).select("_id");
    const customerIds = customers.map((c) => c._id);

    // If query has a search, we must use $and
    const franchiseOr = [
      { customerId: { $in: customerIds } },
      { franchiseId: fId },
    ];
    
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: franchiseOr }];
      delete filter.$or;
    } else {
      filter.$or = franchiseOr;
    }
  } else if (role === "operator") {
    const operator = await User.findById(user.userId).select("operatorDetails.assignedCameras").lean();
    const assignedCameraIds = operator?.operatorDetails?.assignedCameras ?? [];
    const operatorOr = [
      { _id: { $in: assignedCameraIds } },
      { operatorIds: userObjectId },
    ];
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: operatorOr }];
      delete filter.$or;
    } else {
      filter.$or = operatorOr;
    }
  } else if (role === "customer") {
    const customerOr = [
      { customerId: userObjectId },
      { sharedWith: userObjectId },
    ];
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: customerOr }];
      delete filter.$or;
    } else {
      filter.$or = customerOr;
    }
  }


  // Explicit filter queries from admins
  if (query.customerId && (role === "super_admin" || role === "admin")) {
    filter.customerId = new mongoose.Types.ObjectId(query.customerId);
  }
  if (query.operatorId && (role === "super_admin" || role === "admin")) {
    filter.operatorIds = new mongoose.Types.ObjectId(query.operatorId);
  }
  if (query.franchiseId && (role === "super_admin" || role === "admin")) {
    filter.franchiseId = new mongoose.Types.ObjectId(query.franchiseId);
  }

  const [data, total] = await Promise.all([
    Camera.find(filter)
      .sort({ [sortBy]: sortDir })
      .skip(skip)
      .limit(limit)
      .populate("customerId", "name email phone address")
      .populate("operatorIds", "name email phone")
      .populate("franchiseId", "name email phone territory address")
      .lean(),
    Camera.countDocuments(filter),
  ]);

  // Dynamically reconcile live stream presence from MediaMTX
  try {
    const activePaths = await listMediaMTXPaths();
    if (activePaths && activePaths.length > 0) {
      const readyPathNames = new Set(
        activePaths.filter((p) => p.ready).map((p) => p.name.toLowerCase())
      );
      for (const cam of data as any[]) {
        const aliases = getCameraPathAliases(cam);
        if (aliases.some((alias) => readyPathNames.has(alias))) {
          cam.status = "online";
        }
      }
    }
  } catch {
    // Non-fatal fallback to DB stored status
  }

  // Normalize client fields: top-level lastPing, customerName, franchiseName, and address fallback
  for (const cam of data as any[]) {
    cam.lastPing = cam.health?.lastPing || cam.lastPing || null;
    cam.customerName = (cam.customerId as any)?.name || cam.customerName || null;
    cam.franchiseName = (cam.franchiseId as any)?.name || cam.franchiseName || null;

    const hasStreet = Boolean(cam.location?.street?.trim());
    const hasCity = Boolean(cam.location?.city?.trim());
    if (!hasStreet && !hasCity) {
      if ((cam.customerId as any)?.address) {
        const custAddr = (cam.customerId as any).address;
        cam.location = {
          ...cam.location,
          street: custAddr.street || "",
          city: custAddr.city || "",
          state: custAddr.state || "",
          pincode: custAddr.pincode || "",
        };
      } else if ((cam.franchiseId as any)?.territory) {
        const terr = (cam.franchiseId as any).territory;
        cam.location = {
          ...cam.location,
          city: terr.city || "",
          state: terr.state || "",
        };
      }
    }
  }

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
    },
  };
};

/**
 * Get Camera Details
 * Retrieves a single camera by ID, ensuring the requesting user has permission to view it.
 * 
 * @param id - The target camera ID
 * @param user - The authenticated user
 */
export const getCameraById = async (
  id: string,
  user: JwtAccessPayload
): Promise<CameraDocument> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest("Invalid camera ID format");
  }

  const camera = await Camera.findOne({ _id: id, isDeleted: false })
    .populate("customerId", "name email phone address")
    .populate("operatorIds", "name email phone")
    .populate("franchiseId", "name email phone territory address");
  if (!camera) throw ApiError.notFound("Camera");

  await validateCameraAccess(camera, user);

  // Dynamically reconcile live stream presence with MediaMTX
  try {
    const pathName = await resolveActiveStreamPath(camera);
    const pathStatus = await getMediaMTXPathStatus(pathName);
    if (pathStatus?.ready && camera.status !== "online") {
      camera.status = "online";
    }
  } catch {
    // Non-fatal
  }

  return camera;
};

/**
 * Update Camera
 * Modifies an existing camera's settings or credentials.
 * 
 * @param id - The target camera ID
 * @param data - Partial update payload
 */
export const updateCamera = async (
  id: string,
  input: UpdateCameraInput,
  user: JwtAccessPayload
): Promise<CameraDocument> => {
  const camera = await getCameraById(id, user);

  // Build update object
  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.rtspUrl !== undefined) updateData.rtspUrl = input.rtspUrl;

  if (input.location !== undefined) {
    for (const [k, v] of Object.entries(input.location)) {
      updateData[`location.${k}`] = v;
    }
  }

  if (input.settings !== undefined) {
    for (const [k, v] of Object.entries(input.settings)) {
      updateData[`settings.${k}`] = v;
    }
  }

  const updated = await Camera.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true, runValidators: true }
  );

  if (!updated) throw ApiError.notFound("Camera");

  logActivity({
    userId: user.userId === "system" ? updated._id : new mongoose.Types.ObjectId(user.userId),
    action: "CAMERA_UPDATED",
    description: `Camera "${updated.name}" settings/info updated`,
    metadata: { cameraId: id, updatedFields: Object.keys(updateData) },
  });

  return updated;
};

/**
 * Delete Camera
 * Soft deletes a camera, preventing it from appearing in standard queries.
 * 
 * @param id - The target camera ID
 */
export const softDeleteCamera = async (id: string, deletedBy: string): Promise<void> => {
  const camera = await Camera.findOne({ _id: id, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");

  camera.isDeleted = true;
  camera.deletedAt = new Date();
  camera.status = "offline";
  await camera.save();

  // Symmetrically remove decommissioned camera from all operators' assignedCameras
  await User.updateMany(
    { "operatorDetails.assignedCameras": camera._id },
    { $pull: { "operatorDetails.assignedCameras": camera._id } }
  );

  logActivity({
    userId: deletedBy === "system" ? camera._id : new mongoose.Types.ObjectId(deletedBy),
    action: "CAMERA_DELETED",
    description: `Camera "${camera.name}" was decommissioned`,
    metadata: { cameraId: id },
  });

  logger.info(`🗑️  Camera decommissioned: ${camera.name} (${camera.serialNumber})`);
};

/**
 * Assign a camera to a customer and/or monitoring operators.
 */
export const assignCamera = async (
  id: string,
  input: AssignCameraInput,
  assignedBy: string
): Promise<CameraDocument> => {
  const camera = await Camera.findOne({ _id: id, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");

  // Validate Customer exists and is a Customer
  if (input.customerId) {
    const customer = await User.findOne({ _id: input.customerId, role: "customer", isDeleted: false });
    if (!customer) throw ApiError.notFound("Customer user");
    camera.customerId = customer._id;
  } else if (input.customerId === null) {
    camera.customerId = undefined;
  }

  // Validate Franchise exists
  if (input.franchiseId) {
    const franchise = await Franchise.findById(input.franchiseId);
    if (!franchise) {
      const franchiseUser = await User.findOne({ _id: input.franchiseId, role: { $in: ["franchise", "franchise_admin"] }, isDeleted: false });
      if (!franchiseUser) throw ApiError.notFound("Franchise not found");
      const ownedFranchise = await Franchise.findOne({ ownerId: franchiseUser._id });
      camera.franchiseId = ownedFranchise ? (ownedFranchise._id as any) : (franchiseUser.franchiseDetails?.franchiseRef || franchiseUser._id);
    } else {
      camera.franchiseId = franchise._id as any;
    }
  } else if (input.franchiseId === null) {
    camera.franchiseId = undefined;
  }

  // Validate Operators exist
  if (input.operatorIds) {
    const operatorsCount = await User.countDocuments({
      _id: { $in: input.operatorIds },
      role: "operator",
      isDeleted: false,
    });
    if (operatorsCount !== input.operatorIds.length) {
      throw ApiError.badRequest("One or more assigned operators do not exist or are invalid");
    }

    const previousOperatorIds = (camera.operatorIds || []).map((opId) => opId.toString());
    const newOperatorObjectIds = input.operatorIds.map((id) => new mongoose.Types.ObjectId(id));
    camera.operatorIds = newOperatorObjectIds;

    // Symmetrically keep operatorDetails.assignedCameras in sync on User records
    // 1. Remove this camera from operators that were unassigned
    await User.updateMany(
      { _id: { $nin: newOperatorObjectIds }, "operatorDetails.assignedCameras": camera._id },
      { $pull: { "operatorDetails.assignedCameras": camera._id } }
    );
    // 2. Add this camera to operators currently assigned
    await User.updateMany(
      { _id: { $in: newOperatorObjectIds } },
      { $addToSet: { "operatorDetails.assignedCameras": camera._id } }
    );

    // Emit real-time events and notifications to affected operators
    const allAffectedIds = Array.from(new Set([...previousOperatorIds, ...input.operatorIds]));
    for (const opId of allAffectedIds) {
      const isAssigned = input.operatorIds.includes(opId);
      socketService.emitToUser(opId, "cameras_updated", {
        cameraId: camera._id.toString(),
        cameraName: camera.name,
        assigned: isAssigned,
      });

      if (isAssigned) {
        notificationService
          .sendNotification(
            opId,
            "New Camera Assigned",
            `Camera "${camera.name}" has been assigned to your station.`,
            "system",
            camera._id.toString()
          )
          .catch((err) =>
            logger.warn(`Failed to send assignment notification to operator ${opId}:`, err)
          );
      }
    }
  }

  await camera.save();

  logActivity({
    userId: assignedBy === "system" ? camera._id : new mongoose.Types.ObjectId(assignedBy),
    action: "CAMERA_ASSIGNED",
    description: `Camera "${camera.name}" assignments updated`,
    metadata: {
      cameraId: id,
      customerId: camera.customerId,
      operatorCount: camera.operatorIds.length,
      franchiseId: camera.franchiseId,
    },
  });

  logger.info(`🔗 Camera assignments updated for: ${camera.name}`);
  return camera;
};

/**
 * Transfer camera ownership to a different customer.
 * Logs ownership transfer in ActivityLog.
 */
export const transferCamera = async (
  id: string,
  customerId: string,
  transferredBy: string
): Promise<CameraDocument> => {
  const camera = await Camera.findOne({ _id: id, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");

  // Prevent redundant self-transfer if camera is already owned by this customer
  if (camera.customerId && camera.customerId.toString() === customerId) {
    throw ApiError.badRequest("Camera is already assigned to this customer");
  }

  const newCustomer = await User.findOne({ _id: customerId, role: "customer", isDeleted: false });
  if (!newCustomer) throw ApiError.notFound("Target customer user");

  const previousCustomerId = camera.customerId;
  camera.customerId = newCustomer._id;

  // Auto-align franchise if the customer is registered under one
  if (newCustomer.customerDetails?.assignedFranchise) {
    camera.franchiseId = newCustomer.customerDetails.assignedFranchise;
  }

  await camera.save();

  logActivity({
    userId: transferredBy === "system" ? camera._id : new mongoose.Types.ObjectId(transferredBy),
    action: "CAMERA_TRANSFERRED",
    description: `Camera "${camera.name}" ownership transferred to customer: ${newCustomer.email}`,
    metadata: {
      cameraId: id,
      previousCustomerId,
      newCustomerId: newCustomer._id,
      transferredBy,
    },
  });

  logger.info(`🔄 Camera transferred: ${camera.name} from ${previousCustomerId || "none"} to ${newCustomer.email}`);
  return camera;
};

/**
 * Remote Status Update.
 */
export const updateCameraStatus = async (
  id: string,
  status: CameraStatus,
  updatedBy: string
): Promise<CameraDocument> => {
  const camera = await Camera.findOne({ _id: id, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");

  camera.status = status;
  await camera.save();

  const eventPayload = {
    cameraId: camera._id.toString(),
    serialNumber: camera.serialNumber,
    status,
    timestamp: new Date().toISOString(),
  };
  const eventName = status === "online" ? "camera_online" : "camera_offline";
  socketService.emitGlobal(eventName, eventPayload);
  socketService.emitToCamera(camera._id.toString(), eventName, eventPayload);
  if (camera.franchiseId) {
    socketService.emitToFranchise(camera.franchiseId.toString(), eventName, eventPayload);
  }

  logger.info(`📶 Camera status set to ${status}: ${camera.name}`);
  return camera;
};

/**
 * Camera Heartbeat Ping.
 * Updates lastPing, status to 'online', and health stats.
 */
export const updateCameraHealth = async (
  id: string,
  healthInput: HeartbeatInput,
  user?: JwtAccessPayload
): Promise<CameraDocument> => {
  const camera = await Camera.findOne({ _id: id, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");

  // Validate ownership / franchise tenancy if authenticated as a tenant/user
  if (user && user.userId !== "system" && user.role !== "super_admin" && user.role !== "admin") {
    if (user.role === "franchise" || user.role === "franchise_admin") {
      if (camera.franchiseId?.toString() !== user.franchiseId) {
        throw ApiError.forbidden("Camera does not belong to your franchise");
      }
    } else if (user.role === "customer") {
      if (camera.customerId?.toString() !== user.userId) {
        throw ApiError.forbidden("You do not have permission to update this camera");
      }
    }
  }

  camera.status = "online";
  camera.health.lastPing = new Date();
  if (healthInput.cpuUsage !== undefined) camera.health.cpuUsage = healthInput.cpuUsage;
  if (healthInput.memoryUsage !== undefined) camera.health.memoryUsage = healthInput.memoryUsage;
  if (healthInput.temperature !== undefined) camera.health.temperature = healthInput.temperature;
  if (healthInput.storageUsage !== undefined) camera.health.storageUsage = healthInput.storageUsage;

  await camera.save();

  const onlinePayload = {
    cameraId: camera._id.toString(),
    serialNumber: camera.serialNumber,
    status: "online",
    timestamp: new Date().toISOString(),
  };
  socketService.emitGlobal("camera_online", onlinePayload);
  socketService.emitToCamera(camera._id.toString(), "camera_online", onlinePayload);
  if (camera.franchiseId) {
    socketService.emitToFranchise(camera.franchiseId.toString(), "camera_online", onlinePayload);
  }
  socketService.emitToCamera(camera._id.toString(), "camera_health", {
    cameraId: camera._id.toString(),
    health: camera.health,
    status: "online",
  });

  return camera;
};

/**
 * Register Camera
 * Adds a new camera to the system. Automatically assigns it to the creating customer
 * if the requester is a Customer.
 * 
 * @param data - The camera configuration payload
 * @param user - The authenticated user creating the camera
 */
export const restartCamera = async (
  id: string,
  user: JwtAccessPayload
): Promise<void> => {
  const camera = await getCameraById(id, user);

  logActivity({
    userId: user.userId === "system" ? camera._id : new mongoose.Types.ObjectId(user.userId),
    action: "CAMERA_RESTARTED",
    description: `Remote restart command issued for camera "${camera.name}"`,
    metadata: { cameraId: id, triggeredBy: user.userId },
  });

  logger.info(`🔄 Remote restart triggered for camera: ${camera.name}`);
};

/**
 * Remote settings updates: Enable/disable recording, motion, AI.
 */
export const updateSettingsField = async (
  id: string,
  field: "recordingEnabled" | "motionDetectionEnabled" | "aiFeaturesEnabled",
  enabled: boolean,
  user: JwtAccessPayload
): Promise<CameraDocument> => {
  const camera = await getCameraById(id, user);

  // Additional permission validation if role is Customer
  if (user.role === "customer" && field === "aiFeaturesEnabled") {
    throw ApiError.forbidden("Customers cannot configure AI features on cameras");
  }

  camera.settings[field] = enabled;
  await camera.save();

  logActivity({
    userId: user.userId === "system" ? camera._id : new mongoose.Types.ObjectId(user.userId),
    action: "CAMERA_UPDATED",
    description: `Camera settings updated: ${field} set to ${enabled}`,
    metadata: { cameraId: id, field, value: enabled },
  });

  return camera;
};

/**
 * QR scan quick config by field technician.
 */
export const qrScanCamera = async (
  id: string,
  technicianId: string
): Promise<CameraDocument> => {
  const camera = await Camera.findOne({ _id: id, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");

  camera.status = "online";
  camera.health.lastPing = new Date();
  // Ensure camera has a permanent QR code identifier without overwriting existing one
  if (!camera.qrCode) {
    camera.qrCode = `CAM-${camera._id}`;
  }
  await camera.save();

  logActivity({
    userId: new mongoose.Types.ObjectId(technicianId),
    action: "CAMERA_UPDATED",
    description: `Technician scanned QR code for quick camera configuration`,
    metadata: { cameraId: id, techId: technicianId },
  });

  logger.info(`📱 Camera QR scanned and configured: ${camera.name} by technician ${technicianId}`);
  return camera;
};

/**
 * Get remote camera configuration details.
 */
export const getCameraConfig = async (
  id: string,
  user: JwtAccessPayload
) => {
  const camera = await getCameraById(id, user);
  return {
    serialNumber: camera.serialNumber,
    rtspUrl: redactRtspCredentials(camera.rtspUrl),
    settings: camera.settings,
    location: camera.location,
    status: camera.status,
  };
};

/**
 * Get customer-specific camera list.
 */
export const getCustomerCameras = async (
  customerId: string,
  user: JwtAccessPayload
) => {
  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw ApiError.badRequest("Invalid customer ID format");
  }

  // Ownership block for customer role
  if (user.role === "customer" && user.userId !== customerId) {
    throw ApiError.forbidden("You can only access your own camera list");
  }

  const query: Record<string, unknown> = {
    customerId: new mongoose.Types.ObjectId(customerId),
    isDeleted: false,
  };

  // Franchise mapping check
  if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId) {
      throw ApiError.forbidden("No franchise associated with your account");
    }
    const customer = await User.findOne({
      _id: customerId,
      role: "customer",
      "customerDetails.assignedFranchise": new mongoose.Types.ObjectId(user.franchiseId),
      isDeleted: false,
    });
    if (!customer) {
      throw ApiError.forbidden("Customer is not registered under your franchise territory");
    }
  }

  const cameras = await Camera.find(query).lean();
  return cameras;
};

/**
 * Get operator-specific camera list.
 */
export const getOperatorCameras = async (
  operatorId: string,
  user: JwtAccessPayload
) => {
  if (!mongoose.Types.ObjectId.isValid(operatorId)) {
    throw ApiError.badRequest("Invalid operator ID format");
  }

  if (user.role === "operator" && user.userId !== operatorId) {
    throw ApiError.forbidden("You can only access your own assigned cameras");
  }

  if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId) {
      throw ApiError.forbidden("No franchise associated with your account");
    }
    const operator = await User.findOne({
      _id: operatorId,
      role: "operator",
      "operatorDetails.assignedFranchise": new mongoose.Types.ObjectId(user.franchiseId),
      isDeleted: false,
    });
    if (!operator) {
      throw ApiError.forbidden("Operator is not registered under your franchise territory");
    }
  }

  const cameras = await Camera.find({
    operatorIds: new mongoose.Types.ObjectId(operatorId),
    isDeleted: false,
  }).lean();

  return cameras;
};

/**
 * Synchronizes camera online/offline statuses in real-time with MediaMTX.
 * Scans active MediaMTX paths, reconciles each registered camera's streaming state,
 * updates the database, and emits Socket.IO events (`camera_online`, `camera_offline`, `camera_health`)
 * so connected dashboards and client apps transition smoothly as streams come and go.
 */
export const syncLiveCameraStatuses = async (): Promise<void> => {
  try {
    const activePaths = await listMediaMTXPaths();
    const readyPathNames = new Set(
      (activePaths || []).filter((p) => p.ready).map((p) => p.name.toLowerCase())
    );

    const cameras = await Camera.find({ isDeleted: false });

    for (const camera of cameras) {
      const primaryPath = getCameraStreamPath(camera).toLowerCase();
      const aliases = getCameraPathAliases(camera);
      const isLive = aliases.some((alias) => readyPathNames.has(alias));
      const isMarkedOnline = camera.status === "online";

      if (isLive && !isMarkedOnline) {
        // Stream just came online!
        camera.status = "online";
        camera.health.lastPing = new Date();
        await camera.save();

        logger.info(`📹 Stream ONLINE: Camera "${camera.name}" (${camera.serialNumber}) [path: ${primaryPath}]`);

        const onlinePayload = {
          cameraId: camera._id.toString(),
          serialNumber: camera.serialNumber,
          status: "online",
          timestamp: new Date().toISOString(),
        };

        // Emit to camera-specific and franchise rooms only (not global broadcast to all clients)
        socketService.emitToCamera(camera._id.toString(), "camera_online", onlinePayload);
        if (camera.franchiseId) {
          socketService.emitToFranchise(camera.franchiseId.toString(), "camera_online", onlinePayload);
        }
        socketService.emitToCamera(camera._id.toString(), "camera_health", {
          cameraId: camera._id.toString(),
          status: "online",
          lastPing: camera.health.lastPing,
        });
      } else if (!isLive && isMarkedOnline) {
        // Stream stopped. Check if an explicit hardware heartbeat was received recently (within 45s)
        const recentPing =
          camera.health?.lastPing &&
          Date.now() - new Date(camera.health.lastPing).getTime() < 45000;

        if (!recentPing) {
          camera.status = "offline";
          await camera.save();

          logger.info(`📴 Stream OFFLINE: Camera "${camera.name}" (${camera.serialNumber}) [path: ${primaryPath}]`);

          const offlinePayload = {
            cameraId: camera._id.toString(),
            serialNumber: camera.serialNumber,
            status: "offline",
            reason: "Stream disconnected",
            timestamp: new Date().toISOString(),
          };

          // Emit to camera-specific and franchise rooms only (not global broadcast)
          socketService.emitToCamera(camera._id.toString(), "camera_offline", offlinePayload);
          if (camera.franchiseId) {
            socketService.emitToFranchise(camera.franchiseId.toString(), "camera_offline", offlinePayload);
          }
          socketService.emitToCamera(camera._id.toString(), "camera_health", {
            cameraId: camera._id.toString(),
            status: "offline",
          });
        }
      }
    }
  } catch (err: any) {
    logger.warn(`[Presence Sync] Background check error: ${err?.message || err}`);
  }
};

// ─── Automated Camera Provisioning & Stream Status ─────────────────────────────

export interface BrandRtspOptions {
  brand: "icsee" | "hikvision" | "dahua" | "tapo" | "reolink" | "generic";
  ip: string;
  port?: number;
  username: string;
  password?: string;
  channel?: number;
  stream?: "main" | "sub";
}

/**
 * Deterministically constructs brand-specific RTSP URLs.
 */
export const buildBrandRtspUrl = (opts: BrandRtspOptions): string => {
  const port = opts.port || 554;
  const ch = opts.channel || 1;
  const s = opts.stream === "sub" ? 1 : 0;
  const auth = opts.password
    ? `${opts.username}:${opts.password}@`
    : `${opts.username}@`;

  switch (opts.brand) {
    case "icsee":
      // Xiongmai / iCSee standard format (must include credentials in query params)
      return `rtsp://${opts.username}:${opts.password || ""}@${opts.ip}:${port}/user=${opts.username}&password=${opts.password || ""}&channel=${ch}&stream=${s}.sdp?real_stream`;
    case "hikvision":
      return `rtsp://${auth}${opts.ip}:${port}/Streaming/Channels/${ch}0${s + 1}`;
    case "dahua":
      return `rtsp://${auth}${opts.ip}:${port}/cam/realmonitor?channel=${ch}&subtype=${s}`;
    case "tapo":
      return `rtsp://${auth}${opts.ip}:${port}/stream${s + 1}`;
    case "reolink":
      return `rtsp://${auth}${opts.ip}:${port}/h264Preview_0${ch}_${s === 0 ? "main" : "sub"}`;
    default:
      return `rtsp://${auth}${opts.ip}:${port}/live`;
  }
};

/**
 * Atomically provisions a camera entity, builds stream configuration,
 * creates pairing QR secret, links optional installation jobs, and returns
 * ready-to-use relay commands for on-prem bridges.
 */
export const provisionCamera = async (
  input: ProvisionCameraInput,
  createdBy: string,
  franchiseScope?: string | null
) => {
  // 1. Resolve RTSP URL
  let resolvedRtspUrl = input.rtspUrl?.trim();
  if (!resolvedRtspUrl) {
    if (!input.ip || !input.username) {
      throw ApiError.badRequest("Either a valid rtspUrl or IP address and username must be provided");
    }
    resolvedRtspUrl = buildBrandRtspUrl({
      brand: input.brand || "generic",
      ip: input.ip,
      port: input.port,
      username: input.username,
      password: input.password,
      channel: input.channel,
      stream: input.stream,
    });
  }

  // 2. Check unique serial number
  const exists = await Camera.findOne({ serialNumber: input.serialNumber, isDeleted: false });
  if (exists) {
    throw ApiError.conflict(`A camera with serial number "${input.serialNumber}" already exists`);
  }

  // Purge any stale soft-deleted document with identical serial to prevent unique index collision
  await Camera.deleteMany({ serialNumber: input.serialNumber, isDeleted: true });

  // 3. Create camera in DB
  const cameraCount = await Camera.countDocuments();
  const gbDeviceId = input.gb28181?.deviceId || generateGb28181DeviceId(cameraCount + 1);
  const gbPassword = input.gb28181?.sipPassword || crypto.randomBytes(4).toString("hex");

  const camera = await Camera.create({
    name: input.name,
    serialNumber: input.serialNumber,
    brand: input.brand || "generic",
    ip: input.ip || "",
    rtspUrl: resolvedRtspUrl,
    customerId: input.customerId && input.customerId.trim() ? input.customerId.trim() : undefined,
    franchiseId: franchiseScope || (input.franchiseId && input.franchiseId.trim() ? input.franchiseId.trim() : undefined),
    location: input.location,
    settings: input.settings,
    gb28181: {
      deviceId: gbDeviceId,
      serverId: "34020000002000000001",
      serverDomain: "3402000000",
      sipPassword: gbPassword,
      sipPort: 5060,
      heartbeatInterval: 60,
      streamMode: input.streamMode || "gb28181",
    },
    status: "offline",
    health: {
      cpuUsage: 0,
      memoryUsage: 0,
      temperature: 0,
      storageUsage: 0,
      lastPing: null,
    },
  });

  // Assign permanent QR code identifier if not set
  if (!camera.qrCode) {
    camera.qrCode = `CAM-${camera._id}`;
    await camera.save();
  }

  // 4. If jobId provided, link camera to InstallationJob
  if (input.jobId && input.jobId.trim()) {
    const { InstallationJob } = await import("../models/InstallationJob");
    await InstallationJob.findByIdAndUpdate(input.jobId.trim(), {
      $set: { cameraId: camera._id },
    }).catch((err) => {
      logger.warn(`[CameraProvision] Failed to associate camera with job ${input.jobId}: ${err.message}`);
    });
  }

  // 5. Derive stream slugs and configs
  const cleanSlug = toPathName(camera.serialNumber);
  const livePath = `live_${cleanSlug}`;
  const rawPath = `raw_${cleanSlug}`;

  let vpsHost = "api-cctv-backend.duckdns.org";
  if (env.PUBLIC_BASE_URL) {
    try {
      vpsHost = new URL(env.PUBLIC_BASE_URL).hostname;
    } catch {
      // fallback
    }
  }

  const vpsIngestUrl = `rtsp://${vpsHost}:8554/${livePath}`;
  const webrtcPlaybackUrl = `https://${vpsHost}/webrtc/${livePath}/whep`;

  const relayCommand = `docker run -d --restart=always --name cctv_relay_${cleanSlug} -e LOCAL_RTSP="${resolvedRtspUrl}" -e VPS_RTSP="${vpsIngestUrl}" cctv-relay`;
  const bashRelayCommand = `./scripts/relay-ip-camera.sh "${resolvedRtspUrl}" "${cleanSlug}"`;

  const gb28181Config = {
    sipServer: vpsHost,
    sipPort: 5060,
    serverDomain: "3402000000",
    serverId: "34020000002000000001",
    deviceId: gbDeviceId,
    password: gbPassword,
    qrPayload: JSON.stringify({
      type: "GB28181_CONFIG",
      sipServer: vpsHost,
      sipPort: 5060,
      serverDomain: "3402000000",
      serverId: "34020000002000000001",
      deviceId: gbDeviceId,
      password: gbPassword,
      serialNumber: camera.serialNumber,
    }),
  };

  logActivity({
    userId: createdBy === "system" ? camera._id : new mongoose.Types.ObjectId(createdBy),
    action: "CAMERA_CREATED",
    description: `Camera "${camera.name}" provisioned successfully via setup wizard`,
    metadata: { cameraId: camera._id, serialNumber: camera.serialNumber, brand: input.brand },
  });

  logger.info(`✨ Camera provisioned: ${camera.name} (${camera.serialNumber}) with stream ${livePath}`);

  return {
    camera,
    streamConfig: {
      streamSlug: cleanSlug,
      ingestPath: livePath,
      rawPath,
      vpsIngestUrl,
      webrtcPlaybackUrl,
    },
    gb28181Config,
    relayCommand,
    bashRelayCommand,
  };
};

/**
 * Issues PTZ directional command to physical IP camera via GB28181 MANSCDP.
 */
export const sendCameraPtzCommand = async (
  id: string,
  input: PTZCommandInput,
  user: JwtAccessPayload
) => {
  const camera = await Camera.findOne({ _id: id, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");
  await validateCameraAccess(camera, user);

  return dispatchPtzCommand({
    cameraId: camera._id.toString(),
    direction: input.direction,
    speed: input.speed,
  });
};

/**
 * Live stream telemetry and path readiness inspection from MediaMTX.
 */
export const getCameraStreamStatus = async (
  id: string,
  user: JwtAccessPayload
) => {
  const camera = await Camera.findOne({ _id: id, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");
  await validateCameraAccess(camera, user);

  const cleanSlug = toPathName(camera.serialNumber);
  const livePath = `live_${cleanSlug}`;
  const rawPath = `raw_${cleanSlug}`;

  // Check both direct live and raw paths in MediaMTX
  const liveStatus = await getMediaMTXPathStatus(livePath);
  let rawStatus = null;
  if (!liveStatus) {
    rawStatus = await getMediaMTXPathStatus(rawPath);
  }

  const activeStatus = liveStatus || rawStatus;
  const isPublishing = Boolean(activeStatus && (activeStatus as any).ready);

  // If status is ready in MediaMTX but offline in DB, update DB status
  if (isPublishing && camera.status === "offline") {
    camera.status = "online";
    camera.health.lastPing = new Date();
    await camera.save();
    socketService.emitToCamera(camera._id.toString(), "camera_online", { cameraId: camera._id });
  }

  return {
    cameraId: camera._id,
    serialNumber: camera.serialNumber,
    streamSlug: cleanSlug,
    activePath: liveStatus ? livePath : rawStatus ? rawPath : livePath,
    isLive: isPublishing,
    ready: isPublishing,
    tracks: activeStatus?.tracks || [],
    bytesReceived: (activeStatus as any)?.bytesReceived || 0,
    readersCount: (activeStatus as any)?.readers?.length || 0,
    dbStatus: camera.status,
    lastPing: camera.health?.lastPing || null,
  };
};
