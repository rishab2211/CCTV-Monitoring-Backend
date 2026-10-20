import { z } from "zod";
import { objectIdSchema } from "./auth.validator";

// ─── Location Schema ─────────────────────────────────────────────────────────

const cameraLocationSchema = z.object({
  street: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.union([z.string().regex(/^\d{6}$/, "Pincode must be 6 digits"), z.literal("")]).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
}).optional();

// ─── Settings Schema ─────────────────────────────────────────────────────────

const cameraAudioSettingsSchema = z.object({
  talkbackEnabled: z.boolean().optional(),
  protocol: z.enum(["onvif_backchannel", "hikvision_isapi", "dahua_cgi", "auto"]).optional(),
  codec: z.enum(["pcm_mulaw", "pcm_alaw", "aac"]).optional(),
  sampleRate: z.number().int().positive().optional(),
  speakerVolume: z.number().min(0).max(100).optional(),
  backchannelPath: z.string().max(200).optional(),
  httpAudioPort: z.number().int().min(1).max(65535).optional(),
}).optional();

const cameraSettingsSchema = z.object({
  recordingEnabled: z.boolean().default(false).optional(),
  motionDetectionEnabled: z.boolean().default(false).optional(),
  aiFeaturesEnabled: z.boolean().default(false).optional(),
  recordingRetentionDays: z.number().int().min(1).max(90).default(7).optional(),
  talkbackEnabled: z.boolean().optional(),
  audioSettings: cameraAudioSettingsSchema,
}).optional();

const rtspUrlSchema = z
  .string()
  .trim()
  .regex(/^(rtsp|rtsps|http|https):\/\/[^\s]+$/, "Must be a valid RTSP or HTTP(S) stream URL");

export const cameraBrandEnum = z.enum(["icsee", "hikvision", "dahua", "tapo", "reolink", "generic"]);
export type CameraBrand = z.infer<typeof cameraBrandEnum>;

// ─── Build RTSP URL Validator ──────────────────────────────────────────────────

export const buildRtspUrlSchema = z.object({
  brand: cameraBrandEnum.default("generic"),
  ip: z.string().trim().min(1, "IP address is required"),
  port: z.coerce.number().int().min(1).max(65535).default(554).optional(),
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().default("").optional(),
  channel: z.coerce.number().int().min(1).default(1).optional(),
  stream: z.enum(["main", "sub"]).default("main").optional(),
});

export type BuildRtspUrlInput = z.infer<typeof buildRtspUrlSchema>;

// ─── Create Camera Validator ──────────────────────────────────────────────────

export const createCameraSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  serialNumber: z.string().min(2).max(100).trim(),
  brand: cameraBrandEnum.optional(),
  ip: z.string().trim().optional(),
  rtspUrl: rtspUrlSchema,
  location: cameraLocationSchema,
  settings: cameraSettingsSchema,
  qrCode: z.string().max(100).optional(),
});

export type CreateCameraInput = z.infer<typeof createCameraSchema>;

// ─── Provision Camera Validator ───────────────────────────────────────────────

export const provisionCameraSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  serialNumber: z.string().min(2).max(100).trim(),
  brand: cameraBrandEnum.default("generic").optional(),
  ip: z.string().trim().optional(),
  port: z.coerce.number().int().min(1).max(65535).default(554).optional(),
  username: z.string().trim().optional(),
  password: z.string().optional(),
  channel: z.coerce.number().int().min(1).default(1).optional(),
  stream: z.enum(["main", "sub"]).default("main").optional(),
  rtspUrl: rtspUrlSchema.or(z.literal("")).optional(),
  customerId: objectIdSchema.or(z.literal("")).nullable().optional(),
  franchiseId: objectIdSchema.or(z.literal("")).nullable().optional(),
  jobId: objectIdSchema.or(z.literal("")).nullable().optional(),
  streamMode: z.enum(["gb28181", "rtsp_relay"]).default("gb28181").optional(),
  gb28181: z
    .object({
      deviceId: z.string().trim().optional(),
      sipPassword: z.string().optional(),
    })
    .optional(),
  probeRtsp: z.boolean().default(false).optional(),
  location: cameraLocationSchema,
  settings: cameraSettingsSchema,
});

export type ProvisionCameraInput = z.infer<typeof provisionCameraSchema>;

// ─── PTZ Command Validator ───────────────────────────────────────────────────

export const ptzCommandSchema = z.object({
  direction: z.enum([
    "left",
    "right",
    "up",
    "down",
    "upleft",
    "upright",
    "downleft",
    "downright",
    "zoomin",
    "zoomout",
    "stop",
  ]),
  speed: z.coerce.number().int().min(1).max(255).default(32).optional(),
});

export type PTZCommandInput = z.infer<typeof ptzCommandSchema>;

// ─── Update Camera Validator ──────────────────────────────────────────────────

export const updateCameraSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  brand: cameraBrandEnum.optional(),
  ip: z.string().trim().optional(),
  rtspUrl: rtspUrlSchema.optional(),
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
