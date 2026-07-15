import { initializeApp, cert } from "firebase-admin/app";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";
import mongoose from "mongoose";
import { Notification } from "../models/Notification";
import { DeviceToken } from "../models/DeviceToken";
import { User } from "../models/User";
import { ApiError } from "../utils/ApiError";
import { JwtAccessPayload, NotificationType } from "../types";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { socketService } from "./socket.service";

// ─── Initialize Firebase Admin ────────────────────────────────────────────────

let isFirebaseInitialized = false;

try {
  if (env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const serviceAccount = JSON.parse(
      Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8")
    );
    initializeApp({
      credential: cert(serviceAccount),
    });
    isFirebaseInitialized = true;
    logger.info("✅ Firebase Admin SDK initialized successfully");
  } else if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
    isFirebaseInitialized = true;
    logger.info("✅ Firebase Admin SDK initialized successfully");
  } else {
    logger.warn("⚠️ Firebase Admin credentials not found in env. Push notifications will be skipped.");
  }
} catch (error) {
  logger.error("❌ Failed to initialize Firebase Admin SDK", error);
}

// ─── Service Methods ──────────────────────────────────────────────────────────

/**
 * Register a Device Token for Push Notifications
 * Saves or updates a user's FCM device token in the database.
 * Uses an upsert query to prevent duplicate token entries if the same device re-registers.
 * 
 * @param userId - The ID of the authenticated user
 * @param token - The FCM registration token obtained from the client SDK
 * @param deviceType - The platform of the device (android, ios, web)
 * @returns The saved DeviceToken document
 */
export const registerDeviceToken = async (
  userId: string,
  token: string,
  deviceType: "android" | "ios" | "web"
) => {
  // Upsert token to prevent duplicates
  const deviceToken = await DeviceToken.findOneAndUpdate(
    { token },
    {
      userId: new mongoose.Types.ObjectId(userId),
      deviceType,
      lastUsedAt: new Date(),
    },
    { upsert: true, new: true }
  );
  return deviceToken;
};

/**
 * Internal system function to dispatch notifications (Push + InApp).
 * This acts as the central hub for all outgoing notifications.
 * It checks the user's granular notification preferences before dispatching.
 * 
 * 1. Saves an In-App notification to MongoDB and emits a live WebSocket event.
 * 2. Fetches all active device tokens for the user and sends a multicast FCM push.
 * 3. Automatically purges invalid/expired FCM tokens based on Google's response.
 * 
 * @param userId - The recipient user ID
 * @param title - Notification title
 * @param body - Notification body/message
 * @param type - Category of notification (alert, system, message)
 * @param referenceId - Optional related entity ID (e.g. Alert ID)
 */
export const sendNotification = async (
  userId: string,
  title: string,
  body: string,
  type: NotificationType,
  referenceId?: string
) => {
  const user = await User.findById(userId).select("notificationPreferences");
  if (!user) return;

  const prefCategory = type === "alert" ? "alerts" : "system";
  const prefs = user.notificationPreferences?.[prefCategory] || { push: true, inApp: true };

  // 1. In-App Notification (Save to DB)
  if (prefs.inApp) {
    const notification = await Notification.create({
      userId,
      title,
      body,
      type,
      referenceId,
    });

    // Emit live to dashboard
    socketService.emitGlobal(`notification:${userId}`, notification);
  }

  // 2. Push Notification (FCM)
  if (prefs.push && isFirebaseInitialized) {
    const tokens = await DeviceToken.find({ userId }).select("token");
    if (tokens.length > 0) {
      const fcmTokens = tokens.map((t) => t.token);

      const message: MulticastMessage = {
        tokens: fcmTokens,
        notification: { title, body },
        data: {
          type,
          referenceId: referenceId?.toString() || "",
        },
      };

      try {
        const response = await getMessaging().sendEachForMulticast(message);
        logger.debug(`[FCM] Sent multicast push. Success: ${response.successCount}, Failure: ${response.failureCount}`);
        
        // Clean up invalid tokens
        if (response.failureCount > 0) {
          const failedTokens: string[] = [];
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              const errCode = resp.error?.code;
              if (
                errCode === "messaging/invalid-registration-token" ||
                errCode === "messaging/registration-token-not-registered"
              ) {
                failedTokens.push(fcmTokens[idx]);
              }
            }
          });
          if (failedTokens.length > 0) {
            await DeviceToken.deleteMany({ token: { $in: failedTokens } });
            logger.debug(`[FCM] Cleaned up ${failedTokens.length} invalid tokens`);
          }
        }
      } catch (error) {
        logger.error(`[FCM] Error sending push notification to user ${userId}:`, error);
      }
    }
  }
};

