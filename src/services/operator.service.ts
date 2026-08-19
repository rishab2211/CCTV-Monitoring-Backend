/**
 * @file operator.service.ts
 * @description Business logic for Operator Module (Shifts, Camera Assignments, Metrics).
 */
import mongoose from "mongoose";
import { User } from "../models/User";
import { Camera } from "../models/Camera";
import { OperatorShift } from "../models/OperatorShift";
import { Incident } from "../models/Incident";
import { SosAlert } from "../models/SosAlert";
import { ApiError } from "../utils/ApiError";
import { JwtAccessPayload } from "../types";
import { logActivity } from "../models/ActivityLog";
import * as notificationService from "./notification.service";
import { socketService } from "./socket.service";

/**
 * Clock In an Operator
 * Checks if they are already on shift. If not, sets isOnShift to true and creates a shift record.
 */
export const clockIn = async (user: JwtAccessPayload) => {
  if (user.role !== "operator") {
    throw ApiError.forbidden("Only operators can clock in");
  }

  const operator = await User.findById(user.userId);
  if (!operator || operator.isDeleted) throw ApiError.notFound("Operator not found");

  if (operator.operatorDetails?.isOnShift) {
    throw ApiError.badRequest("You are already clocked in");
  }

  // Update User
  if (!operator.operatorDetails) {
    operator.operatorDetails = { isOnShift: true };
  } else {
    operator.operatorDetails.isOnShift = true;
    operator.operatorDetails.shiftStart = new Date().toISOString(); // Optional historical string tracking
  }
  await operator.save();

  // Create Shift
  const shift = await OperatorShift.create({
    operatorId: operator._id,
    startTime: new Date(),
  });

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "OPERATOR_CLOCKED_IN",
    description: "Operator clocked in for their shift",
    metadata: { shiftId: shift._id },
  });

  return shift;
};

/**
 * Clock Out an Operator
 * Calculates how many incidents and SOS alerts they handled during this shift.
 * Broadcasts handoverNotes to other online operators via Socket.io.
 */
export const clockOut = async (handoverNotes: string | undefined, user: JwtAccessPayload) => {
  if (user.role !== "operator") {
    throw ApiError.forbidden("Only operators can clock out");
  }

  const operator = await User.findById(user.userId);
  if (!operator || !operator.operatorDetails?.isOnShift) {
    throw ApiError.badRequest("You are not currently clocked in");
  }

  const activeShift = await OperatorShift.findOne({ operatorId: user.userId, endTime: { $exists: false } }).sort({ startTime: -1 });
  if (!activeShift) {
    throw ApiError.badRequest("No active shift found to clock out from");
  }

  const endTime = new Date();
  
  // Calculate Metrics for the duration of this shift
  const [incidentsResolved, sosAcknowledged] = await Promise.all([
    Incident.countDocuments({ 
      assignedTo: user.userId, 
      status: { $in: ["resolved", "closed"] },
      updatedAt: { $gte: activeShift.startTime, $lte: endTime } 
    }),
    SosAlert.countDocuments({
      acknowledgedBy: user.userId,
      acknowledgedAt: { $gte: activeShift.startTime, $lte: endTime }
    })
  ]);

  activeShift.endTime = endTime;
  activeShift.handoverNotes = handoverNotes;
  activeShift.metrics = { incidentsResolved, sosAcknowledged };
  await activeShift.save();

  // Update User
  operator.operatorDetails.isOnShift = false;
  operator.operatorDetails.shiftEnd = endTime.toISOString();
  await operator.save();

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "OPERATOR_CLOCKED_OUT",
    description: "Operator clocked out",
    metadata: { shiftId: activeShift._id, metrics: activeShift.metrics },
  });

  // Broadcast handover notes to other operators if provided
  if (handoverNotes) {
    // For simplicity, broadcast globally. Client logic can filter for operator role.
    socketService.emitGlobal("shift_handover", {
      from: operator.name,
      notes: handoverNotes,
      timestamp: endTime
    });
  }

  return activeShift;
};

/**
 * Bulk Assign Cameras to an Operator
 * Updates both the Operator's profile and the Cameras.
 */
