import { z } from "zod";

/**
 * Schema for Clocking Out.
 */
export const clockOutSchema = z.object({
  body: z.object({
    handoverNotes: z.string().optional(),
  }),
});

/**
 * Schema for Bulk Assigning Cameras to an Operator.
 */
export const assignCamerasSchema = z.object({
  body: z.object({
    cameraIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Camera ID")).min(1),
  }),
});

/**
 * Schema for route parameter containing an operator ID.
 */
export const operatorIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Operator ID"),
  }),
});

/**
 * Schema for filtering historical shifts.
 */
export const listShiftsSchema = z.object({
  query: z.object({
    operatorId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Operator ID").optional(),
    page: z.string().regex(/^\d+$/).optional().transform(Number).default("1"),
    limit: z.string().regex(/^\d+$/).optional().transform(Number).default("20"),
  }),
});
