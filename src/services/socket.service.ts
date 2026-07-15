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

class SocketService {
  private io: Server | null = null;

  /**
   * Initializes the Socket.IO server attached to the main HTTP server.
   * Sets up CORS and the JWT authentication middleware.
   */
  public initialize(server: HttpServer) {
    this.io = new Server(server, {
      cors: {
        origin: "*", // In production, this should be restricted to the frontend URL
        methods: ["GET", "POST"],
      },
    });

    // Authentication Middleware
    this.io.use((socket: Socket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(" ")[1];
      
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

      // Client can request to join specific camera rooms to receive alerts for them
      socket.on("join_camera", (cameraId: string) => {
        const roomName = `camera_${cameraId}`;
        socket.join(roomName);
        logger.debug(`[Socket.IO] User ${user.userId} joined room ${roomName}`);
      });

      socket.on("leave_camera", (cameraId: string) => {
        const roomName = `camera_${cameraId}`;
        socket.leave(roomName);
        logger.debug(`[Socket.IO] User ${user.userId} left room ${roomName}`);
      });

      socket.on("disconnect", () => {
        logger.debug(`[Socket.IO] Client disconnected: ${user.userId}`);
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
   * Emit Global Event
   * Broadcasts an event to all connected clients globally.
   * Used for system-wide notifications or targeted user notifications via uniquely named events.
   * 
   * @param event - Event name (e.g., 'notification:1234')
   * @param data - Payload to send
   */
  public emitGlobal(event: string, data: any) {
    if (!this.io) return;
    this.io.emit(event, data);
  }

  /**
   * Emit to a specific user
   * Because users can have multiple sockets, we could use a user-specific room
   * But for simplicity with global emits, we emit globally with a user-specific event name,
   * OR we could maintain a map of user to socket IDs.
   * Assuming the client listens to `event_name` globally and filters, or listens to `event_name:${userId}`.
   * We will emit `event:${userId}` globally.
   */
  public emitToUser(userId: string, event: string, data: any) {
    if (!this.io) return;
    this.io.emit(`${event}:${userId}`, data);
  }
}

export const socketService = new SocketService();
