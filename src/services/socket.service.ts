/**
 * @file socket.service.ts
 * @description Manages real-time WebSocket connections using Socket.IO.
 * Handles JWT authentication for socket handshakes and provides pub/sub rooms 
 * for camera-specific alerts and global notifications.
 */
import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { JwtAccessPayload } from "../types";
import mongoose from "mongoose";
import { Camera } from "../models/Camera";
import { validateCameraAccess } from "./camera.service";

import { isOriginAllowed } from "../utils/url";

class SocketService {
  private io: Server | null = null;

  /**
   * Initializes the Socket.IO server attached to the main HTTP server.
   * Sets up CORS and the JWT authentication middleware.
   */
  public initialize(server: HttpServer) {
    this.io = new Server(server, {
      path: "/socket.io/",
      cors: {
        origin: (origin, callback) => {
          if (isOriginAllowed(origin)) {
            callback(null, true);
          } else {
            callback(new Error("CORS not allowed"), false);
          }
        },
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket", "polling"],
      pingTimeout: 30000,
      pingInterval: 10000,
      allowUpgrades: true,
    });

    // Authentication Middleware
    this.io.use((socket: Socket, next) => {
      let rawToken = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
      if (typeof rawToken === "string") {
        if (rawToken.startsWith("Bearer ")) {
          rawToken = rawToken.slice(7).trim();
        } else if (rawToken.includes(" ")) {
          rawToken = rawToken.split(" ")[1]?.trim();
        }
      }
      const token = rawToken;
      
      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      try {
        const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET) as JwtAccessPayload;
        // Attach user info to socket
        socket.data.user = decoded;
        next();
      } catch (error) {
        return next(new Error("Authentication error: Invalid token"));
      }
    });

    this.io.on("connection", (socket: Socket) => {
      const user = socket.data.user as JwtAccessPayload;
      logger.debug(`[Socket.IO] Client connected: ${user.userId} (${user.role})`);

      // Automatically join private per-user room
      const userRoom = `user_${user.userId}`;
      socket.join(userRoom);
      logger.debug(`[Socket.IO] User ${user.userId} joined private room ${userRoom}`);

      // Automatically join franchise room if user belongs to one
      if (user.franchiseId) {
        const franchiseRoom = `franchise_${user.franchiseId}`;
        socket.join(franchiseRoom);
        logger.debug(`[Socket.IO] User ${user.userId} joined room ${franchiseRoom}`);
      }

      // Staff roles join emergency monitors room for SOS panic boards & staff fleet dashboard
      if (["super_admin", "admin", "operator", "franchise_admin"].includes(user.role)) {
        socket.join("sos_monitors");
        socket.join("staff_dashboard");
        logger.debug(`[Socket.IO] User ${user.userId} joined staff_dashboard`);
      }

      // Per-socket rate limiting for join_camera requests (max 30 requests per 10s window)
      let joinRequestsCount = 0;
      let windowResetTime = Date.now() + 10000;

      // Client can request to join specific camera rooms to receive alerts for them
      socket.on("join_camera", async (cameraId: string) => {
        try {
          const now = Date.now();
          if (now > windowResetTime) {
            joinRequestsCount = 0;
            windowResetTime = now + 10000;
          }
          joinRequestsCount++;
          if (joinRequestsCount > 30) {
            logger.warn(`[Socket.IO] join_camera rate limit exceeded by user ${user.userId}`);
            socket.emit("error", { message: "Too many join requests. Please slow down." });
            return;
          }

          if (!cameraId || !mongoose.Types.ObjectId.isValid(cameraId)) {
            socket.emit("error", { message: "Invalid camera ID format" });
            return;
          }

          const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
          if (!camera) {
            socket.emit("error", { message: "Camera not found" });
            return;
          }

          await validateCameraAccess(camera, user);

          const roomName = `camera_${cameraId}`;
          socket.join(roomName);
          logger.debug(`[Socket.IO] User ${user.userId} joined room ${roomName}`);
        } catch (err: any) {
          logger.warn(`[Socket.IO] Unauthorized join_camera attempt by ${user.userId} for camera ${cameraId}: ${err.message}`);
          socket.emit("error", { message: err.message || "Unauthorized to join camera room" });
        }
      });


      socket.on("leave_camera", (cameraId: string) => {
        const roomName = `camera_${cameraId}`;
        socket.leave(roomName);
        logger.debug(`[Socket.IO] User ${user.userId} left room ${roomName}`);
      });

      socket.on("disconnect", async () => {
        logger.debug(`[Socket.IO] Client disconnected: ${user.userId}`);

        // Immediately close active stream sessions for this user to eliminate phantom viewer counts
        try {
          const { reapUserStreamSessions } = await import("./stream.service");
          await reapUserStreamSessions(user.userId);
        } catch (err: any) {
          logger.debug(`[Socket.IO] Stream session disconnect cleanup error: ${err.message}`);
        }

        // Only cleanup talkback sessions for roles that can initiate them
        if (["operator", "admin", "super_admin", "franchise_admin"].includes(user.role)) {
          try {
            const { handleOperatorDisconnect } = await import("./talkback.service");
            await handleOperatorDisconnect(user.userId);
          } catch (err: any) {
            logger.debug(`[Socket.IO] Disconnect cleanup error: ${err.message}`);
          }
        }
      });
    });

    logger.info("✅ Socket.IO initialized");
  }

