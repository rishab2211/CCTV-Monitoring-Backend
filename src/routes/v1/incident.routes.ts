/**
 * @file incident.routes.ts
 * @description Express Router for Incident Management (Module 11).
 * Implements all 12 endpoints specified in the project analysis.
 */
import { Router } from "express";
import * as incidentController from "../../controllers/incident.controller";
import { authenticate } from "../../middleware/auth";
import { permit } from "../../middleware/permit";
import { validate } from "../../middleware/validate";
import { upload } from "../../middleware/upload";
import {
  createIncidentSchema,
  listIncidentsSchema,
  updateIncidentStatusSchema,
  assignIncidentSchema,
  incidentIdParamSchema,
  addIncidentNoteSchema,
  closeIncidentSchema,
  verifyIncidentSchema,
} from "../../validators/incident.validator";

const router = Router();

// All endpoints require authentication
router.use(authenticate);

// ─── Reporting & Listing ─────────────────────────────────────────────────────

/**
 * POST /api/v1/incidents
 * Create a new incident report. Any authenticated user can report.
 * Supports up to 5 attachment files via multipart/form-data.
 */
router.post(
  "/",
  upload.array("attachments", 5),
  validate(createIncidentSchema, "body"),
  incidentController.reportIncident
);

/**
 * GET /api/v1/incidents
 * List incidents with RBAC filtering and pagination.
 */
router.get(
  "/",
  validate(listIncidentsSchema, "query"),
  incidentController.listIncidents
);

/**
 * GET /api/v1/incidents/:id
 * Get full details for a specific incident.
 */
router.get(
  "/:id",
  validate(incidentIdParamSchema, "params"),
  incidentController.getIncidentDetails
);

// ─── Status Management ────────────────────────────────────────────────────────

/**
 * PATCH /api/v1/incidents/:id/status
 * Update the status of an incident (open → investigating → resolved → closed).
 * Operators can only update if assigned. Customers are blocked.
 */
router.patch(
  "/:id/status",
  validate(incidentIdParamSchema, "params"),
  validate(updateIncidentStatusSchema, "body"),
  incidentController.updateIncidentStatus
);

/**
 * PATCH /api/v1/incidents/:id/assign
 * Admin assigns an incident to an operator for investigation.
 */
router.patch(
  "/:id/assign",
  permit("incidents:assign"),
  validate(incidentIdParamSchema, "params"),
  validate(assignIncidentSchema, "body"),
  incidentController.assignIncident
);

/**
 * PATCH /api/v1/incidents/:id/close
 * Explicitly close an incident with mandatory resolution notes.
 */
router.patch(
  "/:id/close",
  permit("incidents:manage"),
  validate(incidentIdParamSchema, "params"),
  validate(closeIncidentSchema, "body"),
  incidentController.closeIncident
);

// ─── Notes, Media & Verification ─────────────────────────────────────────────

/**
 * POST /api/v1/incidents/:id/notes
 * Append a text note to an incident during investigation.
 */
router.post(
  "/:id/notes",
  permit("incidents:manage"),
  validate(incidentIdParamSchema, "params"),
  validate(addIncidentNoteSchema, "body"),
  incidentController.addIncidentNote
);

/**
 * POST /api/v1/incidents/:id/media
 * Upload photos or video clips as evidence for an incident.
 * Accepts up to 10 files via multipart/form-data field 'media'.
 */
router.post(
  "/:id/media",
  permit("incidents:manage"),
  upload.array("media", 10),
  validate(incidentIdParamSchema, "params"),
  incidentController.uploadIncidentMedia
);

/**
 * POST /api/v1/incidents/:id/verify
 * Operator formally confirms the incident is a genuine event.
 */
router.post(
  "/:id/verify",
  permit("incidents:manage"),
  validate(incidentIdParamSchema, "params"),
  validate(verifyIncidentSchema, "body"),
  incidentController.verifyIncident
);

// ─── Reports & Timeline ───────────────────────────────────────────────────────

/**
 * GET /api/v1/incidents/:id/timeline
 * Retrieve the full chronological activity log for an incident.
 */
router.get(
  "/:id/timeline",
  validate(incidentIdParamSchema, "params"),
  incidentController.getIncidentTimeline
);

/**
 * GET /api/v1/incidents/:id/report
 * Generate a comprehensive incident report (operator/admin only).
 * Returns structured JSON; can be used to produce a PDF client-side.
 */
router.get(
  "/:id/report",
  permit("incidents:manage"),
  validate(incidentIdParamSchema, "params"),
  incidentController.getIncidentReport
);

export default router;
