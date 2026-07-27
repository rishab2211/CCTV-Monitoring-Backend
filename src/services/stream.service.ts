/**
 * @file stream.service.ts
 * @description Orchestrates live WebRTC/RTSP video streaming via MediaMTX.
 * Handles stream session tokens, MediaMTX path generation, and stream lifecycles.
 */
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Camera } from "../models/Camera";
import { StreamSession } from "../models/StreamSession";
import { logActivity } from "../models/ActivityLog";
import { ApiError } from "../utils/ApiError";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import {
  addMediaMTXPath,
  toPathName,
  getMediaMTXPathStatus,
  listMediaMTXPaths,
} from "../config/mediamtx.service";
import { validateCameraAccess } from "./camera.service";
import { JwtAccessPayload } from "../types";
import { StartStreamInput, StopStreamInput } from "../validators/stream.validator";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Hash a stream token for safe storage (never store raw JWT in DB). */
const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

/**
 * Sign a stream-specific JWT.
 * Payload contains enough info for the MediaMTX webhook to validate without a DB lookup.
 */
const signStreamToken = (
  cameraId: string,
  userId: string,
  sessionId: string,
  pathName: string
): string => {
  return jwt.sign(
    { type: "stream", cameraId, userId, sessionId, pathName },
    env.ACCESS_TOKEN_SECRET,
    { expiresIn: env.STREAM_TOKEN_EXPIRY as unknown as number }
  );
};

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Start a live stream session.
 *  1. Validate caller has access to the camera.
 *  2. Register/ensure the RTSP path exists in MediaMTX.
 *  3. Create a StreamSession document.
 *  4. Issue a signed stream token.
 *  5. Return connection URLs for the client.
 */
export const startStream = async (
  input: StartStreamInput,
  user: JwtAccessPayload,
  ipAddress?: string
) => {
  const { cameraId } = input;

  if (!mongoose.Types.ObjectId.isValid(cameraId)) {
    throw ApiError.badRequest("Invalid camera ID format");
  }

  // 1. Load camera and validate access
  const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");

  await validateCameraAccess(camera, user);

  // 2. Register path in MediaMTX (sourceOnDemand — no actual RTSP pull yet)
  const pathName = toPathName(camera.serialNumber);
  await addMediaMTXPath(pathName, camera.rtspUrl);

  // 3. Create session record
  const sessionId = uuidv4();
  const token = signStreamToken(
    camera._id.toString(),
    user.userId,
    sessionId,
    pathName
  );
  const tokenHash = hashToken(token);

  await StreamSession.create({
    sessionId,
    cameraId: camera._id,
    userId: user.userId === "system" ? camera._id : new mongoose.Types.ObjectId(user.userId),
    role: user.role,
    startedAt: new Date(),
    isActive: true,
    tokenHash,
    ipAddress,
  });

  // 4. Log activity
  logActivity({
    userId: user.userId === "system" ? camera._id : new mongoose.Types.ObjectId(user.userId),
    action: "STREAM_STARTED",
    description: `Live stream started for camera "${camera.name}"`,
    metadata: { cameraId, sessionId, pathName },
  });

  logger.info(`📹 Stream started: ${camera.name} (session: ${sessionId}) by user ${user.userId}`);

  // 5. Build response URLs
  const mediamtxBase = env.MEDIAMTX_URL;
  return {
    sessionId,
    streamToken: token,
    pathName,
    webrtcUrl: `${mediamtxBase}/${pathName}`,
    hlsUrl: `${mediamtxBase}/${pathName}/index.m3u8`,
    tokenExpiresIn: "24h",
  };
};

/**
 * Stop Stream
 * Invalidates the active stream session. Instructs MediaMTX to drop readers on the path.
 * 
 * @param input - Camera ID
 * @param user - Requesting user
 */
