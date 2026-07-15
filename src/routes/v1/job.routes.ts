/**
 * @file job.routes.ts
 * @description Express Router for Technician / Installation Module (Module 13).
 * Implements all 14 endpoints specified in the project analysis.
 * Routes are split between `/installations` (job-centric) and `/technicians` (technician-centric).
 */
import { Router } from "express";
import * as jobController from "../../controllers/job.controller";
import { authenticate } from "../../middleware/auth";
import { permit } from "../../middleware/permit";
import { validate } from "../../middleware/validate";
import { upload } from "../../middleware/upload";
import {
  createJobSchema,
  listJobsSchema,
  jobIdParamSchema,
  updateJobStatusSchema,
  reassignJobSchema,
  submitChecklistSchema,
  updateGpsSchema,
  technicianIdParamSchema,
} from "../../validators/job.validator";

const router = Router();

router.use(authenticate);

// ─── Installation Jobs ────────────────────────────────────────────────────────

/**
 * POST /api/v1/installations
 * Admin or Franchise manager creates a new job and assigns a technician.
 */
router.post(
  "/",
  permit("jobs:manage"),
  validate(createJobSchema, "body"),
  jobController.createJob
);

/**
 * GET /api/v1/installations
 * Paginated list of jobs. Technicians see only theirs; admins see all.
 */
router.get(
  "/",
  validate(listJobsSchema, "query"),
  jobController.listJobs
);

/**
 * GET /api/v1/installations/assigned
 * Shortcut: Returns all jobs assigned to the authenticated technician.
 * IMPORTANT: Must be defined BEFORE /:id to avoid route shadowing.
 */
router.get(
  "/assigned",
  jobController.getAssignedJobs
);

/**
 * GET /api/v1/installations/:id
 * Get full details for a specific job including populated relations.
 */
router.get(
  "/:id",
  validate(jobIdParamSchema, "params"),
  jobController.getJobDetails
);

/**
 * PUT /api/v1/installations/:id
 * Technician updates job status, notes, or appends photos via multipart upload.
 */
router.put(
  "/:id",
  upload.array("attachments", 5),
  validate(jobIdParamSchema, "params"),
  validate(updateJobStatusSchema, "body"),
  jobController.updateJobStatus
);

/**
 * PUT /api/v1/installations/:id/reassign
 * Admin or Franchise manager reassigns a job to a different technician.
 */
router.put(
  "/:id/reassign",
  permit("jobs:manage"),
  validate(jobIdParamSchema, "params"),
  validate(reassignJobSchema, "body"),
  jobController.reassignJob
);

/**
 * POST /api/v1/installations/:id/checklist
 * Technician submits the on-site installation/maintenance checklist items.
 */
router.post(
  "/:id/checklist",
  validate(jobIdParamSchema, "params"),
  validate(submitChecklistSchema, "body"),
  jobController.submitChecklist
);

/**
 * POST /api/v1/installations/:id/photos
 * Technician uploads proof-of-work photos during/after the job.
 * Accepts up to 10 images via multipart/form-data field 'photos'.
 */
router.post(
  "/:id/photos",
  upload.array("photos", 10),
  validate(jobIdParamSchema, "params"),
  jobController.uploadJobPhotos
);

/**
 * POST /api/v1/installations/:id/signature
 * Technician uploads customer's digital signature as a single image file.
 * Accepts 1 file via multipart/form-data field 'signature'.
 */
router.post(
  "/:id/signature",
  upload.array("signature", 1),
  validate(jobIdParamSchema, "params"),
  jobController.uploadCustomerSignature
);

/**
 * PATCH /api/v1/installations/:id/complete
 * Explicitly marks a job as completed with optional notes.
 */
router.patch(
  "/:id/complete",
  validate(jobIdParamSchema, "params"),
  jobController.completeJob
);

/**
 * GET /api/v1/installations/:id/report
 * Returns a comprehensive completion report for a job (admin or assigned technician).
 */
router.get(
  "/:id/report",
  validate(jobIdParamSchema, "params"),
  jobController.getJobReport
);

// ─── Technician-specific routes ───────────────────────────────────────────────

/**
 * GET /api/v1/installations/technicians/:id/schedule
 * Returns the technician's upcoming and in-progress job schedule.
 */
router.get(
  "/technicians/:id/schedule",
  validate(technicianIdParamSchema, "params"),
  jobController.getTechnicianSchedule
);

/**
 * POST /api/v1/installations/technicians/:id/gps
 * Technician posts their live GPS coordinates to track location during a job.
 */
router.post(
  "/technicians/:id/gps",
  validate(technicianIdParamSchema, "params"),
  validate(updateGpsSchema, "body"),
  jobController.updateGpsLocation
);

export default router;
