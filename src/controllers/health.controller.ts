/**
 * @file health.controller.ts
 * @description Express request handlers for dynamic system health, liveness, and readiness probes.
 */
import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import * as healthService from "../services/health.service";

/**
 * GET /api/v1/health
 * Comprehensive dynamic health check for all platform services.
 */
export const getHealth = catchAsync(async (_req: Request, res: Response) => {
  const result = await healthService.getFullHealthStatus();
  res.status(result.statusCode).json(result);
});

/**
 * GET /api/v1/health/live
 * Process liveness probe: returns 200 OK if Express process is responding.
 */
export const getLiveness = catchAsync(async (_req: Request, res: Response) => {
  res.status(200).json({
    status: "alive",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

/**
 * GET /api/v1/health/ready
 * Container readiness probe: returns 200 if MongoDB is connected, 503 if disconnected.
 */
export const getReadiness = catchAsync(async (_req: Request, res: Response) => {
  const isReady = healthService.isDatabaseReady();
  const statusCode = isReady ? 200 : 503;

  res.status(statusCode).json({
    status: isReady ? "ready" : "not_ready",
    database: isReady ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});
