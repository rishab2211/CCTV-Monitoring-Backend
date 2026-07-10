import { z } from "zod";

// ─── Reusable field schemas ───────────────────────────────────────────────────

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

const phoneSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, "Please provide a valid 10-digit Indian phone number");

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format");

// ─── Register ─────────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name cannot exceed 100 characters")
    .trim(),
  email: z.string().email("Invalid email address").toLowerCase().trim(),
  phone: phoneSchema,
  password: passwordSchema,
  role: z.enum(
    ["super_admin", "admin", "franchise", "operator", "technician", "customer"],
    { errorMap: () => ({ message: "Invalid role" }) }
  ),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// ─── Login ────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  // Either email or phone must be provided
  email: z.string().email("Invalid email address").toLowerCase().trim().optional(),
  phone: phoneSchema.optional(),
  password: z.string().min(1, "Password is required"),
}).refine(
  (data) => data.email || data.phone,
  { message: "Either email or phone number is required", path: ["email"] }
);

export type LoginInput = z.infer<typeof loginSchema>;

// ─── Refresh Token ────────────────────────────────────────────────────────────

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

// ─── Forgot Password ─────────────────────────────────────────────────────────

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address").toLowerCase().trim(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// ─── Verify OTP ───────────────────────────────────────────────────────────────

export const verifyOtpSchema = z.object({
  email: z.string().email("Invalid email address").toLowerCase().trim(),
  otp: z
    .string()
    .length(6, "OTP must be exactly 6 digits")
    .regex(/^\d+$/, "OTP must contain only digits"),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

// ─── Reset Password ───────────────────────────────────────────────────────────

export const resetPasswordSchema = z.object({
  resetToken: z.string().min(1, "Reset token is required"),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, "Confirm password is required"),
}).refine(
  (data) => data.newPassword === data.confirmPassword,
  { message: "Passwords do not match", path: ["confirmPassword"] }
);

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ─── Change Password ──────────────────────────────────────────────────────────

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, "Confirm password is required"),
}).refine(
  (data) => data.newPassword === data.confirmPassword,
  { message: "Passwords do not match", path: ["confirmPassword"] }
).refine(
  (data) => data.currentPassword !== data.newPassword,
  { message: "New password must be different from current password", path: ["newPassword"] }
);

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ─── Session params ───────────────────────────────────────────────────────────

export const sessionIdParamSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
});

export type SessionIdParam = z.infer<typeof sessionIdParamSchema>;

// ─── Re-export objectIdSchema for reuse in other validators ──────────────────
export { objectIdSchema };
