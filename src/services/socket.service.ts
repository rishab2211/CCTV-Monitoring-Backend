import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { JwtAccessPayload } from "../types";

class SocketService {
  private io: Server | null = null;

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
   * Emit an event to all users subscribed to a specific camera.
   */
  public emitToCamera(cameraId: string, event: string, payload: any) {
    if (!this.io) {
      logger.warn("[Socket.IO] Cannot emit event, server not initialized");
      return;
    }
    const roomName = `camera_${cameraId}`;
    this.io.to(roomName).emit(event, payload);
    logger.debug(`[Socket.IO] Emitted '${event}' to ${roomName}`);
  }

  /**
   * Emit an event globally to all connected clients.
   */
  public emitGlobal(event: string, payload: any) {
    if (!this.io) return;
    this.io.emit(event, payload);
  }
}

export const socketService = new SocketService();
