/**
 * @file stream.controller.ts
 * @description Express request handlers for live WebRTC/RTSP streaming.
 * Exposes endpoints to start, stop, and track active sessions.
 */
import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as streamService from "../services/stream.service";
import { env } from "../config/env";
import { safeCompare } from "../utils/helpers";

/**
 * Start Live Stream Endpoint
 * POST /api/v1/streams/start
 * Generates an access token and provisions the RTSP path in MediaMTX.
 */
export const startStream = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const ipAddress =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ??
    req.ip ??
    undefined;

  const result = await streamService.startStream(req.body, req.user, ipAddress);
  res.status(200).json(new ApiResponse(200, result, "Stream session started"));
});

/**
 * Stop Live Stream Endpoint
 * POST /api/v1/streams/stop
 * Revokes the stream session and instructs MediaMTX to drop the connection.
 */
export const stopStream = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await streamService.stopStream(req.body, req.user);
  res.status(200).json(new ApiResponse(200, result, "Stream session stopped"));
});

/**
 * GET /api/v1/streams/:cameraId/token
 * Issue a fresh stream token for a camera.
 */
export const getStreamToken = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await streamService.getStreamToken(req.params.cameraId, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

/**
 * GET /api/v1/streams/:cameraId/status
 * Get live stream status for a camera.
 */
export const getStreamStatus = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await streamService.getStreamStatus(req.params.cameraId, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

/**
 * GET /api/v1/streams/active
 * List all active stream sessions (admin sees all, others see their own).
 */
export const listActiveStreams = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const sessions = await streamService.listActiveStreams(req.user);
  res.status(200).json(new ApiResponse(200, { sessions, count: sessions.length }));
});

/**
 * POST /api/v1/streams/:cameraId/webrtc/offer
 * Relay a WebRTC SDP offer to MediaMTX (WHEP protocol).
 */
export const webrtcOffer = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await streamService.relayWebRTCOffer(
    req.params.cameraId,
    req.body.sdp,
    req.user
  );
  res.status(200).json(new ApiResponse(200, result));
});

/**
 * POST /api/v1/streams/:cameraId/webrtc/answer
 * Receive WebRTC SDP answer (system → client relay — typically called by MediaMTX itself).
 */
export const webrtcAnswer = catchAsync(async (req: Request, res: Response) => {
  // This endpoint acts as a relay acknowledgement.
  // In most WHEP flows, the answer comes directly from MediaMTX in the /offer response.
  // This is a stub for setups where a custom signaling server sits between MediaMTX and clients.
  res.status(200).json(
    new ApiResponse(200, { received: true }, "WebRTC answer acknowledged")
  );
});

/**
 * GET /api/v1/streams/:cameraId/ice-candidates
 * Return ICE candidate connection info for a camera stream.
 */
export const getICECandidates = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await streamService.getICECandidates(req.params.cameraId, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

/**
 * POST /api/v1/streams/auth
 * MediaMTX auth webhook — called by MediaMTX before allowing a client to connect.
 * Protected by MEDIAMTX_STREAM_SECRET header, NOT by user JWT.
 */
export const mediamtxAuthWebhook = catchAsync(async (req: Request, res: Response) => {
  // Verify the shared secret sent by MediaMTX
  if (env.MEDIAMTX_STREAM_SECRET) {
    const sentSecret = req.headers["x-mediamtx-secret"];
    if (typeof sentSecret !== "string" || !safeCompare(sentSecret, env.MEDIAMTX_STREAM_SECRET)) {
      throw ApiError.unauthorized("Invalid MediaMTX webhook secret");
    }
  }


  // Extract token from query string or user field
  const rawQuery = req.body.query as string | undefined;
  const tokenFromQuery = rawQuery
    ? new URLSearchParams(rawQuery).get("token")
    : null;
  const tokenFromUser = req.body.user as string | undefined;
  const token = tokenFromQuery ?? tokenFromUser ?? "";

  if (!token) {
    // Allow unauthenticated reads if no secret is configured (dev mode)
    if (!env.MEDIAMTX_STREAM_SECRET) {
      return res.status(200).json({ allow: true });
    }
    throw ApiError.unauthorized("No stream token provided");
  }

  await streamService.verifyStreamToken(token);

  res.status(200).json({ allow: true });
});
