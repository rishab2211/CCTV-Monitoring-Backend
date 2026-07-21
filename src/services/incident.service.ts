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
 * Validates camera access if a camera ID is provided.
 * 
 * @param input - Incident details and file URLs
 * @param user - Requesting user
 * @returns The populated Incident document
 * @throws ApiError if the camera is not found or user lacks access
 */
export const reportIncident = async (input: any, user: JwtAccessPayload) => {
  const { title, description, type, severity, cameraId, attachments = [] } = input;

  let franchiseId;
  if (cameraId) {
    const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
    if (!camera) throw ApiError.notFound("Camera not found");
    franchiseId = camera.franchiseId;

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
    franchiseId,
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
 * Retrieves a paginated list of incidents with RBAC filtering.
 * Customers see only their own reported incidents.
 * Operators see incidents assigned to them or on their assigned cameras.
 * Admins see all incidents.
 * 
 * @param query - Pagination and filters (status, severity, cameraId)
 * @param user - Requesting user
 * @returns Object containing incidents array and pagination metadata
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
  } else if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId) throw ApiError.forbidden("No franchise associated with your account");
    filter.franchiseId = user.franchiseId;
  } else if (user.role !== "super_admin" && user.role !== "admin") {
    throw ApiError.forbidden("You do not have access to view these incidents");
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
 * Retrieves full details for a specific incident.
 * Customers can only view incidents they reported.
 * 
 * @param id - The incident ID
 * @param user - Requesting user
 * @returns The populated Incident document
 * @throws ApiError if not found or access denied
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
 * Changes the status of an incident and records resolution notes.
 * Operators can only update incidents assigned to them.
 * Customers are not permitted to change status.
 * 
 * @param id - The incident ID
 * @param updateData - Object containing status and optional resolutionNotes
 * @param user - Requesting user
 * @returns The updated Incident document
 * @throws ApiError if missing notes on resolution, or unauthorized
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
 * Admins or Franchise managers can assign an incident to an operator/technician for investigation.
 * 
 * @param id - The incident ID
 * @param assignedTo - The User ID to assign to
 * @param user - Requesting user (must be admin/super_admin/franchise)
 * @returns The updated Incident document
 * @throws ApiError if user lacks permission, or if assignee/incident is not found
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

/**
 * Add Note to Incident
 * Appends a free-text operator note to an incident's notes array.
 * Logs the activity for auditability.
 *
 * @param id - The incident ID
 * @param text - The note content
 * @param user - The operator adding the note
 * @returns The updated Incident document
 * @throws ApiError if the incident is not found
 */
export const addIncidentNote = async (id: string, text: string, user: JwtAccessPayload) => {
  const incident = await Incident.findById(id);
  if (!incident) throw ApiError.notFound("Incident not found");

  if (!incident.notes) incident.notes = [];
  incident.notes.push({
    text,
    addedBy: new mongoose.Types.ObjectId(user.userId),
    addedAt: new Date(),
  });

  await incident.save();

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "INCIDENT_NOTE_ADDED",
    description: `Added a note to incident ${incident._id}`,
    metadata: { incidentId: id },
  });

  return incident;
};

/**
 * Upload Media to Incident
 * Appends one or more media file paths (photos/clips) to the incident's
 * attachments array. Files are uploaded via multer before this is called.
 *
 * @param id - The incident ID
 * @param filePaths - Array of server-relative file paths from multer
 * @param user - The operator uploading the media
 * @returns The updated Incident document
 * @throws ApiError if the incident is not found
 */
export const uploadIncidentMedia = async (id: string, filePaths: string[], user: JwtAccessPayload) => {
  const incident = await Incident.findById(id);
  if (!incident) throw ApiError.notFound("Incident not found");

  // Append new file paths; existing attachments are preserved
  incident.attachments = [...incident.attachments, ...filePaths];
  await incident.save();

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "INCIDENT_MEDIA_UPLOADED",
    description: `Uploaded ${filePaths.length} media file(s) to incident ${incident._id}`,
    metadata: { incidentId: id, files: filePaths },
  });

  return incident;
};

/**
 * Close Incident
 * Explicitly marks an incident as 'closed' with mandatory resolution notes.
 * Records the closure timestamp.
 *
 * @param id - The incident ID
 * @param resolutionNotes - Notes explaining how the incident was resolved
 * @param user - The operator or admin closing the incident
 * @returns The updated Incident document
 * @throws ApiError if already closed or resolution notes are missing
 */
