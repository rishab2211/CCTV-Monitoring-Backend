import { Router } from "express";
import * as notificationController from "../../controllers/notification.controller";
import { authenticate } from "../../middleware/auth";
import { permit } from "../../middleware/permit";
import { validate } from "../../middleware/validate";
import {
  registerDeviceSchema,
  listNotificationsQuerySchema,
  notificationIdParamSchema,
  updatePreferencesSchema,
} from "../../validators/notification.validator";

const router = Router();

// All notification endpoints require authentication
router.use(authenticate);

// ─── Preferences & Devices ────────────────────────────────────────────────────

router.post(
  "/register-device",
  permit("notifications:read"),
  validate(registerDeviceSchema),
  notificationController.registerDevice
);

router.get(
  "/preferences",
  permit("notifications:read"),
  notificationController.getPreferences
);

router.put(
  "/preferences",
  permit("notifications:read"),
  validate(updatePreferencesSchema),
  notificationController.updatePreferences
);

// ─── In-App Notifications Lifecycle ───────────────────────────────────────────

router.get(
  "/",
  permit("notifications:read"),
  validate(listNotificationsQuerySchema, "query"),
  notificationController.getNotifications
);

router.patch(
  "/read-all",
  permit("notifications:read"),
  notificationController.markAllAsRead
);

router.get(
  "/:id",
  permit("notifications:read"),
  validate(notificationIdParamSchema, "params"),
  notificationController.getNotificationDetail
);

router.patch(
  "/:id/read",
  permit("notifications:read"),
  validate(notificationIdParamSchema, "params"),
  notificationController.markAsRead
);

router.delete(
  "/:id",
  permit("notifications:read"),
  validate(notificationIdParamSchema, "params"),
  notificationController.deleteNotification
);

export default router;
