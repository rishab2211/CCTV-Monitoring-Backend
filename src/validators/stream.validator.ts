import { z } from "zod";
import { objectIdSchema } from "./auth.validator";

// ─── Start Stream ─────────────────────────────────────────────────────────────

export const startStreamSchema = z.object({
  cameraId: objectIdSchema,
});

export type StartStreamInput = z.infer<typeof startStreamSchema>;

// ─── Stop Stream ──────────────────────────────────────────────────────────────

export const stopStreamSchema = z.object({
  cameraId: objectIdSchema,
  sessionId: z.string().uuid("Must be a valid session UUID"),
});

export type StopStreamInput = z.infer<typeof stopStreamSchema>;

// ─── WebRTC Offer ─────────────────────────────────────────────────────────────

export const webrtcOfferSchema = z.object({
  sdp: z.string().min(10, "SDP must be a valid session description"),
  type: z.literal("offer"),
});

export type WebRTCOfferInput = z.infer<typeof webrtcOfferSchema>;

// ─── MediaMTX Auth Webhook ────────────────────────────────────────────────────
// MediaMTX calls this to validate stream tokens before letting a client connect.

export const authWebhookSchema = z.object({
  user: z.string().optional(),    // may contain the stream token
  password: z.string().optional(),
  ip: z.string().optional(),
  action: z.enum(["read", "publish", "playback"]).optional(),
  path: z.string().optional(),    // the stream path name e.g. "cam-fg-1004"
  protocol: z.string().optional(),
  id: z.string().optional(),
  query: z.string().optional(),   // query string may carry the token: ?token=xxx
});

export type AuthWebhookInput = z.infer<typeof authWebhookSchema>;

// ─── Param Schemas ────────────────────────────────────────────────────────────

export const cameraIdParamSchema = z.object({
  cameraId: objectIdSchema,
});
