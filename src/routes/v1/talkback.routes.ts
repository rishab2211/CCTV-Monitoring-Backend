import { Router } from "express";
import * as talkbackController from "../../controllers/talkback.controller";
import { authenticate } from "../../middleware/auth";
import { permit } from "../../middleware/permit";
import { validate } from "../../middleware/validate";
import { listTalkbackLogsSchema } from "../../validators/talkback.validator";
import { cameraIdParamSchema } from "../../validators/stream.validator"; // Reuse camera ID param validator

const router = Router();

// All talkback endpoints require authentication
router.use(authenticate);

// ─── Global & Aggregate Endpoints ─────────────────────────────────────────────

router.get(
  "/logs",
  permit("talkbacks:view"), // or reuse alerts/camera view permission if talkbacks specific permission doesn't exist. Assuming it inherits from camera viewing generally, but let's assume 'cameras:view' for now or we define a new one. We'll use cameras:view since talkback usually relates to camera permissions.
  validate(listTalkbackLogsSchema, "query"),
  talkbackController.getLogs
);

router.get(
  "/active",
  permit("cameras:manage"), // Admin-level view of all system-wide active sessions
  talkbackController.getActiveSessions
);

// ─── Camera-Specific Endpoints ────────────────────────────────────────────────

router.get(
  "/:cameraId/capabilities",
  permit("cameras:view"),
  validate(cameraIdParamSchema, "params"),
  talkbackController.getCapabilities
);

router.get(
  "/:cameraId/status",
  permit("cameras:view"),
  validate(cameraIdParamSchema, "params"),
  talkbackController.getSessionStatus
);

router.post(
  "/:cameraId/start",
  permit("cameras:view"), // We might need a specific 'talkbacks:manage', but for now operators have cameras:view.
  validate(cameraIdParamSchema, "params"),
  talkbackController.startSession
);

router.post(
  "/:cameraId/stop",
  permit("cameras:view"),
  validate(cameraIdParamSchema, "params"),
  talkbackController.stopSession
);

export default router;