export const closeIncident = async (id: string, resolutionNotes: string, user: JwtAccessPayload) => {
  if (user.role === "customer") {
    throw ApiError.forbidden("Customers cannot close incidents");
  }

  const incident = await Incident.findById(id);
  if (!incident) throw ApiError.notFound("Incident not found");
  if (incident.status === "closed") throw ApiError.badRequest("Incident is already closed");

  incident.status = "closed";
  incident.resolutionNotes = resolutionNotes;
  incident.closedAt = new Date();
  await incident.save();

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "INCIDENT_CLOSED",
    description: `Closed incident ${incident._id}`,
    metadata: { incidentId: id },
  });

  socketService.emitToUser(incident.reportedBy.toString(), "incident_closed", incident);

  return incident;
};

/**
 * Verify Incident
 * Allows an operator to formally confirm the incident is valid.
 * Sets the isVerified flag and optionally appends a note.
 *
 * @param id - The incident ID
 * @param notes - Optional note to append during verification
 * @param user - The operator verifying the incident
 * @returns The updated Incident document
 * @throws ApiError if the incident is not found or user lacks access
 */
export const verifyIncident = async (id: string, notes: string | undefined, user: JwtAccessPayload) => {
  if (user.role === "customer") {
    throw ApiError.forbidden("Customers cannot verify incidents");
  }

  const incident = await Incident.findById(id);
  if (!incident) throw ApiError.notFound("Incident not found");

  incident.isVerified = true;
  if (notes) {
    if (!incident.notes) incident.notes = [];
    incident.notes.push({
      text: `Verification note: ${notes}`,
      addedBy: new mongoose.Types.ObjectId(user.userId),
      addedAt: new Date(),
    });
  }

  await incident.save();

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "INCIDENT_VERIFIED",
    description: `Verified incident ${incident._id}`,
    metadata: { incidentId: id },
  });

  return incident;
};

/**
 * Get Incident Timeline
 * Retrieves the chronological activity log events for a specific incident.
 * Provides a full audit trail of all actions taken on the incident.
 *
 * @param id - The incident ID
 * @param user - The user requesting the timeline
 * @returns An array of activity log documents sorted ascending by timestamp
 * @throws ApiError if not found or access is denied
 */
export const getIncidentTimeline = async (id: string, user: JwtAccessPayload) => {
  const incident = await Incident.findById(id);
  if (!incident) throw ApiError.notFound("Incident not found");

  // Customers can only see timeline of incidents they reported
  if (user.role === "customer" && incident.reportedBy.toString() !== user.userId) {
    throw ApiError.forbidden("Access denied");
  }

  const timeline = await mongoose.connection.collection("activitylogs")
    .find({ "metadata.incidentId": new mongoose.Types.ObjectId(id) })
    .sort({ createdAt: 1 })
    .toArray();

  return timeline;
};

/**
 * Generate Incident Report
 * Returns a comprehensive structured report for an incident.
 * In production this could be used to generate a PDF (e.g. via puppeteer or pdfmake).
 * Includes all populated fields, notes array, and full activity timeline.
 *
 * @param id - The incident ID
 * @param user - The user requesting the report (must be operator or admin)
 * @returns A report object with incident data, notes, timeline, and summary stats
 * @throws ApiError if not found or user role is customer
 */
export const getIncidentReport = async (id: string, user: JwtAccessPayload) => {
  if (user.role === "customer") {
    throw ApiError.forbidden("Customers cannot generate incident reports");
  }

  const incident = await Incident.findById(id)
    .populate("reportedBy", "name email phone")
    .populate("assignedTo", "name email phone")
    .populate("cameraId", "name serialNumber location")
    .populate("notes.addedBy", "name role")
    .lean();

  if (!incident) throw ApiError.notFound("Incident not found");

  const timeline = await mongoose.connection.collection("activitylogs")
    .find({ "metadata.incidentId": new mongoose.Types.ObjectId(id) })
    .sort({ createdAt: 1 })
    .toArray();

  return {
    generatedAt: new Date().toISOString(),
    incident,
    timeline,
    summary: {
      totalNotes: incident.notes?.length ?? 0,
      totalAttachments: incident.attachments?.length ?? 0,
      isVerified: incident.isVerified ?? false,
      status: incident.status,
      severity: incident.severity,
    },
  };
};
