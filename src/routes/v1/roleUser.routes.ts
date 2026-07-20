import { Router } from "express";
import * as userController from "../../controllers/user.controller";
import { authenticate } from "../../middleware/auth";
import { authorize, isFranchiseAdmin, isFranchiseOwner } from "../../middleware/authorize";
import { tenantScope } from "../../middleware/tenantScope";
import { validate } from "../../middleware/validate";
import {
  createUserSchema,
  listUsersQuerySchema,
  userIdParamSchema,
} from "../../validators/user.validator";

const router = Router();

// ─── /api/v1/operators ───────────────────────────────────────────────────────

/** GET /api/v1/operators */
router.get(
  "/operators",
  authenticate,
  isFranchiseAdmin, // Changed from super_admin/admin to include franchise admins
  tenantScope,
  validate(listUsersQuerySchema, "query"),
  userController.listOperators
);

/** POST /api/v1/operators */
router.post(
  "/operators",
  authenticate,
  isFranchiseAdmin, // Admins & franchise admins can create operators
  validate(createUserSchema),
  userController.createOperator
);


// ─── /api/v1/technicians ─────────────────────────────────────────────────────

/** GET /api/v1/technicians */
router.get(
  "/technicians",
  authenticate,
  isFranchiseAdmin,
  tenantScope,
  validate(listUsersQuerySchema, "query"),
  userController.listTechnicians
);

/** POST /api/v1/technicians */
router.post(
  "/technicians",
  authenticate,
  isFranchiseAdmin,
  validate(createUserSchema),
  userController.createTechnician
);

// ─── /api/v1/customers ───────────────────────────────────────────────────────

/** GET /api/v1/customers */
router.get(
  "/customers",
  authenticate,
  isFranchiseAdmin,
  tenantScope,
  validate(listUsersQuerySchema, "query"),
  userController.listCustomers
);

/** POST /api/v1/customers */
router.post(
  "/customers",
  authenticate,
  isFranchiseAdmin,
  validate(createUserSchema),
  userController.createCustomer
);

/** GET /api/v1/customers/:id */
router.get(
  "/customers/:id",
  authenticate,
  authorize("super_admin", "admin", "franchise", "franchise_admin", "operator"),
  validate(userIdParamSchema, "params"),
  userController.getCustomerById
);

export default router;
