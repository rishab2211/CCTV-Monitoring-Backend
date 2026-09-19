import { app } from "./app";
import { connectDB } from "./config/database";
import { configureCloudinary } from "./config/cloudinary";
import { verifyEmailConnection } from "./services/email.service";
import { seedPermissionsAndRoles } from "./config/permissions.seed";
import { syncMediaMTXPaths } from "./config/mediamtx.service";
import { ensureDemoDataSeeded } from "./config/demo-seed";
import { getPublicBaseUrl } from "./utils/url";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { socketService } from "./services/socket.service";

const startServer = async (): Promise<void> => {
  const startTime = Date.now();

  logger.info("🚀 Starting CCTV Monitoring Backend System...");
  logger.info(`📋 Environment: ${env.NODE_ENV} | Node: ${process.version} | PID: ${process.pid}`);

  try {
    // ── Stage 1: Connect to MongoDB ─────────────────────────────────────────
    const dbStartTime = Date.now();
    logger.info("📦 [1/6] Connecting to MongoDB Database...");
    await connectDB();
    logger.info(`✅ [1/6] MongoDB Connected (${Date.now() - dbStartTime}ms)`);

    // ── Stage 2: Seed Permissions and Roles ─────────────────────────────────
    const seedStartTime = Date.now();
    logger.info("🔐 [2/6] Seeding System Permissions & Roles...");
    await seedPermissionsAndRoles();

    // Verify & sync demo accounts and cameras if demo feeds are enabled
    if (env.ENABLE_DEMO_FEEDS) {
      await ensureDemoDataSeeded();
    }
    logger.info(`✅ [2/6] Permissions, Roles & Demo State Synced (${Date.now() - seedStartTime}ms)`);

    // ── Stage 3: Sync MediaMTX Paths ────────────────────────────────────────
    const mediaStartTime = Date.now();
    logger.info("📹 [3/6] Syncing MediaMTX Camera Stream Paths...");
    await syncMediaMTXPaths();
    logger.info(`✅ [3/6] MediaMTX Stream Paths Synced (${Date.now() - mediaStartTime}ms)`);

    // ── Stage 4: Configure External Services ────────────────────────────────
    const extStartTime = Date.now();
    logger.info("⚙️  [4/6] Initializing External Services (Cloudinary & SMTP)...");
    configureCloudinary();
    // Non-blocking async verification so slow or blocked SMTP handshakes never delay HTTP server startup
    verifyEmailConnection().catch((err) => {
      logger.warn("⚠️  Async SMTP verification error:", err);
    });
    logger.info(`✅ [4/6] External Services Initialized (${Date.now() - extStartTime}ms)`);

    // ── Stage 5: Start HTTP Server ──────────────────────────────────────────
    const httpStartTime = Date.now();
    logger.info(`📡 [5/6] Binding HTTP Server to Port ${env.PORT}...`);

    const server = app.listen(env.PORT, "0.0.0.0", () => {
      const bootDuration = Date.now() - startTime;
      const publicUrl = getPublicBaseUrl();

      logger.info(`✅ [5/6] HTTP Server Ready (${Date.now() - httpStartTime}ms)`);

      // ── Stage 6: Initialize WebSockets ───────────────────────────────────
      const socketStartTime = Date.now();
      logger.info("🔌 [6/6] Initializing Socket.IO WebSocket Engine...");
      socketService.initialize(server);
      logger.info(`✅ [6/6] WebSocket Engine Ready (${Date.now() - socketStartTime}ms)`);

      // ── Print System Banner ──────────────────────────────────────────────
      const banner = [
        "════════════════════════════════════════════════════════════════",
        "         📹 CCTV Monitoring Backend Service Online              ",
        "════════════════════════════════════════════════════════════════",
        `  Status      :  ACTIVE & READY`,
        `  Environment :  ${env.NODE_ENV.toUpperCase()}`,
        `  Server Port :  ${env.PORT}`,
        `  Process ID  :  ${process.pid}`,
        `  API Base    :  ${publicUrl}/api/v1`,
        `  Health Check:  ${publicUrl}/api/v1/health`,
        `  HLS Stream  :  ${publicUrl}/hls/<camera-path>/index.m3u8`,
        `  WebSockets  :  ${publicUrl.replace(/^http/, "ws")}`,
        `  Boot Time   :  ${bootDuration} ms`,
        "════════════════════════════════════════════════════════════════",
      ].join("\n");

      logger.info(`\n${banner}\n`);
    });

    // ── Graceful Shutdown Handler ───────────────────────────────────────────
    let isShuttingDown = false;

    const gracefulShutdown = async (signal: string): Promise<void> => {
      if (isShuttingDown) {
        logger.warn(`⚠️  Received ${signal} again. Force shutdown in progress...`);
        return;
      }
      isShuttingDown = true;
      const shutdownStart = Date.now();

      logger.info(`\n🛑 [Shutdown] Received signal '${signal}'. Initiating graceful shutdown...`);

      // Set force exit timer (10s timeout)
      const forceExitTimer = setTimeout(() => {
        logger.error("💥 [Shutdown] Graceful shutdown timed out (10s). Forcing termination!");
        process.exit(1);
      }, 10000);

      // Unref timer so it doesn't keep the event loop alive if everything closes cleanly
      forceExitTimer.unref();

      try {
        // Step 1: Close HTTP server (stops accepting new incoming requests)
        await new Promise<void>((resolve, reject) => {
          server.close((err) => {
            if (err) return reject(err);
            logger.info("✅ [Shutdown] HTTP server closed (no longer accepting requests)");
            resolve();
          });
        });

        // Step 2: Close MongoDB Connection
        const mongoose = await import("mongoose");
        if (mongoose.default.connection.readyState !== 0) {
          await mongoose.default.connection.close();
          logger.info("✅ [Shutdown] MongoDB database connection closed cleanly");
        }

        const duration = Date.now() - shutdownStart;
        logger.info(`✨ [Shutdown] Graceful shutdown completed in ${duration}ms. Goodbye! 👋`);
        process.exit(0);
      } catch (err) {
        logger.error("💥 [Shutdown] Error encountered during shutdown sequence:", err);
        process.exit(1);
      }
    };

    // Listen for OS Termination signals
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    // ── Global Error Catchers ───────────────────────────────────────────────
    process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
      logger.error("🚨 [Unhandled Rejection] at promise:", promise, "reason:", reason);
    });

    process.on("uncaughtException", (error: Error) => {
      logger.error("🚨 [Uncaught Exception] Critical application error:", error);
      gracefulShutdown("uncaughtException");
    });

  } catch (error) {
    logger.error("💥 [Fatal Error] Failed to boot server:", error);
    process.exit(1);
  }
};

startServer();

