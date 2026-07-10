import { Router } from "express";
import * as authController from "../../controllers/auth.controller";
import { authenticate } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { authLimiter, otpLimiter } from "../../middleware/rateLimiter";
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema,
  changePasswordSchema,
  sessionIdParamSchema,
} from "../../validators/auth.validator";

const router = Router();

// ─── Public Routes ────────────────────────────────────────────────────────────

/** POST /api/v1/auth/register */
router.post(
  "/register",
  authLimiter,
  validate(registerSchema),
  authController.register
);

/** POST /api/v1/auth/login */
router.post(
  "/login",
  authLimiter,
  validate(loginSchema),
  authController.login
);

/** POST /api/v1/auth/refresh-token */
router.post(
  "/refresh-token",
  validate(refreshTokenSchema),
  authController.refreshToken
);

/** POST /api/v1/auth/forgot-password */
router.post(
  "/forgot-password",
  otpLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword
);

/** POST /api/v1/auth/verify-otp */
router.post(
  "/verify-otp",
  authLimiter,
  validate(verifyOtpSchema),
  authController.verifyOtp
);

/** POST /api/v1/auth/reset-password */
router.post(
  "/reset-password",
  authLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword
);

// ─── Protected Routes (require valid access token) ────────────────────────────

/** POST /api/v1/auth/logout */
router.post("/logout", authenticate, authController.logout);

/** PUT /api/v1/auth/change-password */
router.put(
  "/change-password",
  authenticate,
  validate(changePasswordSchema),
  authController.changePassword
);

/** GET /api/v1/auth/sessions */
router.get("/sessions", authenticate, authController.getSessions);

/** DELETE /api/v1/auth/sessions/:sessionId */
router.delete(
  "/sessions/:sessionId",
  authenticate,
  validate(sessionIdParamSchema, "params"),
  authController.revokeSession
);

/** DELETE /api/v1/auth/sessions */
router.delete("/sessions", authenticate, authController.revokeAllSessions);

/** GET /api/v1/auth/me */
router.get("/me", authenticate, authController.getMe);

export default router;
