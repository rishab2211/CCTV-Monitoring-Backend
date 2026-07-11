import { Router } from "express";
import * as roleController from "../../controllers/role.controller";
import { authenticate } from "../../middleware/auth";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  createRoleSchema,
  updateRoleSchema,
  updateRolePermissionsSchema,
  createPermissionSchema,
  assignRoleSchema,
  roleIdParamSchema,
  userRoleParamSchema,
} from "../../validators/role.validator";
import { userIdParamSchema } from "../../validators/user.validator";

const router = Router();

// ─── All routes are super_admin only (except user role assignment) ────────────

// ─── Permission Routes ────────────────────────────────────────────────────────

/** GET /api/v1/permissions */
router.get(
  "/permissions",
  authenticate,
  authorize("super_admin"),
  roleController.listPermissions
);

/** POST /api/v1/permissions */
router.post(
  "/permissions",
  authenticate,
  authorize("super_admin"),
  validate(createPermissionSchema),
  roleController.createPermission
);

// ─── Role Routes ──────────────────────────────────────────────────────────────

/** GET /api/v1/roles */
router.get(
  "/roles",
  authenticate,
  authorize("super_admin"),
  roleController.listRoles
);

/** POST /api/v1/roles */
router.post(
  "/roles",
  authenticate,
  authorize("super_admin"),
  validate(createRoleSchema),
  roleController.createRole
);

// ─── Role sub-resource: permissions ───────────────────────────────────────────
// NOTE: /roles/:id/permissions must come BEFORE /roles/:id

/** GET /api/v1/roles/:id/permissions */
router.get(
  "/roles/:id/permissions",
  authenticate,
  authorize("super_admin"),
  validate(roleIdParamSchema, "params"),
  roleController.getRolePermissions
);

/** PUT /api/v1/roles/:id/permissions */
router.put(
  "/roles/:id/permissions",
  authenticate,
  authorize("super_admin"),
  validate(roleIdParamSchema, "params"),
  validate(updateRolePermissionsSchema),
  roleController.updateRolePermissions
);

/** PUT /api/v1/roles/:id */
router.put(
  "/roles/:id",
  authenticate,
  authorize("super_admin"),
  validate(roleIdParamSchema, "params"),
  validate(updateRoleSchema),
  roleController.updateRole
);

/** DELETE /api/v1/roles/:id */
router.delete(
  "/roles/:id",
  authenticate,
  authorize("super_admin"),
  validate(roleIdParamSchema, "params"),
  roleController.deleteRole
);

// ─── User Role Assignment (lives on /users/:id/roles) ─────────────────────────
// super_admin and admin can assign roles

/** POST /api/v1/users/:id/roles */
router.post(
  "/users/:id/roles",
  authenticate,
  authorize("super_admin", "admin"),
  validate(userIdParamSchema, "params"),
  validate(assignRoleSchema),
  roleController.assignRoleToUser
);

/** DELETE /api/v1/users/:id/roles/:roleId */
router.delete(
  "/users/:id/roles/:roleId",
  authenticate,
  authorize("super_admin", "admin"),
  validate(userRoleParamSchema, "params"),
  roleController.removeRoleFromUser
);

export default router;
