import { Router } from "express";
import * as cameraController from "../../controllers/camera.controller";
import { authenticate } from "../../middleware/auth";
import { permit } from "../../middleware/permit";
import { validate } from "../../middleware/validate";
import {
  createCameraSchema,
  updateCameraSchema,
  assignCameraSchema,
  transferCameraSchema,
  updateStatusSchema,
  heartbeatSchema,
  listCamerasQuerySchema,
  cameraIdParamSchema,
  customerIdParamSchema,
  operatorIdParamSchema,
} from "../../validators/camera.validator";

const router = Router();

// ─── Apply Authentication to All Camera Routes ─────────────────────────────
router.use(authenticate);

// ─── Scoped List Endpoints (Registered before :id to prevent clash) ──────────

import { tenantScope } from "../../middleware/tenantScope";

/** GET /api/v1/cameras/customer/:customerId */
router.get(
  "/customer/:customerId",
  permit("cameras:read"),
  validate(customerIdParamSchema, "params"),
  cameraController.getCustomerCameras
);

/** GET /api/v1/cameras/operator/:operatorId */
router.get(
  "/operator/:operatorId",
  permit("cameras:read"),
  validate(operatorIdParamSchema, "params"),
  cameraController.getOperatorCameras
);

// ─── Generic CRUD & Heartbeats ───────────────────────────────────────────────

/** GET /api/v1/cameras - List all cameras with filters */
router.get(
  "/",
  permit("cameras:read"),
  tenantScope,
  validate(listCamerasQuerySchema, "query"),
  cameraController.listCameras
);

/** POST /api/v1/cameras - Create new camera */
router.post(
  "/",
  permit("cameras:write"),
  tenantScope,
  validate(createCameraSchema),
  cameraController.createCamera
);

/** GET /api/v1/cameras/:id - Fetch details of single camera */
router.get(
  "/:id",
  permit("cameras:read"),
  tenantScope,
  validate(cameraIdParamSchema, "params"),
  cameraController.getCameraById
);

/** PUT /api/v1/cameras/:id - Update camera configuration */
router.put(
  "/:id",
  permit("cameras:write"),
  tenantScope,
  validate(cameraIdParamSchema, "params"),
  validate(updateCameraSchema),
  cameraController.updateCamera
);

/** DELETE /api/v1/cameras/:id - Soft delete camera */
router.delete(
  "/:id",
  permit("cameras:delete"),
  tenantScope,
  validate(cameraIdParamSchema, "params"),
  cameraController.deleteCamera
);

// ─── Camera Remote Controls ──────────────────────────────────────────────────

/** POST /api/v1/cameras/:id/assign - Assign camera to customer/operators/franchise */
router.post(
  "/:id/assign",
  permit("cameras:assign"),
  tenantScope,
  validate(cameraIdParamSchema, "params"),
  validate(assignCameraSchema),
  cameraController.assignCamera
);

/** POST /api/v1/cameras/:id/transfer - Transfer ownership of camera */
router.post(
  "/:id/transfer",
  permit("cameras:assign"),
  tenantScope,
  validate(cameraIdParamSchema, "params"),
  validate(transferCameraSchema),
  cameraController.transferCamera
);

/** PATCH /api/v1/cameras/:id/status - Update camera connection status */
router.patch(
  "/:id/status",
  permit("cameras:configure", "cameras:write"),
  tenantScope,
  validate(cameraIdParamSchema, "params"),
  validate(updateStatusSchema),
  cameraController.updateCameraStatus
);

/** POST /api/v1/cameras/:id/heartbeat - Heartbeat ping */
router.post(
  "/:id/heartbeat",
  // No strict permit checks needed, anyone authenticated (including hardware with X-System-Key) can heartbeat
  validate(cameraIdParamSchema, "params"),
  validate(heartbeatSchema),
  cameraController.updateCameraHealth
);

/** GET /api/v1/cameras/:id/health - Fetch camera status/performance logs */
router.get(
  "/:id/health",
  permit("cameras:read"),
  tenantScope,
  validate(cameraIdParamSchema, "params"),
  cameraController.getCameraById // details endpoint already contains health stats
);

/** POST /api/v1/cameras/:id/restart - Trigger camera remote reboot */
router.post(
  "/:id/restart",
  permit("cameras:restart"),
  tenantScope,
  validate(cameraIdParamSchema, "params"),
  cameraController.restartCamera
);

// ─── Configuration Settings Toggles ──────────────────────────────────────────

/** PATCH /api/v1/cameras/:id/recording - Toggle recording settings */
router.patch(
  "/:id/recording",
  permit("cameras:configure"),
  tenantScope,
  validate(cameraIdParamSchema, "params"),
  cameraController.updateRecording
);

/** PATCH /api/v1/cameras/:id/motion - Toggle motion detection settings */
router.patch(
  "/:id/motion",
  permit("cameras:configure"),
  tenantScope,
  validate(cameraIdParamSchema, "params"),
  cameraController.updateMotion
);

/** PATCH /api/v1/cameras/:id/ai - Toggle AI features */
router.patch(
  "/:id/ai",
  permit("cameras:configure"),
  tenantScope,
  validate(cameraIdParamSchema, "params"),
  cameraController.updateAI
);

/** POST /api/v1/cameras/:id/qr-scan - QR scan trigger for technicians */
router.post(
  "/:id/qr-scan",
  permit("cameras:configure"),
  validate(cameraIdParamSchema, "params"),
  cameraController.qrScanCamera
);

/** GET /api/v1/cameras/:id/config - Read configuration properties */
router.get(
  "/:id/config",
  permit("cameras:read", "cameras:configure"),
  validate(cameraIdParamSchema, "params"),
  cameraController.getCameraConfig
);

export default router;
