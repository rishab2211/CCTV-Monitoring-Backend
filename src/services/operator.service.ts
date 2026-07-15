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
      resolvedBy: user.userId, 
      status: "resolved",
      resolvedAt: { $gte: activeShift.startTime, $lte: endTime } 
    }),
    SosAlert.countDocuments({
      acknowledgedBy: user.userId,
      status: "acknowledged",
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
  if (user.role !== "super_admin" && user.role !== "admin" && user.role !== "franchise") {
    throw ApiError.forbidden("You do not have permission to assign cameras");
  }

  const operator = await User.findOne({ _id: operatorId, role: "operator", isDeleted: false });
  if (!operator) throw ApiError.notFound("Operator not found");

  // Validate cameras
  const cameras = await Camera.find({ _id: { $in: cameraIds }, isDeleted: false });
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
  } else if (operatorId) {
    filter.operatorId = operatorId;
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

  const operator = await User.findOne({ _id: operatorId, role: "operator", isDeleted: false });
  if (!operator) throw ApiError.notFound("Operator not found");

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
