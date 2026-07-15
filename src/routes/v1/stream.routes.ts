import { Router } from "express";
import * as streamController from "../../controllers/stream.controller";
import { authenticate } from "../../middleware/auth";
import { permit } from "../../middleware/permit";
import { validate } from "../../middleware/validate";
import {
  startStreamSchema,
  stopStreamSchema,
  webrtcOfferSchema,
  authWebhookSchema,
  cameraIdParamSchema,
} from "../../validators/stream.validator";

const router = Router();

// ─── MediaMTX Auth Webhook (no user auth — protected by shared secret) ────────
// MediaMTX calls this endpoint to validate stream tokens before allowing connections.
// IMPORTANT: This must be registered BEFORE the authenticate middleware block.

router.post(
  "/auth",
  validate(authWebhookSchema),
  streamController.mediamtxAuthWebhook
);

// ─── All other stream endpoints require authentication ─────────────────────────

// ── Session Management ────────────────────────────────────────────────────────

/** POST /api/v1/streams/start */
router.post(
  "/start",
  authenticate,
  permit("streams:view"),
  validate(startStreamSchema),
  streamController.startStream
);

/** POST /api/v1/streams/stop */
router.post(
  "/stop",
  authenticate,
  permit("streams:view"),
  validate(stopStreamSchema),
  streamController.stopStream
);

/** GET /api/v1/streams/active — Admin/Operator view of all sessions */
router.get(
  "/active",
  authenticate,
  permit("streams:view"),
  streamController.listActiveStreams
);

// ── Camera-specific Stream Endpoints (registered before :cameraId to avoid clash) ─

/** GET /api/v1/streams/:cameraId/token */
router.get(
  "/:cameraId/token",
  authenticate,
  permit("streams:view"),
  validate(cameraIdParamSchema, "params"),
  streamController.getStreamToken
);

/** GET /api/v1/streams/:cameraId/status */
router.get(
  "/:cameraId/status",
  authenticate,
  permit("streams:view"),
  validate(cameraIdParamSchema, "params"),
  streamController.getStreamStatus
);

/** GET /api/v1/streams/:cameraId/ice-candidates */
router.get(
  "/:cameraId/ice-candidates",
  authenticate,
  permit("streams:view"),
  validate(cameraIdParamSchema, "params"),
  streamController.getICECandidates
);

// ── WebRTC Signaling ──────────────────────────────────────────────────────────

/** POST /api/v1/streams/:cameraId/webrtc/offer */
router.post(
  "/:cameraId/webrtc/offer",
  authenticate,
  permit("streams:view"),
  validate(cameraIdParamSchema, "params"),
  validate(webrtcOfferSchema),
  streamController.webrtcOffer
);

/** POST /api/v1/streams/:cameraId/webrtc/answer (system call) */
router.post(
  "/:cameraId/webrtc/answer",
  authenticate,
  validate(cameraIdParamSchema, "params"),
  streamController.webrtcAnswer
);

export default router;
