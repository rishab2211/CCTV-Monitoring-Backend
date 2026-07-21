import { Router } from "express";
import * as sosController from "../../controllers/sos.controller";
import { authenticate } from "../../middleware/auth";
import { permit } from "../../middleware/permit";
import { validate } from "../../middleware/validate";
import {
  triggerSosSchema,
  listSosSchema,
  resolveSosSchema,
  sosIdParamSchema,
  addSosNoteSchema,
} from "../../validators/sos.validator";

const router = Router();

// All SOS endpoints require authentication
router.use(authenticate);

// ─── Triggering & Listing ─────────────────────────────────────────────────────

// Any authenticated user can trigger an SOS (e.g. from mobile app)
router.post(
  "/",
  permit("sos:trigger"),
  validate(triggerSosSchema, "body"),
  sosController.triggerSos
);

router.get(
  "/",
  permit("sos:read"),
  validate(listSosSchema, "query"),
  sosController.listSosAlerts
);

// ─── Operations (Acknowledge & Resolve) ────────────────────────────────────────

// Re-using alerts:resolve permission for SOS handling for now
router.post(
  "/:id/acknowledge",
  permit("alerts:resolve"),
  validate(sosIdParamSchema, "params"),
  sosController.acknowledgeSos
);

router.post(
  "/:id/resolve",
  permit("alerts:resolve"),
  validate(sosIdParamSchema, "params"),
  validate(resolveSosSchema, "body"),
  sosController.resolveSos
);

// ─── Details, Notes & Timeline ────────────────────────────────────────────────

router.get(
  "/active",
  permit("sos:read"),
  sosController.getActiveSos
);

router.get(
  "/:id",
  permit("sos:read"),
  validate(sosIdParamSchema, "params"),
  sosController.getSosDetail
);

router.post(
  "/:id/notes",
  permit("alerts:resolve"),
  validate(sosIdParamSchema, "params"),
  validate(addSosNoteSchema, "body"),
  sosController.addSosNote
);

router.get(
  "/:id/timeline",
  permit("sos:read"),
  validate(sosIdParamSchema, "params"),
  sosController.getSosTimeline
);

export default router;
