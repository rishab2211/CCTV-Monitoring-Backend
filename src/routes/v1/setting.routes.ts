/**
 * @file setting.routes.ts
 * @description Express Router for Module 20 (System Settings).
 */
import { Router } from "express";
import * as settingController from "../../controllers/setting.controller";
import { authenticate } from "../../middleware/auth";
import { permit } from "../../middleware/permit";

const router = Router();

// Require authentication for all routes
router.use(authenticate);

// ─── Global Settings ─────────────────────────────────────────────────────────

// GET available to admin, PUT available to super_admin
router.get("/", permit("settings:view"), settingController.getSystemSettings);
router.put("/", permit("settings:manage"), settingController.updateSystemSettings);

// ─── Notification Settings ───────────────────────────────────────────────────

router.get("/notifications", permit("settings:view"), settingController.getNotificationSettings);
router.put("/notifications", permit("settings:manage"), settingController.updateNotificationSettings);

// ─── Recording Settings ──────────────────────────────────────────────────────

router.get("/recording", permit("settings:view"), settingController.getRecordingSettings);
router.put("/recording", permit("settings:manage"), settingController.updateRecordingSettings);

export default router;
