import { Router } from "express";
import * as operatorController from "../../controllers/operator.controller";
import { authenticate } from "../../middleware/auth";
import { permit } from "../../middleware/permit";
import { validate } from "../../middleware/validate";
import {
  clockOutSchema,
  assignCamerasSchema,
  operatorIdParamSchema,
  listShiftsSchema,
} from "../../validators/operator.validator";

const router = Router();

router.use(authenticate);

// Clock In (Operators Only)
router.post(
  "/clock-in",
  permit("operators:manage"), // Or some specific permission, assuming basic role covers it in controller
  operatorController.clockIn
);

// Clock Out (Operators Only)
router.post(
  "/clock-out",
  validate(clockOutSchema, "body"),
  operatorController.clockOut
);

// List Historical Shifts
router.get(
  "/shifts",
  validate(listShiftsSchema, "query"),
  operatorController.listShifts
);

// Assign Cameras (Admins / Franchise)
router.post(
  "/:id/cameras",
  permit("operators:manage"), // Require management permission
  validate(operatorIdParamSchema, "params"),
  validate(assignCamerasSchema, "body"),
  operatorController.assignCameras
);

// Get Operator Performance
router.get(
  "/:id/performance",
  validate(operatorIdParamSchema, "params"),
  operatorController.getPerformance
);

export default router;
