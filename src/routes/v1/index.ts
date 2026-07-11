import { Router } from "express";
import authRoutes from "./auth.routes";
import userRoutes from "./user.routes";
import adminRoutes from "./admin.routes";
import roleUserRoutes from "./roleUser.routes";

const router = Router();

// ─── Module 1: Auth ───────────────────────────────────────────────────────────
router.use("/auth", authRoutes);

// ─── Module 2: User Management ───────────────────────────────────────────────
router.use("/users", userRoutes);
router.use("/admins", adminRoutes);
// /operators, /technicians, /customers are mounted at root level inside roleUserRoutes
router.use("/", roleUserRoutes);

// ─── Future Modules (uncomment as built) ─────────────────────────────────────
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
