import { Router } from "express";
import * as alertController from "../../controllers/alert.controller";
import { authenticate } from "../../middleware/auth";
import { permit } from "../../middleware/permit";
import { validate } from "../../middleware/validate";
import {
  createAlertSchema,
  listAlertsQuerySchema,
  resolveAlertSchema,
  alertIdParamSchema,
  verifyAlertSchema,
  updateAlertRulesSchema,
} from "../../validators/alert.validator";
import { cameraIdParamSchema } from "../../validators/stream.validator"; // Reuse camera ID param validator

const router = Router();

// All alert endpoints require authentication
router.use(authenticate);

// ─── Alert Lifecycle (Creation to Resolution) ─────────────────────────────────

// Create an alert manually
router.post(
  "/",
  permit("alerts:manage"),
  validate(createAlertSchema),
  alertController.createAlert
);

// Acknowledge an alert
router.patch(
  "/:id/acknowledge",
  permit("alerts:manage"),
  validate(alertIdParamSchema, "params"),
  alertController.acknowledgeAlert
);

// Resolve an alert
router.patch(
  "/:id/resolve",
  permit("alerts:manage"),
  validate(alertIdParamSchema, "params"),
  validate(resolveAlertSchema),
  alertController.resolveAlert
);

// Escalate an alert
router.patch(
  "/:id/escalate",
  permit("alerts:manage"),
  validate(alertIdParamSchema, "params"),
  alertController.escalateAlert
);

// Verify an alert
router.post(
  "/:id/verify",
  permit("alerts:manage"),
  validate(alertIdParamSchema, "params"),
  validate(verifyAlertSchema),
  alertController.verifyAlert
);

// ─── Alert Rules Config ───────────────────────────────────────────────────────

// Configure alert rules
router.put(
  "/rules",
  permit("alerts:manage", "cameras:manage"), // Need admin/manage privileges
  validate(updateAlertRulesSchema),
  alertController.updateAlertRules
);

// Get alert rules for camera
router.get(
  "/rules/:cameraId",
  permit("alerts:view", "cameras:view"),
  validate(cameraIdParamSchema, "params"),
  alertController.getAlertRules
);

// ─── Queries & Aggregations ───────────────────────────────────────────────────

// Get pending alerts (new/acknowledged)
router.get(
  "/pending",
  permit("alerts:view"),
  alertController.getPendingAlerts
);

// Get global alert stats (Admin only)
router.get(
  "/stats",
  permit("alerts:manage"),
  alertController.getAlertStats
);

// Get alert history for a specific camera
// We route this to listAlerts controller but inject the cameraId into req.query
router.get(
  "/:cameraId/history",
  permit("alerts:view"),
  validate(cameraIdParamSchema, "params"),
  (req, res, next) => {
    req.query.cameraId = req.params.cameraId;
    next();
  },
  validate(listAlertsQuerySchema, "query"),
  alertController.listAlerts
);

// List all alerts (filtered)
router.get(
  "/",
  permit("alerts:view"),
  validate(listAlertsQuerySchema, "query"),
  alertController.listAlerts
);

// Get alert details
router.get(
  "/:id",
  permit("alerts:view"),
  validate(alertIdParamSchema, "params"),
  alertController.getAlertDetails
);

export default router;
