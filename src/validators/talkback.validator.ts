import { z } from "zod";
import { objectIdSchema } from "./auth.validator";
import { paginationSchema } from "./recording.validator";

export const listTalkbackLogsSchema = paginationSchema.extend({
  cameraId: objectIdSchema.optional(),
  operatorId: objectIdSchema.optional(),
  status: z.enum(["active", "completed", "failed"]).optional(),
});
