import mongoose from "mongoose";
import { TalkbackSession } from "../models/TalkbackSession";
import { Camera } from "../models/Camera";
import { ApiError } from "../utils/ApiError";
import { JwtAccessPayload } from "../types";
import { validateCameraAccess } from "./camera.service";
import { logActivity } from "../models/ActivityLog";
import { socketService } from "./socket.service";
import { env } from "../config/env";

/**
 * Get Talkback Capabilities
 * Checks if a specific camera supports two-way audio (talkback).
 * 
 * @param cameraId - The ID of the camera
 * @param user - The authenticated user requesting capabilities
 * @returns Object indicating audioIn and audioOut support
 */
export const getCapabilities = async (cameraId: string, user: JwtAccessPayload) => {
  const camera = await Camera.findOne({ _id: cameraId, isDeleted: false }).lean();
  if (!camera) throw ApiError.notFound("Camera");
  await validateCameraAccess(camera as any, user);

  return {
    audioIn: true, // Assuming we always support incoming audio (listening)
    audioOut: camera.settings.talkbackEnabled, // Talkback capability
  };
};

/**
 * Start Talkback Session
 * Initiates a two-way audio session. Ensures that the camera supports talkback 
 * and prevents multiple operators from talking to the same camera concurrently.
 * Returns a MediaMTX WHIP URL for the frontend to publish WebRTC audio.
 * 
 * @param cameraId - The target camera ID
 * @param user - The operator starting the session
 * @returns The session details and WebRTC WHIP ingestion URL
 */
export const startSession = async (cameraId: string, user: JwtAccessPayload) => {
  const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");
  await validateCameraAccess(camera, user);

  if (!camera.settings.talkbackEnabled) {
    throw ApiError.badRequest("Talkback is not enabled for this camera");
  }

  // Check concurrency: Ensure no other operator is currently talking to this camera
  const existingSession = await TalkbackSession.findOne({
    cameraId,
    status: "active",
  });

  if (existingSession) {
    const isStale = (Date.now() - new Date(existingSession.startedAt).getTime()) > 15 * 60 * 1000;
    if (isStale) {
      existingSession.status = "completed";

      existingSession.endedAt = new Date();
      await existingSession.save();
    } else if (existingSession.operatorId.toString() === user.userId) {
      // It's the same operator, just return the existing session
      return {
        session: existingSession,
        whipUrl: `${env.MEDIAMTX_URL}/camera_${cameraId}_talkback/whip`,
      };
    } else {
      throw ApiError.conflict("Camera is already in an active talkback session with another operator");
    }
  }


  // Create new session
  const session = await TalkbackSession.create({
    cameraId,
    franchiseId: camera.franchiseId,
    operatorId: user.userId,
    status: "active",
  });

  // Emit socket event so frontend knows the camera is busy
  socketService.emitToCamera(cameraId, "talkback_started", {
    sessionId: session._id,
    operatorId: user.userId,
    startedAt: session.startedAt,
  });

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "TALKBACK_STARTED",
    description: `Started talkback session on camera ${camera.name}`,
    metadata: { sessionId: session._id, cameraId },
  });

  // Return the MediaMTX WHIP URL for the frontend to publish WebRTC audio to
  return {
    session,
    whipUrl: `${env.MEDIAMTX_URL}/camera_${cameraId}_talkback/whip`,
  };
};

/**
 * Stop Talkback Session
 * Ends an active talkback session, calculates its total duration, 
 * and broadcasts the termination event to other dashboards via WebSocket.
 * 
 * @param cameraId - The target camera ID
 * @param user - The operator who started the session
 * @returns The completed session document
 */
