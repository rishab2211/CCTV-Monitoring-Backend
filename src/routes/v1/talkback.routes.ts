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
  permit("talkback:use"), // Replaced non-existent 'talkbacks:view'
  validate(listTalkbackLogsSchema, "query"),
  talkbackController.getLogs
);

router.get(
  "/active",
  permit("talkback:use"), // Admin-level view of all system-wide active sessions
  talkbackController.getActiveSessions
);

// ─── Camera-Specific Endpoints ────────────────────────────────────────────────

router.get(
  "/:cameraId/capabilities",
  permit("talkback:use"),
  validate(cameraIdParamSchema, "params"),
  talkbackController.getCapabilities
);

router.get(
  "/:cameraId/status",
  permit("talkback:use"),
  validate(cameraIdParamSchema, "params"),
  talkbackController.getSessionStatus
);

router.post(
  "/:cameraId/start",
  permit("talkback:use"), // We might need a specific 'talkbacks:manage', but for now operators have talkback:use.
  validate(cameraIdParamSchema, "params"),
  talkbackController.startSession
);

router.post(
  "/:cameraId/stop",
  permit("talkback:use"),
  validate(cameraIdParamSchema, "params"),
  talkbackController.stopSession
);

export default router;
