/**
 * @file sos.service.ts
 * @description Business logic for the SOS Module.
 * Handles triggering, acknowledging, and resolving emergency SOS alerts.
 */
import mongoose from "mongoose";
import { SosAlert } from "../models/SosAlert";
import { Camera } from "../models/Camera";
import { User } from "../models/User";
import { ApiError } from "../utils/ApiError";
import { parsePaginationParams } from "../utils/pagination";
import { JwtAccessPayload, SosStatus } from "../types";
import { socketService } from "./socket.service";
import * as notificationService from "./notification.service";
import { logActivity } from "../models/ActivityLog";
import { logger } from "../utils/logger";

/**
 * Trigger SOS Alert
 * Creates an active SOS event, broadcasts it globally to all operators/admins,
 * and pushes notifications.
 * 
 * @param input - Contains optional cameraId and location
 * @param user - The user triggering the SOS
 * @returns The populated SosAlert document
 * @throws ApiError if the camera is not found
 */
export const triggerSos = async (
  input: { cameraId?: string; location?: string },
  user: JwtAccessPayload
) => {
  const { cameraId, location } = input;

  let franchiseId;
  if (cameraId) {
    const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
    if (!camera) throw ApiError.notFound("Camera associated with SOS not found");
    franchiseId = camera.franchiseId;
  }

  // Create the SOS alert
  const sosAlert = await SosAlert.create({
    triggeredBy: user.userId,
    cameraId,
    franchiseId,
    location,
    status: "active",
  });

  const populatedSos = await sosAlert.populate([
    { path: "triggeredBy", select: "name email phone" },
    { path: "cameraId", select: "name serialNumber" },
  ]);

  logger.warn(`🚨 SOS Triggered by user ${user.userId} (SOS ID: ${sosAlert._id})`);

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "SOS_TRIGGERED",
    description: `User triggered an SOS alert`,
    metadata: { sosId: sosAlert._id, cameraId, location },
  });

  // 1. Broadcast via WebSocket (Global since it's an emergency)
  socketService.emitGlobal("sos_triggered", populatedSos);

  // 2. Send Push Notifications to admins and operators
  // Since this is an emergency, we might want to bypass standard notification preferences.
  // For now, we will query all users with role admin/super_admin/operator and send a broadcast.
  const emergencyResponders = await User.find({
    role: { $in: ["super_admin", "admin", "operator"] },
    isActive: true,
    isDeleted: false,
  }).select("_id");

  // Send individually to all responders
  // In a production system with thousands of operators, this might need chunking or topic messaging
  for (const responder of emergencyResponders) {
    await notificationService.sendNotification(
      responder._id.toString(),
      "🚨 EMERGENCY: SOS Alert Triggered",
      `An SOS has been triggered${location ? ` at ${location}` : ""}. Immediate action required.`,
      "alert",
      sosAlert._id.toString()
    ).catch(err => logger.error(`Failed to send SOS push to ${responder._id}`, err));
  }

  return populatedSos;
};

/**
 * List SOS Alerts
 * Fetches paginated list of SOS alerts.
 * 
 * @param query - Pagination and filter parameters (page, limit, status, cameraId)
 * @param user - Requesting user
 * @returns An object containing the populated SOS alerts array and pagination metadata
 */
export const listSosAlerts = async (query: any, user: JwtAccessPayload) => {
  const { page, limit } = parsePaginationParams(query);
  const { status, cameraId } = query;
  const filter: any = {};

  if (status) filter.status = status;
  if (cameraId) filter.cameraId = cameraId;

  // Non-admins can only see their own SOS alerts or SOS alerts from cameras they are assigned to
  if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId) throw ApiError.forbidden("No franchise associated with your account");
    filter.franchiseId = user.franchiseId;
  } else if (user.role !== "super_admin" && user.role !== "admin") {
    // If operator, they see SOS for their cameras
    if (user.role === "operator") {
      const accessibleCameras = await Camera.find({
        operatorIds: user.userId,
        isDeleted: false,
      }).select("_id");
      filter.cameraId = { $in: accessibleCameras.map((c) => c._id) };
    } else {
      // Regular customers/technicians only see SOS they triggered
      filter.triggeredBy = user.userId;
    }
  }

  const skip = (page - 1) * limit;
  const [alerts, total] = await Promise.all([
    SosAlert.find(filter)
      .populate("triggeredBy", "name email phone")
      .populate("cameraId", "name serialNumber")
      .populate("acknowledgedBy", "name")
      .populate("resolvedBy", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SosAlert.countDocuments(filter),
  ]);

  return { alerts, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Acknowledge SOS Alert
 * Moves the alert status from 'active' to 'acknowledged' and records the responder.
 * Broadcasts an `sos_acknowledged` event globally.
 * 
 * @param sosId - The ID of the SOS Alert
 * @param user - The user acknowledging the alert (must be an operator/admin)
 * @returns The populated and acknowledged SosAlert document
 * @throws ApiError if the user lacks permissions, the alert is not found, or it is not in the 'active' state
 */
export const acknowledgeSos = async (sosId: string, user: JwtAccessPayload) => {
  const sosAlert = await SosAlert.findById(sosId);
  if (!sosAlert) throw ApiError.notFound("SOS Alert not found");

  if (sosAlert.status !== "active") {
    throw ApiError.badRequest(`SOS Alert cannot be acknowledged because it is currently ${sosAlert.status}`);
  }

  sosAlert.status = "acknowledged";
  sosAlert.acknowledgedBy = new mongoose.Types.ObjectId(user.userId);
  sosAlert.acknowledgedAt = new Date();
  await sosAlert.save();

  const populatedSos = await sosAlert.populate([
    { path: "triggeredBy", select: "name email phone" },
    { path: "cameraId", select: "name serialNumber" },
    { path: "acknowledgedBy", select: "name" },
  ]);

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "SOS_ACKNOWLEDGED",
    description: `SOS alert acknowledged`,
    metadata: { sosId },
  });

  socketService.emitGlobal("sos_acknowledged", populatedSos);

  return populatedSos;
};

