import { Router } from "express";
import * as franchiseController from "../../controllers/franchise.controller";
import { authenticate } from "../../middleware/auth";
import { permit } from "../../middleware/permit";
import { validate } from "../../middleware/validate";
import {
  createFranchiseSchema,
  updateFranchiseSchema,
  franchiseIdParamSchema,
  assignUserToFranchiseSchema,
} from "../../validators/franchise.validator";

const router = Router();

// All endpoints require authentication
router.use(authenticate);

// Super admin & admin only
router.post(
  "/",
  permit("franchises:manage"), // Requires high-level permission or super_admin bypass
  validate(createFranchiseSchema, "body"),
  franchiseController.createFranchise
);

router.get(
  "/",
  permit("franchises:manage"),
  franchiseController.listFranchises
);

// Admins and franchise owners can view details
router.get(
  "/:id",
  validate(franchiseIdParamSchema, "params"),
  franchiseController.getFranchiseDetails
);

// Admins update
router.put(
  "/:id",
  permit("franchises:manage"),
  validate(franchiseIdParamSchema, "params"),
  validate(updateFranchiseSchema, "body"),
  franchiseController.updateFranchise
);

// Admins assign users
router.post(
  "/:id/users/:userId",
  permit("franchises:manage"),
  validate(assignUserToFranchiseSchema, "params"),
  franchiseController.assignUserToFranchise
);

export default router;
