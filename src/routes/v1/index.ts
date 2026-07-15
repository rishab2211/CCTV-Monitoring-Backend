import { Router } from "express";
import authRoutes from "./auth.routes";
import userRoutes from "./user.routes";
import adminRoutes from "./admin.routes";
import roleUserRoutes from "./roleUser.routes";
import roleRoutes from "./role.routes";
import cameraRoutes from "./camera.routes";
import streamRoutes from "./stream.routes";
import recordingRoutes from "./recording.routes";
import alertRoutes from "./alert.routes";
import talkbackRoutes from "./talkback.routes";
import notificationRoutes from "./notification.routes";
import sosRoutes from "./sos.routes";
import incidentRoutes from "./incident.routes";

const router = Router();

// ─── Module 1: Auth ───────────────────────────────────────────────────────────
router.use("/auth", authRoutes);

// ─── Module 2: User Management ───────────────────────────────────────────────
router.use("/users", userRoutes);
router.use("/admins", adminRoutes);
// /operators, /technicians, /customers are mounted at root level inside roleUserRoutes
router.use("/", roleUserRoutes);

// ─── Module 3: Role & Permission Management ──────────────────────────────────
// roleRoutes handles: /roles, /permissions, and /users/:id/roles
router.use("/", roleRoutes);

// ─── Module 4: Camera Management ─────────────────────────────────────────────
router.use("/cameras", cameraRoutes);

// ─── Module 5: Streaming ─────────────────────────────────────────────────────────
// streamRoutes handles: /streams/start, /streams/stop, /streams/auth, /streams/:cameraId/...
router.use("/streams", streamRoutes);

// ─── Module 6: Recording ─────────────────────────────────────────────────────────
router.use("/recordings", recordingRoutes);

// ─── Module 7: Alert Engine ────────────────────────────────────────────────────
router.use("/alerts", alertRoutes);

// ─── Module 8: Audio Talkback ──────────────────────────────────────────────────
router.use("/talkback", talkbackRoutes);

// ─── Module 9: Notification Module ───────────────────────────────────────────
router.use("/notifications", notificationRoutes);
// ─── Module 10: SOS Module ────────────────────────────────────────────────────
router.use("/sos", sosRoutes);

// ─── Module 11: Incident Management ──────────────────────────────────────────
router.use("/incidents", incidentRoutes);

// ─── Future Modules (uncomment as built) ─────────────────────────────────────
// router.use("/reports", reportRoutes);
// router.use("/billing", billingRoutes);
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
