import { z } from "zod";
import { objectIdSchema } from "./auth.validator";
import { paginationSchema } from "./recording.validator"; // Reuse paginationSchema

export const createAlertSchema = z.object({
  cameraId: objectIdSchema,
  type: z.enum(["motion", "fire", "hazard", "tampering", "other"]),
  priority: z.enum(["low", "medium", "high", "critical"]).optional().default("medium"),
  description: z.string().max(500).optional(),
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
