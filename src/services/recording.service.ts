/**
 * @file recording.service.ts
 * @description Core production business logic for VOD (Video on Demand) recordings,
 * chunk lifecycle, high-performance HTTP 206 partial content streaming, schedule management,
 * synchronized timeline generation, and retention pruning.
 */
import fs from "fs";
import path from "path";
import { Request, Response } from "express";
import mongoose from "mongoose";
import { Recording } from "../models/Recording";
import { RecordingSchedule } from "../models/RecordingSchedule";
import { SystemSetting } from "../models/SystemSetting";
import { Camera } from "../models/Camera";
import { ApiError } from "../utils/ApiError";
import { parsePaginationParams } from "../utils/pagination";
import { IRecordingScheduleRule, JwtAccessPayload, ListRecordingsQuery } from "../types";
import { validateCameraAccess } from "./camera.service";
import { logActivity } from "../models/ActivityLog";
import { logger } from "../utils/logger";
import {
  generatePresignedPlaybackUrl,
  generatePresignedDownloadUrl,
  deleteRecordingObjects,
  isStorageConfigured,
} from "../config/storage";
import { triggerImmediateScheduleSync } from "./recording-scheduler.service";

// ─── Recording Chunks (CRUD) ──────────────────────────────────────────────────

/**
 * Create Recording Chunk
 * System/Internal endpoint to log a new recording chunk.
 * Called by recording sweeper or external ingestion processes.
 */