export const assignCameras = async (operatorId: string, cameraIds: string[], user: JwtAccessPayload) => {
  if (user.role !== "super_admin" && user.role !== "admin" && user.role !== "franchise" && user.role !== "franchise_admin") {
    throw ApiError.forbidden("You do not have permission to assign cameras");
  }

  const operatorFilter: any = { _id: operatorId, role: "operator", isDeleted: false };
  if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId) throw ApiError.forbidden("No active franchise found");
    operatorFilter["operatorDetails.assignedFranchise"] = new mongoose.Types.ObjectId(user.franchiseId);
  }

  const operator = await User.findOne(operatorFilter);
  if (!operator) throw ApiError.notFound("Operator not found or belongs to another franchise");

  // Validate cameras
  const cameraFilter: any = { _id: { $in: cameraIds }, isDeleted: false };
  if (user.role === "franchise" || user.role === "franchise_admin") {
    cameraFilter.franchiseId = new mongoose.Types.ObjectId(user.franchiseId);
  }
  
  const cameras = await Camera.find(cameraFilter);
  if (cameras.length !== cameraIds.length) {
    throw ApiError.badRequest("One or more provided Camera IDs are invalid or deleted");
  }

  const objectIds = cameras.map(c => c._id);

  // Update Operator
  if (!operator.operatorDetails) {
    operator.operatorDetails = { assignedCameras: objectIds as any };
  } else {
    operator.operatorDetails.assignedCameras = objectIds as any;
  }
  await operator.save();

  // Update Cameras (Add this operator to their operatorIds if not already present)
  // For simplicity, we push to `operatorIds` (as a set)
  await Camera.updateMany(
    { _id: { $in: objectIds } },
    { $addToSet: { operatorIds: operator._id } }
  );

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "OPERATOR_CAMERAS_ASSIGNED",
    description: `Assigned ${cameras.length} cameras to Operator ${operator.name}`,
    metadata: { operatorId, cameraIds },
  });

  // Push Notification to the Operator
  await notificationService.sendNotification(
    operatorId,
    "New Cameras Assigned",
    `You have been assigned ${cameras.length} new cameras to monitor.`,
    "system"
  ).catch(() => {});

  return operator;
};

/**
 * List Historical Shifts
 */
export const listShifts = async (query: any, user: JwtAccessPayload) => {
  const { page, limit, operatorId } = query;
  const filter: any = {};

  if (user.role === "operator") {
    filter.operatorId = user.userId; // Operators only see their own shifts
  } else if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId) throw ApiError.forbidden("No active franchise found");
    const operators = await User.find({ "operatorDetails.assignedFranchise": user.franchiseId, role: "operator" }).select("_id");
    const operatorIds = operators.map(op => op._id);
    
    if (operatorId) {
      if (!operatorIds.some(id => id.toString() === operatorId.toString())) {
        throw ApiError.forbidden("Operator does not belong to your franchise");
      }
      filter.operatorId = operatorId;
    } else {
      filter.operatorId = { $in: operatorIds };
    }
  } else if (user.role === "super_admin" || user.role === "admin") {
    if (operatorId) {
      filter.operatorId = operatorId;
    }
  } else {
    throw ApiError.forbidden("You do not have permission to view shifts");
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [shifts, total] = await Promise.all([
    OperatorShift.find(filter)
      .populate("operatorId", "name email")
      .skip(skip)
      .limit(Number(limit))
      .sort({ startTime: -1 })
      .lean(),
    OperatorShift.countDocuments(filter),
  ]);

  return { shifts, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) };
};

/**
 * Get Operator Performance Metrics (All-time or overall)
 */
export const getOperatorPerformance = async (operatorId: string, user: JwtAccessPayload) => {
  // Access control
  if (user.role === "operator" && user.userId !== operatorId) {
    throw ApiError.forbidden("You can only view your own performance");
  }
  if (user.role !== "super_admin" && user.role !== "admin" && user.role !== "franchise" && user.role !== "franchise_admin" && user.role !== "operator") {
    throw ApiError.forbidden("You do not have permission to view performance");
  }

  const query: any = { _id: operatorId, role: "operator", isDeleted: false };
  if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId) throw ApiError.forbidden("No active franchise found");
    query["operatorDetails.assignedFranchise"] = new mongoose.Types.ObjectId(user.franchiseId);
  }

  const operator = await User.findOne(query);
  if (!operator) throw ApiError.notFound("Operator not found or belongs to another franchise");

  // Aggregate all historical shifts for this operator
  const aggregation = await OperatorShift.aggregate([
    { $match: { operatorId: operator._id } },
    { 
      $group: { 
        _id: "$operatorId",
        totalShifts: { $sum: 1 },
        totalIncidentsResolved: { $sum: "$metrics.incidentsResolved" },
        totalSosAcknowledged: { $sum: "$metrics.sosAcknowledged" },
      }
    }
  ]);

  const stats = aggregation[0] || {
    totalShifts: 0,
    totalIncidentsResolved: 0,
    totalSosAcknowledged: 0
  };

  return {
    operator: {
      name: operator.name,
      email: operator.email,
      isOnShift: operator.operatorDetails?.isOnShift || false,
      assignedCamerasCount: operator.operatorDetails?.assignedCameras?.length || 0
    },
    performance: stats
  };
};

