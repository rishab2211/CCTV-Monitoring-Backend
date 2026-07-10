import { Router } from "express";
import authRoutes from "./auth.routes";

const router = Router();

// ─── Mount Module Routes ──────────────────────────────────────────────────────
router.use("/auth", authRoutes);

// Future modules will be added here as they are built:
// router.use("/users", userRoutes);
// router.use("/roles", roleRoutes);
// router.use("/cameras", cameraRoutes);
// router.use("/streams", streamRoutes);
// router.use("/recordings", recordingRoutes);
// router.use("/alerts", alertRoutes);
// router.use("/notifications", notificationRoutes);
// router.use("/sos", sosRoutes);
// router.use("/incidents", incidentRoutes);
// router.use("/franchises", franchiseRoutes);
// router.use("/installations", installationRoutes);
// router.use("/operator", operatorRoutes);
// router.use("/customer", customerRoutes);
// router.use("/plans", planRoutes);
// router.use("/subscriptions", subscriptionRoutes);
// router.use("/payments", paymentRoutes);
// router.use("/analytics", analyticsRoutes);
// router.use("/audit-logs", auditRoutes);
// router.use("/tickets", ticketRoutes);
// router.use("/settings", settingsRoutes);

export default router;
