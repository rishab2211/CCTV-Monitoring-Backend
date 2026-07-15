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
} from "../../validators/incident.validator";

const router = Router();

// All endpoints require authentication
router.use(authenticate);

// ─── Reporting & Listing ─────────────────────────────────────────────────────

// Anyone can report an incident. Attachments max 5 files.
router.post(
  "/",
  upload.array("attachments", 5),
  validate(createIncidentSchema, "body"),
  incidentController.reportIncident
);

router.get(
  "/",
  validate(listIncidentsSchema, "query"),
  incidentController.listIncidents
);

router.get(
  "/:id",
  validate(incidentIdParamSchema, "params"),
  incidentController.getIncidentDetails
);

// ─── Operations ───────────────────────────────────────────────────────────────

// Status updates (operators, admins)
router.put(
  "/:id/status",
  validate(incidentIdParamSchema, "params"),
  validate(updateIncidentStatusSchema, "body"),
  incidentController.updateIncidentStatus
);

// Admins/Franchise can assign incidents
router.post(
  "/:id/assign",
  permit("incidents:assign"), // Assuming we use a generic permission or just rely on service layer check
  validate(incidentIdParamSchema, "params"),
  validate(assignIncidentSchema, "body"),
  incidentController.assignIncident
);

export default router;
