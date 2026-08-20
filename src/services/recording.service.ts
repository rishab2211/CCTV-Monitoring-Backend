/**
 * @file recording.service.ts
 * @description Core business logic for VOD (Video on Demand) recordings,
 * including chunk lifecycle, schedule management, timeline generation, and retention pruning.
 */
import mongoose from "mongoose";
import { Recording } from "../models/Recording";
import { RecordingSchedule } from "../models/RecordingSchedule";
import { SystemSetting } from "../models/SystemSetting";
import { Camera } from "../models/Camera";
import { ApiError } from "../utils/ApiError";
import { parsePaginationParams } from "../utils/pagination";
import { JwtAccessPayload } from "../types";
import { validateCameraAccess } from "./camera.service";
import { logActivity } from "../models/ActivityLog";
import { logger } from "../utils/logger";

// ─── Recording Chunks (CRUD) ──────────────────────────────────────────────────

/**
 * Create Recording Chunk
 * System/Internal endpoint to log a new recording chunk.
 * Called by external FFmpeg processes when a chunk finishes writing.
 * 
 * @param data - The chunk metadata (S3 URL, duration, timestamps)
 */
export const createRecordingChunk = async (data: any) => {
  const camera = await Camera.findOne({ _id: data.cameraId, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");

  const recording = await Recording.create({
    ...data,
    franchiseId: camera.franchiseId,
  });
  return recording;
};

/**
 * List Recordings
 * Retrieves paginated video chunks. Filters are strictly validated against RBAC rules.
 * Operators can only view chunks for assigned cameras.
 * 
 * @param query - Pagination and filtering rules
 * @param user - The requesting user
 */
export const listRecordings = async (query: any, user: JwtAccessPayload) => {
  const { page, limit } = parsePaginationParams(query);
  const { cameraId, type, status, startDate, endDate } = query;
  const filter: any = {};

  if (cameraId) {
    const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
    if (!camera) throw ApiError.notFound("Camera");
    await validateCameraAccess(camera, user);
    filter.cameraId = cameraId;
  } else if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId) throw ApiError.forbidden("No franchise associated with your account");
    filter.franchiseId = user.franchiseId;
  } else if (user.role !== "super_admin" && user.role !== "admin") {
    // If no cameraId provided, non-admins can only see their assigned cameras
    const userObjId = new mongoose.Types.ObjectId(user.userId);
    const accessibleCameras = await Camera.find({
      $or: [
        { operatorIds: userObjId },
        { customerId: userObjId },
      ],
      isDeleted: false,
    }).select("_id");
    filter.cameraId = { $in: accessibleCameras.map((c) => c._id) };
  }

  if (type) filter.type = type;
  if (status) filter.status = status;
  if (startDate || endDate) {
    filter.startTime = {};
    if (startDate) filter.startTime.$gte = new Date(startDate);
    if (endDate) filter.startTime.$lte = new Date(endDate);
  }

  const skip = (page - 1) * limit;
  const [recordings, total] = await Promise.all([
    Recording.find(filter)
      .populate("cameraId", "name serialNumber")
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Recording.countDocuments(filter),
  ]);

  return { recordings, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Get Recording Details
 * Fetches the specific VOD chunk metadata, validating ownership via the populated camera.
 * 
 * @param id - The recording ID
 * @param user - The requesting user
 */
export const getRecordingDetails = async (id: string, user: JwtAccessPayload) => {
  const recording = await Recording.findById(id).populate("cameraId", "name serialNumber operatorIds customerId");
  if (!recording) throw ApiError.notFound("Recording");

  const rawCameraId = (recording.cameraId as any)?._id || recording.cameraId;
  const camera = await Camera.findById(rawCameraId).lean();
  if (camera) {
    await validateCameraAccess(camera as any, user);
  }

  return recording;
};

/**
 * Delete Recording
 * Soft deletes a recording chunk to preserve logs, removing it from frontend timelines.
 * 
 * @param id - The recording ID
 * @param user - The requesting user
 */
export const deleteRecording = async (id: string, user: JwtAccessPayload) => {
  const recording = await Recording.findById(id);
  if (!recording) throw ApiError.notFound("Recording");

  const camera = await Camera.findById(recording.cameraId);
  if (camera) {
    await validateCameraAccess(camera, user);
  } else if (user.role !== "super_admin" && user.role !== "admin") {
    throw ApiError.forbidden("Cannot delete recording for unverified camera");
  }

  // Soft delete in DB
  recording.status = "deleted";
  await recording.save();

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "RECORDING_DELETED",
    description: `Recording chunk deleted`,
    metadata: { recordingId: id },
  });

  return recording;
};

