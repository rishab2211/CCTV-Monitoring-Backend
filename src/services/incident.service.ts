/**
 * @file incident.service.ts
 * @description Business logic for the Incident Management Module.
 */
import mongoose from "mongoose";
import { Incident } from "../models/Incident";
import { Camera } from "../models/Camera";
import { User } from "../models/User";
import { ApiError } from "../utils/ApiError";
import { JwtAccessPayload, IncidentStatus } from "../types";
import { socketService } from "./socket.service";
import * as notificationService from "./notification.service";
import { logActivity } from "../models/ActivityLog";
import { logger } from "../utils/logger";

/**
 * Report an Incident
 * Creates a new incident, optionally attached with files.
 * @param input - Incident details and file URLs
 * @param user - Requesting user
 */
export const reportIncident = async (input: any, user: JwtAccessPayload) => {
  const { title, description, type, severity, cameraId, attachments = [] } = input;

  if (cameraId) {
    const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
    if (!camera) throw ApiError.notFound("Camera not found");

    // Ensure customer/operator has access to this camera to report an incident on it
    if (user.role === "customer" || user.role === "operator") {
      const hasAccess =
        camera.customerId?.toString() === user.userId ||
        camera.operatorIds?.some((id) => id.toString() === user.userId);
      if (!hasAccess) throw ApiError.forbidden("No access to report incident on this camera");
    }
  }

  const incident = await Incident.create({
    title,
    description,
    type,
    severity,
    cameraId,
    reportedBy: user.userId,
    attachments,
    status: "open",
  });

  const populated = await incident.populate([
    { path: "reportedBy", select: "name email" },
    { path: "cameraId", select: "name serialNumber" },
  ]);

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "INCIDENT_REPORTED",
    description: `Reported a new ${severity} severity incident`,
    metadata: { incidentId: incident._id, type },
  });

  // Notify Admins
  const admins = await User.find({ role: { $in: ["admin", "super_admin"] }, isActive: true });
  for (const admin of admins) {
    // Socket emit
    socketService.emitToUser(admin._id.toString(), "new_incident", populated);
    
    // Push Notification if High/Critical
    if (severity === "high" || severity === "critical") {
      await notificationService.sendNotification(
        admin._id.toString(),
        `🚨 ${severity.toUpperCase()} Incident Reported`,
        title,
        "alert",
        incident._id.toString()
      ).catch((e) => logger.error(`Push error: `, e));
    }
  }

  return populated;
};

/**
 * List Incidents
 * @param query - Pagination and filters
 * @param user - Requesting user
 */
export const listIncidents = async (query: any, user: JwtAccessPayload) => {
  const { page, limit, status, severity, cameraId } = query;
  const filter: any = {};

  if (status) filter.status = status;
  if (severity) filter.severity = severity;
  if (cameraId) filter.cameraId = cameraId;

  // Customers only see their own reported incidents
  // Operators see incidents assigned to them, or incidents on their cameras
  if (user.role === "customer") {
    filter.reportedBy = user.userId;
  } else if (user.role === "operator") {
    const accessibleCameras = await Camera.find({
      operatorIds: user.userId,
      isDeleted: false,
    }).select("_id");
    
    filter.$or = [
      { assignedTo: user.userId },
      { reportedBy: user.userId },
      { cameraId: { $in: accessibleCameras.map((c) => c._id) } }
    ];
  }

  const skip = (page - 1) * limit;
  const [incidents, total] = await Promise.all([
    Incident.find(filter)
      .populate("reportedBy", "name email")
      .populate("assignedTo", "name email")
      .populate("cameraId", "name serialNumber")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Incident.countDocuments(filter),
  ]);

  return { incidents, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Get Incident Details
 */
export const getIncidentDetails = async (id: string, user: JwtAccessPayload) => {
  const incident = await Incident.findById(id)
    .populate("reportedBy", "name email phone")
    .populate("assignedTo", "name email phone")
    .populate("cameraId", "name serialNumber location");
    
  if (!incident) throw ApiError.notFound("Incident not found");

  // Basic access check
  if (user.role === "customer" && incident.reportedBy._id.toString() !== user.userId) {
    throw ApiError.forbidden("Access denied");
  }

  return incident;
};

/**
 * Update Incident Status
 */
export const updateIncidentStatus = async (id: string, updateData: any, user: JwtAccessPayload) => {
  const { status, resolutionNotes } = updateData;

  const incident = await Incident.findById(id);
  if (!incident) throw ApiError.notFound("Incident not found");

  // Operators can only update if assigned to them or if they are admins
  if (user.role === "operator" && incident.assignedTo?.toString() !== user.userId) {
    throw ApiError.forbidden("You must be assigned to this incident to update its status");
  }

  if (user.role === "customer") {
    throw ApiError.forbidden("Customers cannot change incident status");
  }

  incident.status = status;
  if (resolutionNotes) {
    incident.resolutionNotes = resolutionNotes;
  }

  if (status === "resolved" || status === "closed") {
    // If not already resolved
    if (!incident.resolutionNotes && !resolutionNotes) {
      throw ApiError.badRequest("Resolution notes are required to resolve an incident");
    }
  }

  await incident.save();

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "INCIDENT_STATUS_UPDATED",
    description: `Updated incident status to ${status}`,
    metadata: { incidentId: id, status },
  });

  // Notify reporter
  socketService.emitToUser(incident.reportedBy.toString(), "incident_updated", incident);
  await notificationService.sendNotification(
    incident.reportedBy.toString(),
    "Incident Update",
    `Your incident status changed to ${status}`,
    "system",
    incident._id.toString()
  ).catch(() => {});

  return incident;
};

/**
 * Assign Incident
 * Admins/Franchise assign an incident to an operator/technician.
 */
export const assignIncident = async (id: string, assignedTo: string, user: JwtAccessPayload) => {
  if (user.role !== "admin" && user.role !== "super_admin" && user.role !== "franchise") {
    throw ApiError.forbidden("Only admins can assign incidents");
  }

  const assignee = await User.findById(assignedTo);
  if (!assignee) throw ApiError.notFound("Assignee user not found");

  const incident = await Incident.findByIdAndUpdate(
    id,
    { assignedTo, status: "investigating" },
    { new: true }
  ).populate("assignedTo", "name email");

  if (!incident) throw ApiError.notFound("Incident not found");

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "INCIDENT_ASSIGNED",
    description: `Assigned incident to ${assignee.name}`,
    metadata: { incidentId: id, assignedTo },
  });

  // Notify assignee
  socketService.emitToUser(assignedTo, "incident_assigned", incident);
  await notificationService.sendNotification(
    assignedTo,
    "Incident Assigned",
    `You have been assigned to incident: ${incident.title}`,
    "system",
    incident._id.toString()
  ).catch(() => {});

  return incident;
};