export const stopStream = async (input: StopStreamInput, user: JwtAccessPayload) => {
  const { cameraId, sessionId } = input;

  const session = await StreamSession.findOne({
    sessionId,
    cameraId: new mongoose.Types.ObjectId(cameraId),
    isActive: true,
  });

  if (!session) {
    throw ApiError.notFound("Active stream session");
  }

  // Only the owner, admin, or franchise manager can stop a session
  const isOwner = session.userId.toString() === user.userId;
  const isAdmin = user.role === "super_admin" || user.role === "admin";
  const isFranchise = user.role === "franchise" || user.role === "franchise_admin";
  if (!isOwner && !isAdmin && !isFranchise) {
    throw ApiError.forbidden("You can only stop your own stream sessions");
  }

  session.isActive = false;
  session.endedAt = new Date();
  await session.save();

  // Check if any other sessions are still watching this camera
  const remainingCount = await StreamSession.countDocuments({
    cameraId: new mongoose.Types.ObjectId(cameraId),
    isActive: true,
  });

  logActivity({
    userId: user.userId === "system" ? session.cameraId : new mongoose.Types.ObjectId(user.userId),
    action: "STREAM_STOPPED",
    description: `Stream session stopped (${remainingCount} remaining)`,
    metadata: { cameraId, sessionId, remainingActiveSessions: remainingCount },
  });

  logger.info(`📹 Stream stopped: session ${sessionId} — ${remainingCount} sessions still active on camera ${cameraId}`);

  return {
    sessionId,
    endedAt: session.endedAt,
    remainingActiveSessions: remainingCount,
  };
};

import { Subscription } from "../models/Subscription";

/**
 * Get a fresh stream token for a camera the user already has access to.
 * Does NOT create a new StreamSession (user is already watching).
 */
export const getStreamToken = async (
  cameraId: string,
  user: JwtAccessPayload
) => {
  if (!mongoose.Types.ObjectId.isValid(cameraId)) {
    throw ApiError.badRequest("Invalid camera ID format");
  }

  const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");

  await validateCameraAccess(camera, user);

  // Enforce Subscription Check for Customers
  if (user.role === "customer") {
    const activeSub = await Subscription.findOne({ customerId: user.userId, status: "active" });
    if (!activeSub) {
      throw ApiError.forbidden("Active subscription required to view camera streams");
    }
  }

  // Ensure path is registered
  const pathName = toPathName(camera.serialNumber);
  await addMediaMTXPath(pathName, camera.rtspUrl);

  const sessionId = uuidv4();
  const token = signStreamToken(camera._id.toString(), user.userId, sessionId, pathName);

  return {
    streamToken: token,
    pathName,
    webrtcUrl: `${env.MEDIAMTX_URL}/${pathName}`,
    tokenExpiresIn: "24h",
  };
};

/**
 * Get stream status for a specific camera.
 * Combines MediaMTX live path info + active session count from DB.
 */
export const getStreamStatus = async (
  cameraId: string,
  user: JwtAccessPayload
) => {
  if (!mongoose.Types.ObjectId.isValid(cameraId)) {
    throw ApiError.badRequest("Invalid camera ID format");
  }

  const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");

  await validateCameraAccess(camera, user);

  const pathName = toPathName(camera.serialNumber);
  const [pathStatus, sessionCount] = await Promise.all([
    getMediaMTXPathStatus(pathName),
    StreamSession.countDocuments({
      cameraId: new mongoose.Types.ObjectId(cameraId),
      isActive: true,
    }),
  ]);

  return {
    cameraId,
    pathName,
    isLive: pathStatus?.ready ?? false,
    activeViewers: sessionCount,
    mediamtxStatus: pathStatus ?? null,
  };
};

/**
 * List Active Streams
 * Returns a list of ongoing stream sessions for cameras the user can access.
 * 
 * @param user - Requesting user
 */
export const listActiveStreams = async (user: JwtAccessPayload) => {
  const filter: Record<string, unknown> = { isActive: true };

  const isAdmin = user.role === "super_admin" || user.role === "admin";
  if (!isAdmin) {
    filter.userId = new mongoose.Types.ObjectId(user.userId);
  }

  const sessions = await StreamSession.find(filter)
    .populate("cameraId", "name serialNumber status")
    .populate("userId", "name email role")
    .sort({ startedAt: -1 })
    .lean();

  return sessions;
};

