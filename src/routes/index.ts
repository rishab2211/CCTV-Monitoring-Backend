import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import v1Router from "./v1";

const router = Router();

// ─── API Version Mounting ─────────────────────────────────────────────────────

router.use("/v1", v1Router);

// ─── Health Check ─────────────────────────────────────────────────────────────

router.get("/health", (_req: Request, res: Response) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  const status = isDbConnected ? 200 : 503;

  res.status(status).json({
    success: isDbConnected,
    message: isDbConnected ? "CCTV Monitoring API is healthy" : "Database disconnected",
    version: "1.0.0",
    services: {
      database: isDbConnected ? "connected" : "disconnected",
      uptimeSeconds: Math.floor(process.uptime()),
    },
    memory: {
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});


export default router;
