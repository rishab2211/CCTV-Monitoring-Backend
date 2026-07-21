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
  permit("users:read"),
  validate(listShiftsSchema, "query"),
  operatorController.listShifts
);

// Assign Cameras (Admins / Franchise)
router.post(
  "/:id/cameras",
  permit("cameras:assign"),
  validate(operatorIdParamSchema, "params"),
  validate(assignCamerasSchema, "body"),
  operatorController.assignCameras
);

// Get Operator Performance
router.get(
  "/:id/performance",
  permit("users:read"),
  validate(operatorIdParamSchema, "params"),
  operatorController.getPerformance
);

export default router;