// ─── Playback & Timeline ──────────────────────────────────────────────────────

export const getPlaybackChunks = async (cameraId: string, start: string, end: string, user: JwtAccessPayload) => {
  const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");
  await validateCameraAccess(camera, user);

  // Find chunks that overlap with the requested time range
  const chunks = await Recording.find({
    cameraId,
    status: { $in: ["recording", "completed"] },
    $or: [
      { startTime: { $lte: new Date(end), $gte: new Date(start) } }, // Starts in range
      { endTime: { $gte: new Date(start), $lte: new Date(end) } },   // Ends in range
      { startTime: { $lte: new Date(start) }, endTime: { $gte: new Date(end) } }, // Encompasses range
    ],
  })
    .sort({ startTime: 1 })
    .select("startTime endTime url durationSeconds sizeBytes type")
    .lean();

  return chunks;
};

/**
 * Get Timeline
 * Generates an aggregated timeline of video chunks for a specific camera and date range.
 * Useful for the frontend VOD scrubbing bar.
 * 
 * @param cameraId - The target camera ID
 * @param dateStr - Target date in YYYY-MM-DD format
 * @param user - The requesting user
 */
export const getTimeline = async (cameraId: string, dateStr: string, user: JwtAccessPayload) => {
  const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");
  await validateCameraAccess(camera, user);

  // dateStr is YYYY-MM-DD
  const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
  const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

  const chunks = await Recording.find({
    cameraId,
    status: { $in: ["recording", "completed"] },
    startTime: { $gte: startOfDay, $lte: endOfDay },
  })
    .sort({ startTime: 1 })
    .select("startTime endTime durationSeconds type url")
    .lean();

  // Optionally calculate gaps here or let client do it
  return chunks;
};

// ─── Storage & Retention ──────────────────────────────────────────────────────

export const updateRetentionPolicy = async (days: number, user: JwtAccessPayload) => {
  const setting = await SystemSetting.findOneAndUpdate(
    { key: "recording_retention_days" },
    { value: days, description: "Global recording retention policy in days" },
    { upsert: true, new: true }
  );

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "RETENTION_UPDATED",
    description: `Global retention policy updated to ${days} days`,
  });

  return setting;
};

export const getStorageStats = async () => {
  // Aggregate total size Bytes
  const result = await Recording.aggregate([
    { $match: { status: { $ne: "deleted" } } },
    { $group: { _id: null, totalBytes: { $sum: "$sizeBytes" }, chunkCount: { $sum: 1 } } },
  ]);

  const stats = result[0] || { totalBytes: 0, chunkCount: 0 };
  return {
    totalBytes: stats.totalBytes,
    totalGb: (stats.totalBytes / (1024 ** 3)).toFixed(2),
    chunkCount: stats.chunkCount,
  };
};

// ─── Scheduling ───────────────────────────────────────────────────────────────

/**
 * Update Schedule
 * Modifies the recording schedule rules for a camera. Uses upsert logic.
 * 
 * @param cameraId - The target camera ID
 * @param rules - Array of schedule rules (days, times, recording type)
 * @param user - The requesting user
 */
export const updateSchedule = async (cameraId: string, rules: any[], user: JwtAccessPayload) => {
  const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");
  await validateCameraAccess(camera, user);

  const schedule = await RecordingSchedule.findOneAndUpdate(
    { cameraId },
    { rules },
    { upsert: true, new: true }
  );

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "SCHEDULE_UPDATED",
    description: `Recording schedule updated for camera ${camera.name}`,
    metadata: { cameraId },
  });

  return schedule;
};

/**
 * Get Schedule
 * Retrieves the recording schedule rules for a specific camera.
 * 
 * @param cameraId - The target camera ID
 * @param user - The requesting user
 */
export const getSchedule = async (cameraId: string, user: JwtAccessPayload) => {
  const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");
  await validateCameraAccess(camera, user);

  const schedule = await RecordingSchedule.findOne({ cameraId });
  return schedule || { cameraId, rules: [] }; // Return empty schedule if none exists
};

/**
 * Delete Schedule
 * Removes automated recording schedules for a camera.
 * 
 * @param cameraId - The target camera ID
 * @param user - The requesting user
 */
export const deleteSchedule = async (cameraId: string, user: JwtAccessPayload) => {
  const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");
  await validateCameraAccess(camera, user);

  await RecordingSchedule.findOneAndDelete({ cameraId });

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "SCHEDULE_UPDATED",
    description: `Recording schedule deleted for camera ${camera.name}`,
    metadata: { cameraId },
  });

  return { message: "Schedule deleted successfully" };
};
