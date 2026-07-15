import { app } from "./app";
import { connectDB } from "./config/database";
import { configureCloudinary } from "./config/cloudinary";
import { verifyEmailConnection } from "./services/email.service";
import { seedPermissionsAndRoles } from "./config/permissions.seed";
import { syncMediaMTXPaths } from "./config/mediamtx.service";
import { env } from "./config/env";
import { logger } from "./utils/logger";

const startServer = async (): Promise<void> => {
  try {
    // ── Connect to MongoDB ────────────────────────────────────────────────────
    await connectDB();

    // ── Seed permissions and roles (idempotent) ───────────────────────────
    await seedPermissionsAndRoles();

    // ── Sync camera paths to MediaMTX (non-fatal if MediaMTX not running) ──
    await syncMediaMTXPaths();

    // ── Configure external services ───────────────────────────────────────────
    configureCloudinary();
    await verifyEmailConnection(); // Non-blocking — logs warning on failure

    // ── Start HTTP server ─────────────────────────────────────────────────────
    const server = app.listen(env.PORT, () => {
      logger.info(`
╔══════════════════════════════════════════════════════╗
║           CCTV Monitoring Backend                    ║
╠══════════════════════════════════════════════════════╣
║  Status   : Running                                  ║
║  Port     : ${String(env.PORT).padEnd(38)}║
║  Mode     : ${env.NODE_ENV.padEnd(38)}║
║  API Base : http://localhost:${env.PORT}/api/v1${"".padEnd(9)}║
║  Health   : http://localhost:${env.PORT}/api/health${"".padEnd(7)}║
╚══════════════════════════════════════════════════════╝
      `.trim());
    });

    // ── Graceful Shutdown ─────────────────────────────────────────────────────
    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.info(`\n⚠️  ${signal} received. Shutting down gracefully...`);

      server.close(async () => {
        logger.info("✅ HTTP server closed");

        try {
          const mongoose = await import("mongoose");
          await mongoose.default.connection.close();
          logger.info("✅ MongoDB connection closed");
        } catch (err) {
          logger.error("Error closing MongoDB connection:", err);
        }

        logger.info("👋 Goodbye!");
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error("💥 Forced shutdown after timeout");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    // ── Unhandled rejections ──────────────────────────────────────────────────
    process.on("unhandledRejection", (reason, promise) => {
      logger.error("Unhandled Rejection at:", promise, "reason:", reason);
      // Don't exit — log and continue (let health checks detect degraded state)
    });

    process.on("uncaughtException", (err) => {
      logger.error("Uncaught Exception:", err);
      gracefulShutdown("uncaughtException");
    });
  } catch (error) {
    logger.error("💥 Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
