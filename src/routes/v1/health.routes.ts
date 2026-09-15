/**
 * @file health.routes.ts
 * @description Health & Diagnostics routes mounted at /api/v1/health.
 */
import { Router } from "express";
import * as healthController from "../../controllers/health.controller";

const router = Router();

// GET /api/v1/health - Dynamic full health report
router.get("/", healthController.getHealth);

// GET /api/v1/health/live - Liveness probe
router.get("/live", healthController.getLiveness);

// GET /api/v1/health/ready - Readiness probe
router.get("/ready", healthController.getReadiness);

export default router;