/**
 * For backwards compatibility with the mock implementation we wrote earlier.
 */
export const sendPushNotification = async (
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
) => {
  return sendNotification(userId, title, body, "alert"); // Map the old mock to the new system
};

// ─── User-Facing Notification Endpoints ───────────────────────────────────────

/**
 * Get User Notifications
 * Fetches a paginated list of In-App notifications for a specific user.
 * 
 * @param userId - The requesting user ID
 * @param query - Pagination and filter parameters (e.g., isRead, type)
 * @returns Paginated notification list
 */
export const getUserNotifications = async (userId: string, query: any) => {
  const { page, limit, isRead, type } = query;
  const filter: any = { userId };

  if (typeof isRead === "boolean") filter.isRead = isRead;
  if (type) filter.type = type;

  const skip = (page - 1) * limit;

  const [notifications, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
  ]);

  return { notifications, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Get Notification Detail
 * Retrieves a single notification by ID, ensuring it belongs to the requesting user.
 * 
 * @param id - Notification ID
 * @param userId - Requesting user ID for authorization
 */
export const getNotificationDetail = async (id: string, userId: string) => {
  const notification = await Notification.findOne({ _id: id, userId }).lean();
  if (!notification) throw ApiError.notFound("Notification");
  return notification;
};

/**
 * Mark as Read
 * Updates a specific notification's isRead status to true.
 * 
 * @param id - Notification ID
 * @param userId - Requesting user ID for authorization
 */
export const markAsRead = async (id: string, userId: string) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: id, userId },
    { isRead: true, readAt: new Date() },
    { new: true }
  );
  if (!notification) throw ApiError.notFound("Notification");
  return notification;
};

/**
 * Mark All as Read
 * Bulk updates all unread notifications for a specific user to read.
 * 
 * @param userId - The target user ID
 */
export const markAllAsRead = async (userId: string) => {
  const result = await Notification.updateMany(
    { userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );
  return { modifiedCount: result.modifiedCount };
};

/**
 * Delete Notification
 * Permanently removes a notification from the database.
 * 
 * @param id - Notification ID
 * @param userId - Requesting user ID for authorization
 */
export const deleteNotification = async (id: string, userId: string) => {
  const notification = await Notification.findOneAndDelete({ _id: id, userId });
  if (!notification) throw ApiError.notFound("Notification");
  return notification;
};

// ─── Preferences ──────────────────────────────────────────────────────────────

/**
 * Get Preferences
 * Retrieves the user's current notification preferences.
 * 
 * @param userId - The target user ID
 */
export const getPreferences = async (userId: string) => {
  const user = await User.findById(userId).select("notificationPreferences").lean();
  if (!user) throw ApiError.notFound("User");
  return user.notificationPreferences;
};

/**
 * Update Preferences
 * Allows users to granularly opt in/out of specific notification channels (Push, InApp, Email).
 * Uses MongoDB dot notation to update only the provided fields without overwriting the whole object.
 * 
 * @param userId - The target user ID
 * @param data - The partial preferences object to update
 */
export const updatePreferences = async (userId: string, data: any) => {
  // Dot notation update to only update provided fields without overwriting the whole object
  const updateObj: any = {};
  if (data.alerts) {
    if (typeof data.alerts.push === "boolean") updateObj["notificationPreferences.alerts.push"] = data.alerts.push;
    if (typeof data.alerts.inApp === "boolean") updateObj["notificationPreferences.alerts.inApp"] = data.alerts.inApp;
    if (typeof data.alerts.email === "boolean") updateObj["notificationPreferences.alerts.email"] = data.alerts.email;
  }
  if (data.system) {
    if (typeof data.system.push === "boolean") updateObj["notificationPreferences.system.push"] = data.system.push;
    if (typeof data.system.inApp === "boolean") updateObj["notificationPreferences.system.inApp"] = data.system.inApp;
    if (typeof data.system.email === "boolean") updateObj["notificationPreferences.system.email"] = data.system.email;
  }

  if (Object.keys(updateObj).length === 0) {
    throw ApiError.badRequest("No valid preferences to update");
  }

  const user = await User.findByIdAndUpdate(userId, { $set: updateObj }, { new: true })
    .select("notificationPreferences")
    .lean();

  return user?.notificationPreferences;
};
