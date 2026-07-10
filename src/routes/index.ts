import { Router, Request, Response } from "express";
import v1Router from "./v1";

const router = Router();

// ─── API Version Mounting ─────────────────────────────────────────────────────

router.use("/v1", v1Router);

// ─── Health Check ─────────────────────────────────────────────────────────────

router.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "CCTV Monitoring API is running",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

export default router;
