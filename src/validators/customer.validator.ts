import { z } from "zod";

/**
 * Schema for Subscribing to a Plan.
 */
export const subscribeSchema = z.object({
  body: z.object({
    planName: z.enum(["Basic", "Premium", "AI-Pro"]),
    durationMonths: z.number().int().min(1).max(12).default(1),
  }),
});

/**
 * Schema for listing invoices.
 */
export const listInvoicesSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional().transform(Number).default("1"),
    limit: z.string().regex(/^\d+$/).optional().transform(Number).default("20"),
    status: z.enum(["paid", "pending", "failed"]).optional(),
  }),
});

/**
 * Schema for sharing a camera with another user (Body).
 */
export const shareCameraBodySchema = z.object({
  email: z.string().email("Invalid email address of the family member"),
});

/**
 * Schema for camera ID parameter.
 */
export const cameraIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Camera ID"),
});

/**
 * Schema for revoking a camera share.
 */
export const revokeCameraShareParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Camera ID"),
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid User ID"),
});

// removed duplicate param schema

