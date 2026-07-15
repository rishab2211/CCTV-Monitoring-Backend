import { z } from "zod";
import { objectIdSchema } from "./auth.validator";
import { paginationSchema } from "./recording.validator"; // Reuse paginationSchema

export const createAlertSchema = z.object({
  cameraId: objectIdSchema,
  type: z.enum(["motion", "fire", "hazard", "tampering", "other"]),
  priority: z.enum(["low", "medium", "high", "critical"]).optional().default("medium"),
  description: z.string().max(500).optional(),
});

/**
 * Schema for verifying an alert
 */
export const verifyAlertSchema = z.object({
  body: z.object({
    isVerified: z.boolean({ required_error: "isVerified is required" }),
    notes: z.string().optional(),
  }),
});

/**
 * Schema for updating alert rules
 */
export const updateAlertRulesSchema = z.object({
  body: z.object({
    cameraId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Camera ID"),
    rules: z.record(z.any(), { required_error: "Rules object is required" }),
  }),
});

export const listAlertsQuerySchema = paginationSchema.extend({
  cameraId: objectIdSchema.optional(),
  status: z.enum(["new", "acknowledged", "resolved", "escalated"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  type: z.enum(["motion", "fire", "hazard", "tampering", "other"]).optional(),
});

export const resolveAlertSchema = z.object({
  resolutionNotes: z.string().min(1).max(1000),
});

export const alertIdParamSchema = z.object({
  id: objectIdSchema,
});