export const stopSession = async (cameraId: string, user: JwtAccessPayload) => {
  const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera");
  await validateCameraAccess(camera, user);

  const sessionQuery: any = { cameraId, status: "active" };
  const isAdminOrFranchise = ["super_admin", "admin", "franchise", "franchise_admin"].includes(user.role);
  if (!isAdminOrFranchise) {
    sessionQuery.operatorId = user.userId;
  }

  const session = await TalkbackSession.findOne(sessionQuery);

  if (!session) {
    throw ApiError.notFound("No active talkback session found on this camera");
  }

  session.status = "completed";
  session.endedAt = new Date();
  session.durationSeconds = Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 1000);
  await session.save();

  socketService.emitToCamera(cameraId, "talkback_stopped", {
    sessionId: session._id,
    endedAt: session.endedAt,
    durationSeconds: session.durationSeconds,
  });

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "TALKBACK_STOPPED",
    description: `Stopped talkback session on camera ${camera.name}`,
    metadata: { sessionId: session._id, cameraId, durationSeconds: session.durationSeconds },
  });

  return session;
};

/**
 * Get Session Status
 * Checks if a specific camera is currently in an active talkback session.
 * Used by frontends to determine if the microphone button should be locked.
 * 
 * @param cameraId - The target camera ID
 * @param user - The requesting user
 */
export const getSessionStatus = async (cameraId: string, user: JwtAccessPayload) => {
  const camera = await Camera.findOne({ _id: cameraId, isDeleted: false }).lean();
  if (!camera) throw ApiError.notFound("Camera");
  await validateCameraAccess(camera as any, user);

  const session = await TalkbackSession.findOne({
    cameraId,
    status: "active",
  }).populate("operatorId", "name role");

  return {
    isActive: !!session,
    session: session || null,
  };
};

/**
 * Get Talkback Logs
 * Retrieves a paginated history of talkback sessions. 
 * Automatically filters results based on the user's role and assignments.
 * 
 * @param query - Pagination and filter query params
 * @param user - The requesting user
 */
export const getLogs = async (query: any, user: JwtAccessPayload) => {
  const { page, limit, cameraId, operatorId, status } = query;
  const filter: any = {};

  if (cameraId) {
    const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
    if (!camera) throw ApiError.notFound("Camera");
    await validateCameraAccess(camera, user);
    filter.cameraId = cameraId;
  } else if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId) throw ApiError.forbidden("No franchise associated with your account");
    filter.franchiseId = user.franchiseId;
  } else if (user.role !== "super_admin" && user.role !== "admin") {
    // Non-admins can only see logs for cameras they are assigned to
    const accessibleCameras = await Camera.find({
      $or: [{ operatorIds: user.userId }, { customerId: user.userId }],
      isDeleted: false,
    }).select("_id");
    filter.cameraId = { $in: accessibleCameras.map((c) => c._id) };
  }

  if (operatorId) {
    // If not an admin, ensure they can only query their own logs if they specify operatorId
    if (user.role !== "super_admin" && user.role !== "admin" && operatorId !== user.userId) {
      throw ApiError.forbidden("You can only view your own talkback logs");
    }
    filter.operatorId = operatorId;
  }

  if (status) filter.status = status;

  const skip = (page - 1) * limit;
  const [logs, total] = await Promise.all([
    TalkbackSession.find(filter)
      .populate("cameraId", "name serialNumber")
      .populate("operatorId", "name role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    TalkbackSession.countDocuments(filter),
  ]);

  return { logs, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Get Active Sessions (Admin Only)
 * Retrieves a list of all currently active talkback sessions system-wide.
 * 
 * @param user - The admin user requesting the active sessions list
 */
export const getActiveSessions = async (user: JwtAccessPayload) => {
  const matchStage: any = { status: "active" };

  if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId) throw ApiError.forbidden("No franchise associated with your account");
    matchStage.franchiseId = user.franchiseId;
  } else if (user.role !== "super_admin" && user.role !== "admin") {
    throw ApiError.forbidden("Requires admin privileges");
  }

  const activeSessions = await TalkbackSession.find(matchStage)
    .populate("cameraId", "name")
    .populate("operatorId", "name role")
    .sort({ startedAt: -1 })
    .lean();

  return activeSessions;
};
