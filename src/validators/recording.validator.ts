import { z } from "zod";
import { objectIdSchema } from "./auth.validator";

export const paginationSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional().default("1"),
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default("10"),
});

export const createRecordingChunkSchema = z.object({
  cameraId: objectIdSchema,
  startTime: z.union([z.string().datetime(), z.date()]),
  endTime: z.union([z.string().datetime(), z.date()]).optional(),
  type: z.enum(["continuous", "motion", "scheduled"]).default("continuous"),
  status: z.enum(["recording", "completed", "failed", "deleted"]).optional(),
  url: z.string().default(""),
  s3Key: z.string().min(1).optional(),
  localPath: z.string().optional(),
  resolution: z.string().optional(),
  videoCodec: z.string().optional(),
  publicId: z.string().optional(),
  sizeBytes: z.number().int().min(0),
  durationSeconds: z.number().min(0),
  expiresAt: z.union([z.string().datetime(), z.date()]).optional(),
});

export const listRecordingsQuerySchema = paginationSchema.extend({
  cameraId: objectIdSchema.optional(),
  type: z.enum(["continuous", "motion", "scheduled"]).optional(),
  status: z.enum(["recording", "completed", "failed", "deleted"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
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

export const updateRetentionSchema = z
  .object({
    days: z.number().int().min(1).max(365).optional(),
    retentionDays: z.number().int().min(1).max(365).optional(),
  })
  .refine((data) => data.days !== undefined || data.retentionDays !== undefined, {
    message: "Either days or retentionDays is required",
  });

export const scheduleRuleSchema = z
  .object({
    daysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .optional(),
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .optional(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):?([0-5]\d)$/, "Format must be HH:mm"),
    endTime: z.string().regex(/^([01]\d|2[0-3]):?([0-5]\d)$/, "Format must be HH:mm"),
    type: z.enum(["continuous", "motion"]).default("continuous"),
  })
  .refine(
    (data) => (data.daysOfWeek && data.daysOfWeek.length > 0) || (data.days && data.days.length > 0),
    { message: "Either daysOfWeek or days array must be provided" }
  );

export const setScheduleSchema = z.object({
  cameraId: objectIdSchema.optional(),
  rules: z.array(scheduleRuleSchema),
});

export const updateScheduleBodySchema = z.union([
  z.object({
    rules: z.array(scheduleRuleSchema),
  }),
  z.array(scheduleRuleSchema),
]);

export const recordingIdParamSchema = z.object({
  id: objectIdSchema,
});
