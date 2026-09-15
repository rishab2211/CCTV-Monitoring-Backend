import { Router } from "express";
import v1Router from "./v1";
import healthRoutes from "./v1/health.routes";

const router = Router();

// ─── API Version Mounting ─────────────────────────────────────────────────────

router.use("/v1", v1Router);

// ─── Backwards Compatibility Health Route (/api/health) ───────────────────────
// Delegates to /api/v1/health handlers
router.use("/health", healthRoutes);

export default router;
