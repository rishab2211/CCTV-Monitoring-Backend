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
  recordingIdParamSchema,
} from "../../validators/recording.validator";
import { cameraIdParamSchema } from "../../validators/stream.validator"; // Reuse camera ID param validator

const router = Router();

// ─── System / Internal Endpoints ──────────────────────────────────────────────

/**
 * POST /api/v1/recordings
 * Internal endpoint for external workers to log video chunks.
 */
router.post(
  "/",
  authenticate, // System key handles the auth for this
  permit("recordings:manage"), // Or check for system role specifically
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
  permit("recordings:manage"), // Admins/franchise, or customers managing their own (handled in service)
  validate(setScheduleSchema),
  recordingController.setSchedule
);

router.get(
  "/:cameraId/schedule",
  authenticate,
  permit("recordings:view"),
  validate(cameraIdParamSchema, "params"),
  recordingController.getSchedule
);

// ─── Camera-Specific Playback & Timeline ──────────────────────────────────────

router.get(
  "/:cameraId/playback",
  authenticate,
  permit("recordings:view"),
  validate(cameraIdParamSchema, "params"),
  validate(timeRangeQuerySchema, "query"),
  recordingController.getPlaybackChunks
);

router.get(
  "/:cameraId/timeline",
  authenticate,
  permit("recordings:view"),
  validate(cameraIdParamSchema, "params"),
  validate(dateQuerySchema, "query"),
  recordingController.getTimeline
);

// ─── Individual Recording Management ──────────────────────────────────────────

router.get(
  "/",
  authenticate,
  permit("recordings:view"),
  validate(listRecordingsQuerySchema, "query"),
  recordingController.listRecordings
);

router.get(
  "/:id",
  authenticate,
  permit("recordings:view"),
  validate(recordingIdParamSchema, "params"),
  recordingController.getRecordingDetails
);

router.post(
  "/:id/download",
  authenticate,
  permit("recordings:view"),
  validate(recordingIdParamSchema, "params"),
  recordingController.generateDownloadLink
);

router.delete(
  "/:id",
  authenticate,
  permit("recordings:manage"),
  validate(recordingIdParamSchema, "params"),
  recordingController.deleteRecording
);

export default router;