export const createRecordingChunk = async (data: any) => {
  const camera = await Camera.findOne({ _id: data.cameraId, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");

  let expiresAt = data.expiresAt;
  if (!expiresAt) {
    const retentionDays = camera.settings?.recordingRetentionDays ?? 30;
    const baseTime = data.startTime ? new Date(data.startTime).getTime() : Date.now();
    expiresAt = new Date(baseTime + retentionDays * 24 * 60 * 60 * 1000);
  }

  const recording = await Recording.create({
    ...data,
    franchiseId: camera.franchiseId,
    expiresAt,
  });
  return recording;
};

/**
 * List Recordings
 * Retrieves paginated video chunks with accurate camera names and signed/stream URLs.
 * RBAC validated: Non-admins only see assigned/owned camera footage.
 */
export const listRecordings = async (
  query: ListRecordingsQuery,
  user: JwtAccessPayload
): Promise<{ recordings: any[]; total: number; page: number; limit: number; totalPages: number }> => {
  const { page, limit } = parsePaginationParams(query as unknown as Record<string, unknown>);
  const { cameraId, type, status, startDate, endDate } = query as any;
  const filter: Record<string, unknown> = {};

  if (cameraId) {
    const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
    if (!camera) throw ApiError.notFound("Camera");
    await validateCameraAccess(camera, user);
    filter.cameraId = cameraId;
  } else if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId) throw ApiError.forbidden("No franchise associated with your account");
    filter.franchiseId = user.franchiseId;
  } else if (user.role !== "super_admin" && user.role !== "admin") {
    const userObjId = new mongoose.Types.ObjectId(user.userId);
    const accessibleCameras = await Camera.find({
      $or: [
        { operatorIds: userObjId },
        { customerId: userObjId },
        { sharedWith: userObjId },
      ],
      isDeleted: false,
    }).select("_id");

    filter.cameraId = { $in: accessibleCameras.map((c) => c._id) };
  }

  if (type) filter.type = type;
  if (status) filter.status = status;

  // Handle date filters flexibly (both YYYY-MM-DD and ISO 8601 strings)
  if (startDate || endDate) {
    const timeFilter: Record<string, Date> = {};
    if (startDate) {
      const parsedStart = new Date(startDate.length === 10 ? `${startDate}T00:00:00.000Z` : startDate);
      if (!isNaN(parsedStart.getTime())) {
        timeFilter.$gte = parsedStart;
      }
    }
    if (endDate) {
      const parsedEnd = new Date(endDate.length === 10 ? `${endDate}T23:59:59.999Z` : endDate);
      if (!isNaN(parsedEnd.getTime())) {
        timeFilter.$lte = parsedEnd;
      }
    }
    if (Object.keys(timeFilter).length > 0) {
      filter.startTime = timeFilter;
    }
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

  // Attach pre-signed URLs or stream URLs and map top-level cameraName for frontend tables
  const signedRecordings = await Promise.all(
    recordings.map(async (rec) => {
      let playbackUrl = rec.url;
      if (rec.s3Key && isStorageConfigured()) {
        try {
          playbackUrl = await generatePresignedPlaybackUrl(rec.s3Key, 3600);
        } catch (err) {
          logger.warn(`Failed to sign URL for recording ${rec._id}: ${(err as Error).message}`);
        }
      } else if (!rec.url || !rec.url.startsWith("http")) {
        playbackUrl = `/api/v1/recordings/${rec._id}/stream`;
      }

      const cam = rec.cameraId as any;
      return {
        ...rec,
        cameraName: cam?.name || "Camera Unit",
        url: playbackUrl,
        playbackUrl,
      };
    })
  );

  return { recordings: signedRecordings, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Get Recording Details
 * Fetches specific metadata for a single VOD chunk, populating camera ownership.
 */
export const getRecordingDetails = async (id: string, user: JwtAccessPayload) => {
  const recording = await Recording.findById(id).populate("cameraId", "name serialNumber operatorIds customerId");
  if (!recording) throw ApiError.notFound("Recording");

  const rawCameraId = (recording.cameraId as any)?._id || recording.cameraId;
  const camera = await Camera.findById(rawCameraId).lean();
  if (camera) {
    await validateCameraAccess(camera as any, user);
  }

  const recObj = recording.toObject();
  let playbackUrl = recording.url;

  if (recording.s3Key && isStorageConfigured()) {
    try {
      playbackUrl = await generatePresignedPlaybackUrl(recording.s3Key, 3600);
    } catch (err) {
      logger.warn(`Failed to sign URL for recording ${id}: ${(err as Error).message}`);
    }
  } else if (!recording.url || !recording.url.startsWith("http")) {
    playbackUrl = `/api/v1/recordings/${id}/stream`;
  }

  recObj.url = playbackUrl;
  (recObj as any).playbackUrl = playbackUrl;
  (recObj as any).cameraName = (recording.cameraId as any)?.name || "Camera Unit";

  return recObj;
};

/**
 * Stream Video Recording
 * Production-grade video delivery pipeline.
 * - If video is in S3/R2: redirects (302) to pre-signed URL.
 * - If video is local: streams file with HTTP 206 Partial Content (Range requests)
 *   enabling smooth HTML5 browser scrubbing, seeking, and playback.
 */
export const streamRecording = async (
  id: string,
  req: Request,
  res: Response,
  user: JwtAccessPayload
): Promise<void> => {
  const recording = await Recording.findById(id).populate("cameraId", "name serialNumber operatorIds customerId");
  if (!recording) throw ApiError.notFound("Recording");

  const rawCameraId = (recording.cameraId as any)?._id || recording.cameraId;
  const camera = await Camera.findById(rawCameraId).lean();
  if (camera) {
    await validateCameraAccess(camera as any, user);
  }

  // 1. Cloud Storage Redirection
  if (recording.s3Key && isStorageConfigured()) {
    const signedUrl = await generatePresignedPlaybackUrl(recording.s3Key, 3600);
    res.setHeader("Cache-Control", "private, max-age=1800");
    res.redirect(302, signedUrl);
    return;
  }

  // 2. Local File Streaming with Byte-Range Support
  let filePath = recording.localPath;

  // Fallback: check if file is located in the local recordings folder
  if (!filePath || !fs.existsSync(filePath)) {
    if (recording.url && !recording.url.startsWith("http") && !recording.url.startsWith("/api")) {
      const candidate = path.resolve(process.cwd(), recording.url);
      if (fs.existsSync(candidate)) filePath = candidate;
    }
  }

  if (!filePath || !fs.existsSync(filePath)) {
    throw ApiError.notFound("Video recording file not found on local or cloud storage");
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const isDownload = req.query.download === "true";
  const downloadFileName =
    (req.query.filename as string) ||
    `${(camera?.name || "camera").replace(/[^a-zA-Z0-9_-]/g, "_")}_${recording.startTime.toISOString().replace(/[:.]/g, "-")}.mp4`;

  if (isDownload) {
    res.setHeader("Content-Disposition", `attachment; filename="${downloadFileName}"`);
  }

  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Accept-Ranges", "bytes");

  if (range) {
    // Parse Range header: e.g. "bytes=1000-5000"
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize || start > end) {
      res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
      return;
    }

    const chunkSize = end - start + 1;
    const fileStream = fs.createReadStream(filePath, { start, end });

    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
    res.setHeader("Content-Length", chunkSize);

    fileStream.pipe(res);
  } else {
    res.status(200);
    res.setHeader("Content-Length", fileSize);
    fs.createReadStream(filePath).pipe(res);
  }
};

/**
 * Delete Recording
 * Soft deletes a recording chunk to preserve activity logs while removing from frontend timelines.
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

  // If local file exists, physically unlink to free disk space
  if (recording.localPath && fs.existsSync(recording.localPath)) {
    try {
      fs.unlinkSync(recording.localPath);
    } catch (err) {
      logger.warn(`Failed to unlink local recording ${recording.localPath}: ${(err as Error).message}`);
    }
  }

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "RECORDING_DELETED",
    description: `Recording chunk deleted`,
    metadata: { recordingId: id },
  });

  return recording;
};

// ─── Playback & Timeline ──────────────────────────────────────────────────────

export const getPlaybackChunks = async (
  cameraId: string,
  start: string,
  end: string,
  user: JwtAccessPayload
): Promise<any[]> => {
  const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");
  await validateCameraAccess(camera, user);

  const startDate = new Date(start);
  const endDate = new Date(end);

  const chunks = await Recording.find({
    cameraId,
    status: { $in: ["recording", "completed"] },
    $or: [
      { startTime: { $lte: endDate, $gte: startDate } },
      { endTime: { $gte: startDate, $lte: endDate } },
      { startTime: { $lte: startDate }, endTime: { $gte: endDate } },
    ],
  })
    .sort({ startTime: 1 })
    .select("_id startTime endTime url s3Key localPath durationSeconds sizeBytes type")
    .lean();

  const resolvedChunks = await Promise.all(
    chunks.map(async (chunk) => {
      let playbackUrl = chunk.url;
      if (chunk.s3Key && isStorageConfigured()) {
        try {
          playbackUrl = await generatePresignedPlaybackUrl(chunk.s3Key, 3600);
        } catch (err) {
          logger.warn(`Failed to sign URL for chunk ${chunk._id}: ${(err as Error).message}`);
        }
      } else if (!chunk.url || !chunk.url.startsWith("http")) {
        playbackUrl = `/api/v1/recordings/${chunk._id}/stream`;
      }

      return {
        ...chunk,
        _id: chunk._id.toString(),
        recordingId: chunk._id.toString(),
        cameraName: camera.name,
        url: playbackUrl,
        playbackUrl,
      };
    })
  );

  return resolvedChunks;
};

/**
 * Generate Dynamic HLS VOD Playlist (.m3u8)
 * Stitches together consecutive fMP4 chunks across a requested time range into
 * an HLS VOD playlist.
 */
export const generateVodPlaylist = async (
  cameraId: string,
  start: string,
  end: string,
  user: JwtAccessPayload
): Promise<string> => {
  const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");
  await validateCameraAccess(camera, user);

  const startDate = new Date(start);
  const endDate = new Date(end);

  const chunks = await Recording.find({
    cameraId,
    status: "completed",
    $or: [
      { startTime: { $lte: endDate, $gte: startDate } },
      { endTime: { $gte: startDate, $lte: endDate } },
      { startTime: { $lte: startDate }, endTime: { $gte: endDate } },
    ],
  })
    .sort({ startTime: 1 })
    .select("_id startTime endTime url s3Key localPath durationSeconds")
    .lean();

  if (!chunks.length) {
    return [
      "#EXTM3U",
      "#EXT-X-VERSION:7",
      "#EXT-X-TARGETDURATION:120",
      "#EXT-X-MEDIA-SEQUENCE:0",
      "#EXT-X-PLAYLIST-TYPE:VOD",
      "#EXT-X-ENDLIST",
    ].join("\n");
  }

  const maxDuration = Math.max(...chunks.map((c) => c.durationSeconds || 120), 120);

  const lines: string[] = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    `#EXT-X-TARGETDURATION:${Math.ceil(maxDuration)}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-PLAYLIST-TYPE:VOD",
  ];

  for (const chunk of chunks) {
    let chunkUrl = chunk.url;
    if (chunk.s3Key && isStorageConfigured()) {
      try {
        chunkUrl = await generatePresignedPlaybackUrl(chunk.s3Key, 3600);
      } catch (err) {
        logger.warn(`Failed to sign URL for chunk ${chunk._id}: ${(err as Error).message}`);
      }
    } else if (!chunk.url || !chunk.url.startsWith("http")) {
      chunkUrl = `/api/v1/recordings/${chunk._id}/stream`;
    }

    const duration = (chunk.durationSeconds || 120).toFixed(3);
    lines.push(`#EXTINF:${duration},`);
    lines.push(chunkUrl);
  }

  lines.push("#EXT-X-ENDLIST");
  return lines.join("\n");
};

/**
 * Generate Signed Download Link
 * Creates a pre-signed URL with Content-Disposition attachment headers,
 * or direct local stream download URL.
 */
export const generateDownloadUrl = async (id: string, user: JwtAccessPayload): Promise<string> => {
  const recording = await Recording.findById(id).populate("cameraId", "name serialNumber operatorIds customerId");
  if (!recording) throw ApiError.notFound("Recording");

  const rawCameraId = (recording.cameraId as any)?._id || recording.cameraId;
  const camera = await Camera.findById(rawCameraId).lean();
  if (camera) {
    await validateCameraAccess(camera as any, user);
  }

  const camName = (camera?.name || "camera").replace(/[^a-zA-Z0-9_-]/g, "_");
  const timeStr = recording.startTime.toISOString().replace(/[:.]/g, "-");
  const downloadName = `${camName}_${timeStr}.mp4`;

  if (recording.s3Key && isStorageConfigured()) {
    return generatePresignedDownloadUrl(recording.s3Key, downloadName, 3600);
  }

  return `/api/v1/recordings/${id}/stream?download=true&filename=${encodeURIComponent(downloadName)}`;
};

/**
 * Get Timeline
 * Generates an aggregated timeline of video chunks for a specific camera and date range.
 * Fully compatible with Admin Panel TimelineScrubber component.
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
    $or: [
      { startTime: { $gte: startOfDay, $lte: endOfDay } },
      { endTime: { $gte: startOfDay, $lte: endOfDay } },
      { startTime: { $lte: startOfDay }, endTime: { $gte: endOfDay } },
    ],
  })
    .sort({ startTime: 1 })
    .select("_id startTime endTime durationSeconds sizeBytes type url s3Key localPath")
    .lean();

  const resolved = await Promise.all(
    chunks.map(async (chunk) => {
      let playbackUrl = chunk.url;
      if (chunk.s3Key && isStorageConfigured()) {
        try {
          playbackUrl = await generatePresignedPlaybackUrl(chunk.s3Key, 3600);
        } catch {}
      } else if (!chunk.url || !chunk.url.startsWith("http")) {
        playbackUrl = `/api/v1/recordings/${chunk._id}/stream`;
      }

      return {
        _id: chunk._id.toString(),
        recordingId: chunk._id.toString(),
        cameraId,
        cameraName: camera.name,
        startTime: chunk.startTime.toISOString(),
        endTime: chunk.endTime
          ? chunk.endTime.toISOString()
          : new Date(chunk.startTime.getTime() + (chunk.durationSeconds || 120) * 1000).toISOString(),
        durationSeconds: chunk.durationSeconds || 120,
        type: chunk.type,
        sizeBytes: chunk.sizeBytes,
        url: playbackUrl,
        playbackUrl,
      };
    })
  );

  return resolved;
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
  const result = await Recording.aggregate([
    { $match: { status: { $ne: "deleted" } } },
    { $group: { _id: null, totalBytes: { $sum: "$sizeBytes" }, chunkCount: { $sum: 1 } } },
  ]);

  const stats = result[0] || { totalBytes: 0, chunkCount: 0 };
  return {
    totalBytes: stats.totalBytes,
    totalGb: (stats.totalBytes / 1024 ** 3).toFixed(2),
    chunkCount: stats.chunkCount,
  };
};

// ─── Scheduling ───────────────────────────────────────────────────────────────

/**
 * Update Schedule
 * Modifies the recording schedule rules for a camera with rule normalization,
 * and triggers immediate MediaMTX daemon sync.
 */
export const updateSchedule = async (cameraId: string, rawRules: any[], user: JwtAccessPayload) => {
  const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");
  await validateCameraAccess(camera, user);

  // Normalize rules: support both daysOfWeek and days arrays
  const rules: IRecordingScheduleRule[] = (rawRules || []).map((r) => ({
    daysOfWeek: r.daysOfWeek || r.days || [0, 1, 2, 3, 4, 5, 6],
    startTime: r.startTime,
    endTime: r.endTime,
    type: r.type || "continuous",
  }));

  const schedule = await RecordingSchedule.findOneAndUpdate(
    { cameraId },
    { rules },
    { upsert: true, new: true }
  );

  // Trigger immediate MediaMTX synchronization
  triggerImmediateScheduleSync(cameraId).catch((err) => {
    logger.warn(`Failed to trigger immediate schedule sync: ${(err as Error).message}`);
  });

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "SCHEDULE_UPDATED",
    description: `Recording schedule updated for camera ${camera.name}`,
    metadata: { cameraId, ruleCount: rules.length },
  });

  return schedule;
};

/**
 * Get Schedule
 * Retrieves the recording schedule rules for a specific camera.
 */
export const getSchedule = async (cameraId: string, user: JwtAccessPayload) => {
  const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");
  await validateCameraAccess(camera, user);

  const schedule = await RecordingSchedule.findOne({ cameraId });
  return schedule || { cameraId, rules: [] };
};

/**
 * Delete Schedule
 * Removes automated recording schedules for a camera (resets to 24/7 continuous default).
 */
export const deleteSchedule = async (cameraId: string, user: JwtAccessPayload) => {
  const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");
  await validateCameraAccess(camera, user);

  await RecordingSchedule.findOneAndDelete({ cameraId });

  // Resync MediaMTX state
  triggerImmediateScheduleSync(cameraId).catch((err) => {
    logger.warn(`Failed to trigger immediate schedule sync: ${(err as Error).message}`);
  });

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "SCHEDULE_UPDATED",
    description: `Recording schedule reset to default for camera ${camera.name}`,
    metadata: { cameraId },
  });

  return { message: "Schedule deleted successfully" };
};
