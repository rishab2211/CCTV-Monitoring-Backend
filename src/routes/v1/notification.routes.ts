import { Router } from "express";
import * as notificationController from "../../controllers/notification.controller";
import { authenticate } from "../../middleware/auth";
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
  validate(registerDeviceSchema),
  notificationController.registerDevice
);

router.get(
  "/preferences",
  notificationController.getPreferences
);

router.put(
  "/preferences",
  validate(updatePreferencesSchema),
  notificationController.updatePreferences
);

// ─── In-App Notifications Lifecycle ───────────────────────────────────────────

router.get(
  "/",
  validate(listNotificationsQuerySchema, "query"),
  notificationController.getNotifications
);

router.patch(
  "/read-all",
  notificationController.markAllAsRead
);

router.get(
  "/:id",
  validate(notificationIdParamSchema, "params"),
  notificationController.getNotificationDetail
);

router.patch(
  "/:id/read",
  validate(notificationIdParamSchema, "params"),
  notificationController.markAsRead
);

router.delete(
  "/:id",
  validate(notificationIdParamSchema, "params"),
  notificationController.deleteNotification
);

export default router;