/**
 * Get Operator Dashboard
 * Returns a comprehensive at-a-glance summary for the operator panel:
 * shift status, assigned camera count, open incidents, active SOS, and recent alerts.
 *
 * @param user - The authenticated operator
 * @returns Dashboard summary object
 */
export const getOperatorDashboard = async (user: JwtAccessPayload) => {
  if (user.role !== "operator") throw ApiError.forbidden("Operators only");

  const operator = await User.findById(user.userId).lean();
  if (!operator) throw ApiError.notFound("Operator not found");

  const assignedCameraIds = operator.operatorDetails?.assignedCameras ?? [];

  const [assignedCameras, openIncidents, activeSos, activeShift] = await Promise.all([
    Camera.countDocuments({ _id: { $in: assignedCameraIds }, isDeleted: false }),
    Incident.countDocuments({ assignedTo: user.userId, status: { $in: ["open", "in_progress"] } }),
    SosAlert.countDocuments({ status: { $in: ["active", "acknowledged"] } }),
    OperatorShift.findOne({ operatorId: user.userId, endTime: { $exists: false } }).lean(),
  ]);

  return {
    operator: { name: operator.name, email: operator.email, isOnShift: operator.operatorDetails?.isOnShift || false },
    shift: activeShift
      ? { shiftId: activeShift._id, startTime: activeShift.startTime, durationMs: Date.now() - new Date(activeShift.startTime).getTime() }
      : null,
    stats: { assignedCameras, openIncidents, activeSos },
  };
};

/**
 * Get Operator's Assigned Cameras
 * Returns the full Camera documents for all cameras assigned to this operator.
 *
 * @param user - The authenticated operator
 * @returns Array of Camera documents
 */
export const getAssignedCameras = async (user: JwtAccessPayload) => {
  if (user.role !== "operator") throw ApiError.forbidden("Operators only");

  const operator = await User.findById(user.userId).lean();
  if (!operator) throw ApiError.notFound("Operator not found");

  const assignedCameraIds = operator.operatorDetails?.assignedCameras ?? [];

  const cameras = await Camera.find({ _id: { $in: assignedCameraIds }, isDeleted: false })
    .select("name serialNumber location status streamUrl")
    .lean();

  return cameras;
};

/**
 * Get Pending Alerts
 * Returns all `pending` (unacknowledged) alerts for cameras assigned to this operator.
 *
 * @param user - The authenticated operator
 * @returns Array of pending Alert documents
 */
export const getPendingAlerts = async (user: JwtAccessPayload) => {
  if (user.role !== "operator") throw ApiError.forbidden("Operators only");

  const operator = await User.findById(user.userId).lean();
  if (!operator) throw ApiError.notFound("Operator not found");

  const assignedCameraIds = operator.operatorDetails?.assignedCameras ?? [];

  // Import Alert dynamically to avoid circular dep; use require-style import from model path
  const { Alert } = await import("../models/Alert");
  const alerts = await Alert.find({ cameraId: { $in: assignedCameraIds }, status: "new" })
    .populate("cameraId", "name serialNumber location")
    .sort({ createdAt: -1 })
    .lean();

  return alerts;
};

/**
 * Get Active Alerts
 * Returns all `acknowledged` (in-progress) alerts for cameras assigned to this operator.
 *
 * @param user - The authenticated operator
 * @returns Array of active Alert documents
 */
export const getActiveAlerts = async (user: JwtAccessPayload) => {
  if (user.role !== "operator") throw ApiError.forbidden("Operators only");

  const operator = await User.findById(user.userId).lean();
  if (!operator) throw ApiError.notFound("Operator not found");

  const assignedCameraIds = operator.operatorDetails?.assignedCameras ?? [];

  const { Alert } = await import("../models/Alert");
  const alerts = await Alert.find({ cameraId: { $in: assignedCameraIds }, status: "acknowledged" })
    .populate("cameraId", "name serialNumber location")
    .sort({ updatedAt: -1 })
    .lean();

  return alerts;
};

