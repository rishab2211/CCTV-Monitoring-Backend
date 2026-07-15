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
} from "../../validators/job.validator";

const router = Router();

router.use(authenticate);

// Create Job (Admins & Franchise)
router.post(
  "/",
  permit("jobs:manage"), // Requires high-level permission or super_admin bypass
  validate(createJobSchema, "body"),
  jobController.createJob
);

// List Jobs (Technicians see theirs, Admins see all)
router.get(
  "/",
  validate(listJobsSchema, "query"),
  jobController.listJobs
);

// Get Job Details
router.get(
  "/:id",
  validate(jobIdParamSchema, "params"),
  jobController.getJobDetails
);

// Update Job Status (Technicians use this, supports photo uploads)
router.put(
  "/:id/status",
  upload.array("attachments", 5), // Allow up to 5 photos per status update
  validate(jobIdParamSchema, "params"),
  validate(updateJobStatusSchema, "body"), // Form data validation
  jobController.updateJobStatus
);

// Reassign Job (Admins & Franchise)
router.put(
  "/:id/reassign",
  permit("jobs:manage"),
  validate(jobIdParamSchema, "params"),
  validate(reassignJobSchema, "body"),
  jobController.reassignJob
);

export default router;
