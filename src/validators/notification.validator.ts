import { z } from "zod";
import { objectIdSchema } from "./auth.validator";
import { paginationSchema } from "./recording.validator";

export const registerDeviceSchema = z.object({
  token: z.string().min(1, "FCM Token is required"),
  deviceType: z.enum(["android", "ios", "web"]),
});

export const updatePreferencesSchema = z.object({
  alerts: z
    .object({
      push: z.boolean().optional(),
      inApp: z.boolean().optional(),
      email: z.boolean().optional(),
    })
    .optional(),
  system: z
    .object({
      push: z.boolean().optional(),
      inApp: z.boolean().optional(),
      email: z.boolean().optional(),
    })
    .optional(),
});

export const listNotificationsQuerySchema = paginationSchema.extend({
  isRead: z.coerce.boolean().optional(),
  type: z.enum(["alert", "system", "message"]).optional(),
});

export const notificationIdParamSchema = z.object({
  id: objectIdSchema,
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type ListNotificationsQueryInput = z.infer<typeof listNotificationsQuerySchema>;