/**
 * Get Operator Calls (Talkback Sessions)
 * Returns recent talkback sessions initiated from cameras assigned to this operator.
 *
 * @param user - The authenticated operator
 * @returns Array of TalkbackSession documents
 */
export const getOperatorCalls = async (user: JwtAccessPayload) => {
  if (user.role !== "operator") throw ApiError.forbidden("Operators only");

  const operator = await User.findById(user.userId).lean();
  if (!operator) throw ApiError.notFound("Operator not found");

  const assignedCameraIds = operator.operatorDetails?.assignedCameras ?? [];

  const { TalkbackSession } = await import("../models/TalkbackSession");
  const calls = await TalkbackSession.find({ cameraId: { $in: assignedCameraIds } })
    .populate("cameraId", "name serialNumber location")
    .populate("operatorId", "name role")
    .sort({ startedAt: -1 })
    .limit(50)
    .lean();

  return calls;
};

/**
 * Get Shift Status
 * Returns the operator's current shift state: active shift details if on shift, or last shift info.
 *
 * @param user - The authenticated operator
 * @returns Shift status object
 */
export const getShiftStatus = async (user: JwtAccessPayload) => {
  if (user.role !== "operator") throw ApiError.forbidden("Operators only");

  const operator = await User.findById(user.userId).lean();
  if (!operator) throw ApiError.notFound("Operator not found");

  const isOnShift = operator.operatorDetails?.isOnShift || false;

  if (isOnShift) {
    // Find active shift (no endTime)
    const activeShift = await OperatorShift.findOne({ operatorId: user.userId, endTime: { $exists: false } })
      .sort({ startTime: -1 })
      .lean();

    return {
      isOnShift: true,
      currentShift: activeShift,
      durationMs: activeShift ? Date.now() - new Date(activeShift.startTime).getTime() : null,
    };
  }

  // Not on shift — return the most recent completed shift
  const lastShift = await OperatorShift.findOne({ operatorId: user.userId, endTime: { $exists: true } })
    .sort({ endTime: -1 })
    .lean();

  return { isOnShift: false, lastShift };
};

/**
 * Get Operator Event Timeline
 * Returns a chronological list of recent activity log entries for this operator:
 * alert acknowledgements, SOS events, incidents handled, and shift events.
 *
 * @param user - The authenticated operator
 * @returns Array of ActivityLog entries (most recent first)
 */
export const getOperatorTimeline = async (user: JwtAccessPayload) => {
  if (user.role !== "operator") throw ApiError.forbidden("Operators only");

  const { ActivityLog } = await import("../models/ActivityLog");

  const events = await ActivityLog.find({ userId: user.userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return events;
};

/**
 * Get Operator Reports
 * Returns a structured performance report for the operator:
 * per-shift metrics, totals, and overall resolution rate.
 *
 * @param user - The authenticated operator
 * @returns Reports object with shift breakdown and aggregated totals
 */
export const getOperatorReports = async (user: JwtAccessPayload) => {
  if (user.role !== "operator") throw ApiError.forbidden("Operators only");

  const operator = await User.findById(user.userId).lean();
  if (!operator) throw ApiError.notFound("Operator not found");

  // Get last 30 shifts
  const shifts = await OperatorShift.find({ operatorId: user.userId })
    .sort({ startTime: -1 })
    .limit(30)
    .lean();

  // Aggregate totals
  const totalIncidentsResolved = shifts.reduce((sum, s) => sum + (s.metrics?.incidentsResolved || 0), 0);
  const totalSosAcknowledged = shifts.reduce((sum, s) => sum + (s.metrics?.sosAcknowledged || 0), 0);
  const totalShifts = shifts.length;

  return {
    operatorName: operator.name,
    generatedAt: new Date().toISOString(),
    summary: {
      totalShifts,
      totalIncidentsResolved,
      totalSosAcknowledged,
      avgIncidentsPerShift: totalShifts > 0 ? (totalIncidentsResolved / totalShifts).toFixed(2) : 0,
    },
    shifts: shifts.map((s) => ({
      shiftId: s._id,
      startTime: s.startTime,
      endTime: s.endTime,
      durationMs: s.endTime ? new Date(s.endTime).getTime() - new Date(s.startTime).getTime() : null,
      metrics: s.metrics,
      handoverNotes: s.handoverNotes,
    })),
  };
};
