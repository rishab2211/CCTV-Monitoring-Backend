import { Router } from "express";
import * as userController from "../../controllers/user.controller";
import { authenticate } from "../../middleware/auth";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { createUserSchema, listUsersQuerySchema } from "../../validators/user.validator";

const router = Router();

// ─── /api/v1/admins ───────────────────────────────────────────────────────────

/** GET /api/v1/admins — super_admin only */
router.get(
  "/",
  authenticate,
  authorize("super_admin"),
  validate(listUsersQuerySchema, "query"),
  userController.listAdmins
);

/** POST /api/v1/admins — super_admin only */
router.post(
  "/",
  authenticate,
  authorize("super_admin"),
  validate(createUserSchema),
  userController.createAdmin
);

export default router;
