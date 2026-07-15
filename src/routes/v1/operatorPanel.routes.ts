/**
 * @file operatorPanel.routes.ts
 * @description Self-service operator panel routes (Module 14).
 * All routes are scoped to the authenticated operator themselves —
 * no :id param needed since RBAC locks every endpoint to req.user.
 *
 * Mounted at: /api/v1/operator  (singular)
 * Note: /api/v1/operators (plural) handles admin-facing CRUD (shifts, camera assignment, etc.)
 */
import { Router } from "express";
import * as operatorController from "../../controllers/operator.controller";
import { authenticate } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { clockOutSchema } from "../../validators/operator.validator";

const router = Router();

// All operator panel routes require authentication
router.use(authenticate);

// ─── Dashboard ────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/operator/dashboard
 * At-a-glance summary: shift info, assigned cameras, open incidents, active SOS.
 */
router.get("/dashboard", operatorController.getOperatorDashboard);

// ─── Cameras ──────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/operator/cameras
 * Returns all Camera documents assigned to the logged-in operator.
 */
router.get("/cameras", operatorController.getAssignedCameras);

// ─── Alerts ───────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/operator/alerts/pending
 * Unacknowledged alerts from the operator's assigned cameras.
 */
router.get("/alerts/pending", operatorController.getPendingAlerts);

/**
 * GET /api/v1/operator/alerts/active
 * Acknowledged (in-progress) alerts from the operator's assigned cameras.
 */
router.get("/alerts/active", operatorController.getActiveAlerts);

// ─── Calls ────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/operator/calls
 * Recent talkback sessions for cameras assigned to this operator.
 */
router.get("/calls", operatorController.getOperatorCalls);

// ─── Shift Management ─────────────────────────────────────────────────────────

/**
 * PATCH /api/v1/operator/shift/start
 * Clock in — start a new operator shift.
 */
router.patch("/shift/start", operatorController.clockIn);

/**
 * PATCH /api/v1/operator/shift/end
 * Clock out — end the active shift, record metrics, broadcast handover notes.
 */
router.patch(
  "/shift/end",
  validate(clockOutSchema, "body"),
  operatorController.clockOut
);

/**
 * GET /api/v1/operator/shift/status
 * Returns whether the operator is currently on shift and active shift details.
 */
router.get("/shift/status", operatorController.getShiftStatus);

// ─── Timeline & Reports ───────────────────────────────────────────────────────

/**
 * GET /api/v1/operator/timeline
 * Returns the operator's last 100 activity log events in reverse-chronological order.
 */
router.get("/timeline", operatorController.getOperatorTimeline);

/**
 * GET /api/v1/operator/reports
 * Structured performance report: last 30 shifts with per-shift metrics and aggregated totals.
 */
router.get("/reports", operatorController.getOperatorReports);

export default router;