/**
 * Verify a stream token — used by the MediaMTX auth webhook.
 * Returns the decoded payload if valid, throws ApiError if not.
 */
export const verifyStreamToken = async (token: string) => {
  try {
    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET) as {
      type: string;
      cameraId: string;
      userId: string;
      sessionId: string;
      pathName: string;
    };

    if (decoded.type !== "stream") {
      throw ApiError.unauthorized("Invalid token type");
    }

    // Verify the session is still active
    const tokenHash = hashToken(token);
    const session = await StreamSession.findOne({
      tokenHash,
      sessionId: decoded.sessionId,
      isActive: true,
    });

    if (!session) {
      throw ApiError.unauthorized("Stream session not found or already ended");
    }

    return decoded;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const name = (err as Error).name;
    if (name === "TokenExpiredError") throw ApiError.unauthorized("Stream token expired");
    if (name === "JsonWebTokenError") throw ApiError.unauthorized("Invalid stream token");
    throw err;
  }
};

/**
 * WebRTC signaling relay — forward offer to MediaMTX.
 */
export const relayWebRTCOffer = async (
  cameraId: string,
  sdp: string,
  user: JwtAccessPayload
) => {
  if (!mongoose.Types.ObjectId.isValid(cameraId)) {
    throw ApiError.badRequest("Invalid camera ID format");
  }

  const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");

  await validateCameraAccess(camera, user);

  // Enforce Subscription Check for Customers
  if (user.role === "customer") {
    const activeSub = await Subscription.findOne({ customerId: user.userId, status: "active" });
    if (!activeSub) {
      throw ApiError.forbidden("Active subscription required for WebRTC streaming");
    }
  }

  const pathName = toPathName(camera.serialNumber);

  // Forward the SDP offer to MediaMTX's WebRTC endpoint
  try {
    const res = await fetch(`${env.MEDIAMTX_URL}/${pathName}/whep`, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: sdp,
      signal: AbortSignal.timeout(30000) // Give MediaMTX up to 15 seconds to pull the RTSP stream
    });

    if (res.status === 404) {
      throw ApiError.notFound("The camera stream path is offline. Ensure your RTSP source (VLC) is actively running and streaming to " + camera.rtspUrl);
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      logger.error(`MediaMTX WHEP Error: ${res.status} ${res.statusText} - ${errText}`);
      if (errText.includes("timed out") || errText.includes("source of path")) {
        throw ApiError.serviceUnavailable(
          `Camera RTSP stream is offline or unreachable (${camera.rtspUrl}). Ensure your camera/FFmpeg is actively broadcasting.`
        );
      }
      throw ApiError.serviceUnavailable(`MediaMTX WebRTC error (${res.status}): ${errText || res.statusText}`);
    }

    const answerSdp = await res.text();
    const location = res.headers.get("location");

    return {
      type: "answer",
      sdp: answerSdp,
      sessionUrl: location, // Client uses this to send ICE candidates
    };
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    logger.error(`MediaMTX Fetch failed: ${err?.message || err}`);
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw ApiError.serviceUnavailable("MediaMTX took too long to respond. Your VLC stream might be hanging or not sending video frames.");
    }
    throw ApiError.serviceUnavailable(
      "MediaMTX is not reachable. Ensure MediaMTX is running and configured."
    );
  }
};

/**
 * Fetch ICE candidates from a MediaMTX WebRTC session.
 */
export const getICECandidates = async (
  cameraId: string,
  user: JwtAccessPayload
) => {
  if (!mongoose.Types.ObjectId.isValid(cameraId)) {
    throw ApiError.badRequest("Invalid camera ID format");
  }

  const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");

  await validateCameraAccess(camera, user);

  // ICE candidates in WHEP flow are delivered via the SDP answer — this
  // endpoint returns the stream path info needed by the client.
  const pathName = toPathName(camera.serialNumber);
  return {
    pathName,
    webrtcUrl: `${env.MEDIAMTX_URL}/${pathName}`,
    whepUrl: `${env.MEDIAMTX_URL}/${pathName}/whep`,
    message: "Use WHEP protocol to connect. ICE candidates are exchanged via the WHEP signaling flow.",
  };
};
