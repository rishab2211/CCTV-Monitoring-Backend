import { z } from "zod";

export const triggerSosSchema = z.object({
  body: z.object({
    cameraId: z.string().optional(),
    location: z.string().optional(),
  }),
});

export const listSosSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional().transform(Number).default("1"),
    limit: z.string().regex(/^\d+$/).optional().transform(Number).default("20"),
    status: z.enum(["active", "acknowledged", "resolved"]).optional(),
    cameraId: z.string().optional(),
  }),
});

export const resolveSosSchema = z.object({
  body: z.object({
    resolutionNotes: z.string().min(1, "Resolution notes are required to resolve an SOS"),
  }),
});

export const sosIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid SOS ID format"),
  }),
});
