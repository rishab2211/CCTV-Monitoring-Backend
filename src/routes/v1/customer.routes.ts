import { Router } from "express";
import * as customerController from "../../controllers/customer.controller";
import { authenticate } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as customerValidator from "../../validators/customer.validator";

const router = Router();

// All customer routes require authentication
router.use(authenticate);

// Subscribe to a Plan
router.post(
  "/subscribe",
  validate(customerValidator.subscribeSchema, "body"),
  customerController.subscribe
);

// Cancel Subscription
router.post(
  "/cancel-subscription",
  customerController.cancelSubscription
);

// List Billing Invoices
router.get(
  "/invoices",
  validate(customerValidator.listInvoicesSchema, "query"),
  customerController.listInvoices
);

// Get Dashboard (Unified View)
router.get("/dashboard", customerController.getDashboard);

// ─── Camera Wrappers ────────────────────────────────────────────────────────

// My cameras
router.get("/cameras", customerController.getMyCameras);

// Live view for camera
router.get(
  "/cameras/:id/live",
  validate(customerValidator.cameraIdParamSchema, "params"),
  customerController.getLiveView
);

// Playback for camera
router.get(
  "/cameras/:id/playback",
  validate(customerValidator.cameraIdParamSchema, "params"),
  customerController.getPlayback
);

// Share camera with family
router.post(
  "/cameras/:id/share",
  validate(customerValidator.cameraIdParamSchema, "params"),
  validate(customerValidator.shareCameraBodySchema, "body"),
  customerController.shareCamera
);

// Revoke camera sharing
router.delete(
  "/cameras/:id/share/:userId",
  validate(customerValidator.revokeCameraShareParamsSchema, "params"),
  customerController.revokeCameraShare
);

// ─── Other Wrappers ─────────────────────────────────────────────────────────

// Current subscription
router.get("/subscription", customerController.getCurrentSubscription);

// Payment history (alias to /invoices)
router.get("/payments", validate(customerValidator.listInvoicesSchema, "query"), customerController.listInvoices);

// My notifications
router.get("/notifications", customerController.getMyNotifications);

// My incident reports
router.get("/reports", customerController.getMyReports);

// Get profile
router.get("/profile", customerController.getProfile);

// Update profile
router.put("/profile", customerController.updateProfile);

export default router;
