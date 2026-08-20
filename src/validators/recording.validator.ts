import { z } from "zod";
import { objectIdSchema } from "./auth.validator";

export const paginationSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional().default("1"),
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default("10"),
});

export const createRecordingChunkSchema = z.object({
  cameraId: objectIdSchema,
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  type: z.enum(["continuous", "motion", "scheduled"]),
  status: z.enum(["recording", "completed", "failed", "deleted"]).optional(),
  url: z.string().url(),
  publicId: z.string().optional(),
  sizeBytes: z.number().int().min(0),
  durationSeconds: z.number().int().min(0),
});

export const listRecordingsQuerySchema = paginationSchema.extend({
  cameraId: objectIdSchema.optional(),
  type: z.enum(["continuous", "motion", "scheduled"]).optional(),
  status: z.enum(["recording", "completed", "failed", "deleted"]).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const timeRangeQuerySchema = z
  .object({
    start: z.string().optional(),
    end: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
  })
  .refine(
    (data) => Boolean((data.start || data.startTime) && (data.end || data.endTime)),
    { message: "Both start (or startTime) and end (or endTime) query parameters are required" }
  );

export const dateQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD"), // YYYY-MM-DD
});

export const updateRetentionSchema = z.object({
  days: z.number().int().min(1).max(365),
});

export const scheduleRuleSchema = z.object({
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):?([0-5]\d)$/, "Format must be HH:mm"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):?([0-5]\d)$/, "Format must be HH:mm"),
  type: z.enum(["continuous", "motion"]),
});

export const setScheduleSchema = z.object({
  cameraId: objectIdSchema,
  rules: z.array(scheduleRuleSchema),
});

export const recordingIdParamSchema = z.object({
  id: objectIdSchema,
});
