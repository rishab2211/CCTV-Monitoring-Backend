import { z } from "zod";
import { objectIdSchema } from "./auth.validator";

// ─── Location Schema ─────────────────────────────────────────────────────────

const cameraLocationSchema = z.object({
  street: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().regex(/^\d{6}$/, "Pincode must be 6 digits").optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
}).optional();

// ─── Settings Schema ─────────────────────────────────────────────────────────

const cameraSettingsSchema = z.object({
  recordingEnabled: z.boolean().default(false).optional(),
  motionDetectionEnabled: z.boolean().default(false).optional(),
  aiFeaturesEnabled: z.boolean().default(false).optional(),
  recordingRetentionDays: z.number().int().min(1).max(90).default(7).optional(),
}).optional();

// ─── Create Camera Validator ──────────────────────────────────────────────────

export const createCameraSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  serialNumber: z.string().min(2).max(100).trim(),
  rtspUrl: z.string().url("Must be a valid RTSP/HTTP URL").trim(),
  location: cameraLocationSchema,
  settings: cameraSettingsSchema,
  qrCode: z.string().max(100).optional(),
});

export type CreateCameraInput = z.infer<typeof createCameraSchema>;

// ─── Update Camera Validator ──────────────────────────────────────────────────

export const updateCameraSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  rtspUrl: z.string().url("Must be a valid RTSP/HTTP URL").trim().optional(),
  location: cameraLocationSchema,
  settings: cameraSettingsSchema,
});

export type UpdateCameraInput = z.infer<typeof updateCameraSchema>;

// ─── Assign Camera Validator ──────────────────────────────────────────────────

export const assignCameraSchema = z.object({
  customerId: objectIdSchema.nullable().optional(),
  operatorIds: z.array(objectIdSchema).optional(),
  franchiseId: objectIdSchema.nullable().optional(),
});

export type AssignCameraInput = z.infer<typeof assignCameraSchema>;

// ─── Transfer Camera Validator ────────────────────────────────────────────────

export const transferCameraSchema = z.object({
  customerId: objectIdSchema, // mandatory transfer recipient
});

export type TransferCameraInput = z.infer<typeof transferCameraSchema>;

// ─── Update Status Validator ──────────────────────────────────────────────────

export const updateStatusSchema = z.object({
  status: z.enum(["online", "offline", "maintenance"]),
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

// ─── Heartbeat / Ping Validator ────────────────────────────────────────────────

export const heartbeatSchema = z.object({
  cpuUsage: z.number().min(0).max(100).optional(),
  memoryUsage: z.number().min(0).max(100).optional(),
  temperature: z.number().min(-20).max(120).optional(),
  storageUsage: z.number().min(0).max(100).optional(),
});

export type HeartbeatInput = z.infer<typeof heartbeatSchema>;

// ─── List Query Validator ─────────────────────────────────────────────────────

export const listCamerasQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(["online", "offline", "maintenance"]).optional(),
  search: z.string().max(100).optional(), // searches name or serialNumber
  customerId: objectIdSchema.optional(),
  operatorId: objectIdSchema.optional(),
  franchiseId: objectIdSchema.optional(),
  sortBy: z.enum(["createdAt", "name", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ListCamerasQuery = z.infer<typeof listCamerasQuerySchema>;

// ─── Param Schemas ────────────────────────────────────────────────────────────

export const cameraIdParamSchema = z.object({
  id: objectIdSchema,
});

export const customerIdParamSchema = z.object({
  customerId: objectIdSchema,
});

export const operatorIdParamSchema = z.object({
  operatorId: objectIdSchema,
});