  /**
   * Emit Event to Camera Room
   * Broadcasts an event to all clients currently joined to a specific camera's room.
   * Useful for camera-specific alerts, talkback statuses, and streaming events.
   * 
   * @param cameraId - Target camera ID
   * @param event - Event name (e.g., 'new_alert')
   * @param data - Payload to send
   */
  public emitToCamera(cameraId: string, event: string, data: any) {
    if (!this.io) {
      logger.warn("[Socket.IO] Cannot emit event, server not initialized");
      return;
    }
    const roomName = `camera_${cameraId}`;
    this.io.to(roomName).emit(event, data);
    logger.debug(`[Socket.IO] Emitted '${event}' to ${roomName}`);
  }

  /**
   * Emit Event to Franchise Room
   * Broadcasts to all users (admins, operators, etc.) within a specific franchise.
   */
  public emitToFranchise(franchiseId: string, event: string, data: any) {
    if (!this.io) return;
    const roomName = `franchise_${franchiseId}`;
    this.io.to(roomName).emit(event, data);
    logger.debug(`[Socket.IO] Emitted '${event}' to ${roomName}`);
  }

  /**
   * Emit Event to Staff Room
   * Broadcasts to all connected staff (super_admin, admin, franchise_admin, operator)
   * for fleet-wide dashboard synchronization without leaking to regular customers.
   */
  public emitToStaff(event: string, data: any) {
    if (!this.io) return;
    this.io.to("staff_dashboard").emit(event, data);
  }

  /**
   * Emit Global Event
   * Broadcasts an event to all connected clients globally.
   * Used for system-wide announcements.
   * 
   * @param event - Event name
   * @param data - Payload to send
   */
  public emitGlobal(event: string, data: any) {
    if (!this.io) return;
    this.io.emit(event, data);
  }

  /**
   * Emit to a specific user via private room.
   * Also emits `${event}:${userId}` for backwards compatibility with any client filtering patterns.
   */
  public emitToUser(userId: string, event: string, data: any) {
    if (!this.io) return;
    const roomName = `user_${userId}`;
    this.io.to(roomName).emit(event, data);
    this.io.to(roomName).emit(`${event}:${userId}`, data);
  }

  /**
   * Emit SOS alert event scoped to relevant audiences:
   * - sos_monitors (operators, admins, super_admins)
   * - franchise_<id> (franchise staff)
   * - user_<id> (triggering customer)
   * - camera_<id> (camera subscribers)
   * Prevents customer PII leak to other customers.
   */
  public emitSosAlert(event: string, sos: any) {
    if (!this.io) return;
    this.io.to("sos_monitors").emit(event, sos);

    if (sos.franchiseId) {
      const franchiseIdStr = sos.franchiseId._id ? sos.franchiseId._id.toString() : sos.franchiseId.toString();
      this.io.to(`franchise_${franchiseIdStr}`).emit(event, sos);
    }

    if (sos.triggeredBy) {
      const customerId = sos.triggeredBy._id ? sos.triggeredBy._id.toString() : sos.triggeredBy.toString();
      this.io.to(`user_${customerId}`).emit(event, sos);
    }

    if (sos.cameraId) {
      const camId = sos.cameraId._id ? sos.cameraId._id.toString() : sos.cameraId.toString();
      this.io.to(`camera_${camId}`).emit(event, sos);
    }
  }
}

export const socketService = new SocketService();
