import { Router } from "express";
import * as userController from "../../controllers/user.controller";
import { authenticate } from "../../middleware/auth";
import { authorize, isFranchiseAdmin } from "../../middleware/authorize";
import { tenantScope } from "../../middleware/tenantScope";
import { validate } from "../../middleware/validate";
import {
  createUserSchema,
  updateUserSchema,
  updateProfileSchema,
  updateStatusSchema,
  listUsersQuerySchema,
  userIdParamSchema,
} from "../../validators/user.validator";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: Static paths (/profile, /profile/avatar) MUST be registered
// before parameterized paths (/:id) to prevent Express matching "profile"
// as a value for :id.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Own Profile (any authenticated user) ────────────────────────────────────

/** PUT /api/v1/users/profile */
router.put(
  "/profile",
  authenticate,
  validate(updateProfileSchema),
  userController.updateOwnProfile
);

/** PUT /api/v1/users/profile/avatar */
router.put(
  "/profile/avatar",
  authenticate,
  userController.updateAvatar // 501 placeholder — no body validation needed
);

// ─── Admin: Generic User CRUD ─────────────────────────────────────────────────

/** GET /api/v1/users */
router.get(
  "/",
  authenticate,
  authorize("super_admin", "admin"), // Kept admin-only as this is the generic user list endpoint
  tenantScope,
  validate(listUsersQuerySchema, "query"),
  userController.listUsers
);

/** POST /api/v1/users */
router.post(
  "/",
  authenticate,
  authorize("super_admin", "admin"),
  validate(createUserSchema),
  userController.createUser
);

/** GET /api/v1/users/:id */
router.get(
  "/:id",
  authenticate,
  authorize("super_admin", "admin"),
  validate(userIdParamSchema, "params"),
  userController.getUserById
);

/** PUT /api/v1/users/:id */
router.put(
  "/:id",
  authenticate,
  authorize("super_admin", "admin"),
  validate(userIdParamSchema, "params"),
  validate(updateUserSchema),
  userController.updateUser
);

/** DELETE /api/v1/users/:id — soft delete, super_admin only */
router.delete(
  "/:id",
  authenticate,
  authorize("super_admin"),
  validate(userIdParamSchema, "params"),
  userController.deleteUser
);

/** PATCH /api/v1/users/:id/status */
router.patch(
  "/:id/status",
  authenticate,
  authorize("super_admin", "admin"),
  validate(userIdParamSchema, "params"),
  validate(updateStatusSchema),
  userController.updateUserStatus
);

/** GET /api/v1/users/:id/activity */
router.get(
  "/:id/activity",
  authenticate,
  authorize("super_admin", "admin"),
  validate(userIdParamSchema, "params"),
  userController.getUserActivity
);

export default router;
