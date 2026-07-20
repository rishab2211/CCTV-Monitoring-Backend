/**
 * @file camera.service.ts
 * @description Manages camera entities, including registration, status updates, 
 * assignment to operators, and tracking network configurations.
 */
import mongoose from "mongoose";
import { Camera, CameraDocument } from "../models/Camera";
import { User } from "../models/User";
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
} from "../validators/camera.validator";
import { logger } from "../utils/logger";

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
    if (camera.customerId) {
      const customer = await User.findOne({
        _id: camera.customerId,
        role: "customer",
        "customerDetails.assignedFranchise": new mongoose.Types.ObjectId(user.franchiseId!),
        isDeleted: false,
      }).select("_id");
      
      if (customer) return;
    }
    throw ApiError.forbidden("You do not have access to this camera's franchise network");
  }

  // Operator access check
  if (role === "operator") {
    const isAssigned = camera.operatorIds.some((id) => id.equals(userObjectId));
    if (!isAssigned) {
      throw ApiError.forbidden("You are not assigned to monitor this camera");
    }
    return;
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
  createdBy: string
): Promise<CameraDocument> => {
  // Check unique serial number
  const exists = await Camera.findOne({ serialNumber: input.serialNumber, isDeleted: false });
  if (exists) {
    throw ApiError.conflict(`A camera with serial number "${input.serialNumber}" already exists`);
  }

  const camera = await Camera.create({
    ...input,
    status: "offline",
    health: {
      cpuUsage: 0,
      memoryUsage: 0,
      temperature: 0,
      storageUsage: 0,
      lastPing: null,
    },
  });

  logActivity({
    userId: createdBy === "system" ? camera._id : new mongoose.Types.ObjectId(createdBy),
    action: "CAMERA_CREATED",
    description: `Camera "${camera.name}" added successfully (Serial: ${camera.serialNumber})`,
    metadata: { cameraId: camera._id, serialNumber: camera.serialNumber },
  });

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
    filter.operatorIds = userObjectId;
  } else if (role === "customer") {
    filter.customerId = userObjectId;
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
      .populate("customerId", "name email phone")
      .populate("operatorIds", "name email phone")
      .populate("franchiseId", "name email phone")
      .lean(),
    Camera.countDocuments(filter),
  ]);

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

  const camera = await Camera.findOne({ _id: id, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");

  await validateCameraAccess(camera, user);

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

  // Validate Franchise exists and is a Franchise
  if (input.franchiseId) {
    const franchise = await User.findOne({ _id: input.franchiseId, role: "franchise", isDeleted: false });
    if (!franchise) throw ApiError.notFound("Franchise user");
    camera.franchiseId = franchise._id;
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
    camera.operatorIds = input.operatorIds.map((id) => new mongoose.Types.ObjectId(id));
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

  logger.info(`📶 Camera status set to ${status}: ${camera.name}`);
  return camera;
};

/**
 * Camera Heartbeat Ping.
 * Updates lastPing, status to 'online', and health stats.
 */
export const updateCameraHealth = async (
  id: string,
  healthInput: HeartbeatInput
): Promise<CameraDocument> => {
  const camera = await Camera.findOne({ _id: id, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");

  camera.status = "online";
  camera.health.lastPing = new Date();
  if (healthInput.cpuUsage !== undefined) camera.health.cpuUsage = healthInput.cpuUsage;
  if (healthInput.memoryUsage !== undefined) camera.health.memoryUsage = healthInput.memoryUsage;
  if (healthInput.temperature !== undefined) camera.health.temperature = healthInput.temperature;
  if (healthInput.storageUsage !== undefined) camera.health.storageUsage = healthInput.storageUsage;

  await camera.save();
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
  camera.qrCode = `configured-tech-${technicianId}-${Date.now()}`;
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
    rtspUrl: camera.rtspUrl,
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
  if (user.role === "franchise") {
    const customer = await User.findOne({
      _id: customerId,
      role: "customer",
      "customerDetails.assignedFranchise": new mongoose.Types.ObjectId(user.userId),
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

  const cameras = await Camera.find({
    operatorIds: new mongoose.Types.ObjectId(operatorId),
    isDeleted: false,
  }).lean();

  return cameras;
};
