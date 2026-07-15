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
 */
export const triggerSos = async (
  input: { cameraId?: string; location?: string },
  user: JwtAccessPayload
) => {
  const { cameraId, location } = input;

  // Validate camera if provided
  if (cameraId) {
    const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
    if (!camera) throw ApiError.notFound("Camera associated with SOS not found");
  }

  // Create the SOS alert
  const sosAlert = await SosAlert.create({
    triggeredBy: user.userId,
    cameraId,
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
    await notificationService.sendNotification({
      userId: responder._id.toString(),
      title: "🚨 EMERGENCY: SOS Alert Triggered",
      body: `An SOS has been triggered${location ? ` at ${location}` : ""}. Immediate action required.`,
      type: "alert",
      referenceId: sosAlert._id.toString(),
      // Bypassing 'isFirebaseInitialized' check internally inside sendNotification
    }).catch(err => logger.error(`Failed to send SOS push to ${responder._id}`, err));
  }

  return populatedSos;
};

/**
 * List SOS Alerts
 * Fetches paginated list of SOS alerts.
 * 
 * @param query - Pagination and filter parameters
 * @param user - Requesting user
 */
export const listSosAlerts = async (query: any, user: JwtAccessPayload) => {
  const { page, limit, status, cameraId } = query;
  const filter: any = {};

  if (status) filter.status = status;
  if (cameraId) filter.cameraId = cameraId;

  // Non-admins can only see their own SOS alerts or SOS alerts from cameras they are assigned to
  if (user.role !== "super_admin" && user.role !== "admin") {
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
 * Acknowledge SOS
 * Operator acknowledges the SOS, letting others know it is being handled.
 * 
 * @param sosId - The SOS Alert ID
 * @param user - The responding operator
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
 * Resolve SOS
 * Operator resolves the SOS with notes.
 * 
 * @param sosId - The SOS Alert ID
 * @param notes - Resolution notes
 * @param user - The responding operator
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
