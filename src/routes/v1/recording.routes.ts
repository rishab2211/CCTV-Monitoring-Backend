import { Router } from "express";
import * as recordingController from "../../controllers/recording.controller";
import { authenticate } from "../../middleware/auth";
import { permit } from "../../middleware/permit";
import { validate } from "../../middleware/validate";
import {
  createRecordingChunkSchema,
  listRecordingsQuerySchema,
  timeRangeQuerySchema,
  dateQuerySchema,
  updateRetentionSchema,
  setScheduleSchema,
  updateScheduleBodySchema,
  recordingIdParamSchema,
} from "../../validators/recording.validator";
import { cameraIdParamSchema } from "../../validators/stream.validator";

const router = Router();

// ─── System / Internal Endpoints ──────────────────────────────────────────────

/**
 * POST /api/v1/recordings
 * Internal endpoint for external workers to log video chunks.
 */
router.post(
  "/",
  authenticate,
  permit("recordings:manage"),
  validate(createRecordingChunkSchema),
  recordingController.createRecordingChunk
);

// ─── Global & Aggregate Endpoints ─────────────────────────────────────────────

router.get(
  "/storage",
  authenticate,
  permit("recordings:manage"),
  recordingController.getStorageStats
);

router.put(
  "/retention",
  authenticate,
  permit("recordings:manage"),
  validate(updateRetentionSchema),
  recordingController.updateRetentionPolicy
);

// ─── Schedule Management ──────────────────────────────────────────────────────

router.post(
  "/schedule",
  authenticate,
  permit("cameras:configure"),
  validate(setScheduleSchema),
  recordingController.updateSchedule
);

router.put(
  "/:cameraId/schedule",
  authenticate,
  permit("cameras:configure"),
  validate(cameraIdParamSchema, "params"),
  validate(updateScheduleBodySchema),
  recordingController.updateSchedule
);

router.get(
  "/:cameraId/schedule",
  authenticate,
  permit("recordings:read"),
  validate(cameraIdParamSchema, "params"),
  recordingController.getSchedule
);

router.delete(
  "/:cameraId/schedule",
  authenticate,
  permit("cameras:configure"),
  validate(cameraIdParamSchema, "params"),
  recordingController.deleteSchedule
);

// ─── Camera-Specific Playback & Timeline ──────────────────────────────────────

router.get(
  "/:cameraId/playback",
  authenticate,
  permit("recordings:read"),
  validate(cameraIdParamSchema, "params"),
  validate(timeRangeQuerySchema, "query"),
  recordingController.getPlaybackChunks
);

router.get(
  "/:cameraId/vod.m3u8",
  authenticate,
  permit("recordings:read"),
  validate(cameraIdParamSchema, "params"),
  validate(timeRangeQuerySchema, "query"),
  recordingController.getVodPlaylist
);

router.get(
  "/:cameraId/timeline",
  authenticate,
  permit("recordings:read"),
  validate(cameraIdParamSchema, "params"),
  validate(dateQuerySchema, "query"),
  recordingController.getTimeline
);

// ─── Individual Recording Management & Streaming ──────────────────────────────

router.get(
  "/",
  authenticate,
  permit("recordings:read"),
  validate(listRecordingsQuerySchema, "query"),
  recordingController.listRecordings
);

/**
 * GET /api/v1/recordings/:id/stream
 * Direct video streaming endpoint supporting HTTP 206 Partial Content (Range requests)
 * and S3 redirect fallback. Supports auth via header or ?token= query param.
 */
router.get(
  "/:id/stream",
  authenticate,
  permit("recordings:read"),
  validate(recordingIdParamSchema, "params"),
  recordingController.streamRecording
);

router.get(
  "/:id/play",
  authenticate,
  permit("recordings:read"),
  validate(recordingIdParamSchema, "params"),
  recordingController.streamRecording
);

router.get(
  "/:id",
  authenticate,
  permit("recordings:read"),
  validate(recordingIdParamSchema, "params"),
  recordingController.getRecordingDetails
);

router.post(
  "/:id/download",
  authenticate,
  permit("recordings:download", "recordings:read"),
  validate(recordingIdParamSchema, "params"),
  recordingController.generateDownloadLink
);

router.get(
  "/:id/download",
  authenticate,
  permit("recordings:download", "recordings:read"),
  validate(recordingIdParamSchema, "params"),
  recordingController.generateDownloadLink
);

router.delete(
  "/:id",
  authenticate,
  permit("recordings:delete"),
  validate(recordingIdParamSchema, "params"),
  recordingController.deleteRecording
);

export default router;