/**
 * Resolve SOS Alert
 * Marks the alert as 'resolved' with accompanying notes.
 * Broadcasts an `sos_resolved` event globally.
 * 
 * @param sosId - The ID of the SOS Alert
 * @param resolutionNotes - Notes explaining how the emergency was resolved
 * @param user - The user resolving the alert (must be an operator/admin)
 * @returns The populated and resolved SosAlert document
 * @throws ApiError if the user lacks permissions, the alert is not found, or it is not in the 'acknowledged' state
 */
export const resolveSos = async (
  sosId: string,
  notes: string,
  user: JwtAccessPayload
) => {
  const sosAlert = await SosAlert.findById(sosId);
  if (!sosAlert) throw ApiError.notFound("SOS Alert not found");

  if (sosAlert.status === "resolved") {
    throw ApiError.badRequest("SOS Alert is already resolved");
  }

  sosAlert.status = "resolved";
  sosAlert.resolvedBy = new mongoose.Types.ObjectId(user.userId);
  sosAlert.resolvedAt = new Date();
  sosAlert.resolutionNotes = notes;
  await sosAlert.save();

  const populatedSos = await sosAlert.populate([
    { path: "triggeredBy", select: "name email phone" },
    { path: "cameraId", select: "name serialNumber" },
    { path: "acknowledgedBy", select: "name" },
    { path: "resolvedBy", select: "name" },
  ]);

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "SOS_RESOLVED",
    description: `SOS alert resolved`,
    metadata: { sosId, notes },
  });

  socketService.emitGlobal("sos_resolved", populatedSos);

  return populatedSos;
};

/**
 * Get SOS Detail
 * Retrieves the full detail of a specific SOS alert, populating referenced entities
 * such as the triggered user, assigned camera, and any added notes.
 * 
 * @param id - The ID of the SOS Alert
 * @param user - The user requesting the detail
 * @returns The populated SOS Alert document
 * @throws ApiError if the SOS alert is not found
 */
export const getSosDetail = async (id: string, user: JwtAccessPayload) => {
  const sos = await SosAlert.findById(id)
    .populate("triggeredBy", "name role email")
    .populate("cameraId", "name location")
    .populate("acknowledgedBy", "name role")
    .populate("resolvedBy", "name role")
    .populate("notes.addedBy", "name role")
    .lean();

  if (!sos) throw ApiError.notFound("SOS Alert not found");
  return sos;
};

/**
 * Get Active SOS Alerts
 * Retrieves a list of all currently active SOS alerts across the system.
 * Useful for displaying live emergencies on operator dashboards.
 * 
 * @param user - The operator requesting the list
 * @returns An array of active SOS alerts
 */
export const getActiveSos = async (user: JwtAccessPayload) => {
  const filter: any = { status: "active" };

  if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId) throw ApiError.forbidden("No franchise associated with your account");
    filter.franchiseId = user.franchiseId;
  } else if (user.role !== "super_admin" && user.role !== "admin") {
    if (user.role === "operator") {
      const accessibleCameras = await Camera.find({
        operatorIds: user.userId,
        isDeleted: false,
      }).select("_id");
      filter.cameraId = { $in: accessibleCameras.map((c) => c._id) };
    } else {
      filter.triggeredBy = user.userId;
    }
  }

  const sosAlerts = await SosAlert.find(filter)
    .populate("triggeredBy", "name role email")
    .populate("cameraId", "name location")
    .sort({ createdAt: -1 })
    .lean();
  return sosAlerts;
};

/**
 * Add Note to SOS
 * Appends a textual note to an SOS alert (e.g., "Dispatched security").
 * Also logs the activity in the system's activity log.
 * 
 * @param id - The ID of the SOS Alert
 * @param text - The content of the note
 * @param user - The operator adding the note
 * @returns The updated SOS Alert document
 * @throws ApiError if the SOS alert is not found
 */
export const addSosNote = async (id: string, text: string, user: JwtAccessPayload) => {
  const sos = await SosAlert.findById(id);
  if (!sos) throw ApiError.notFound("SOS Alert not found");

  if (!sos.notes) {
    sos.notes = [];
  }

  sos.notes.push({
    text,
    addedBy: new mongoose.Types.ObjectId(user.userId),
    addedAt: new Date(),
  });

  await sos.save();

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "SOS_NOTE_ADDED",
    description: `Added a note to SOS ${sos._id}`,
    metadata: { sosId: sos._id },
  });

  return sos;
};

/**
 * Get SOS Timeline
 * Fetches the chronological activity log entries associated with a specific SOS alert.
 * This includes creation, acknowledgment, notes added, and resolution events.
 * 
 * @param id - The ID of the SOS Alert
 * @param user - The user requesting the timeline
 * @returns An array of activity log documents
 */
export const getSosTimeline = async (id: string, user: JwtAccessPayload) => {
  const sos = await SosAlert.findById(id);
  if (!sos) throw ApiError.notFound("SOS Alert not found");

  if (user.role === "customer" && sos.triggeredBy.toString() !== user.userId) {
    throw ApiError.forbidden("Access denied");
  }

  const idQuery = mongoose.Types.ObjectId.isValid(id)
    ? { $in: [id, new mongoose.Types.ObjectId(id)] }
    : id;

  const timeline = await mongoose.connection.collection("activitylogs")
    .find({ "metadata.sosId": idQuery })
    .sort({ createdAt: 1 })
    .toArray();

  return timeline;
};
