import { z } from "zod";

/**
 * Schema for triggering a new SOS Alert.
 * Validates the optional camera ID and location strings.
 */
export const triggerSosSchema = z.object({
  body: z.object({
    cameraId: z.string().optional(),
    location: z.string().optional(),
  }),
});

/**
 * Schema for listing SOS Alerts.
 * Validates pagination parameters and filters like status and camera ID.
 */
export const listSosSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional().transform(Number).default("1"),
    limit: z.string().regex(/^\d+$/).optional().transform(Number).default("20"),
    status: z.enum(["active", "acknowledged", "resolved"]).optional(),
    cameraId: z.string().optional(),
  }),
});

/**
 * Schema for resolving an SOS Alert.
 * Requires resolution notes explaining how the emergency was handled.
 */
export const resolveSosSchema = z.object({
  body: z.object({
    resolutionNotes: z.string().min(1, "Resolution notes are required to resolve an SOS"),
  }),
});

/**
 * Schema for validating an SOS Alert ID in route parameters.
 */
export const sosIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid SOS ID format"),
  }),
});
