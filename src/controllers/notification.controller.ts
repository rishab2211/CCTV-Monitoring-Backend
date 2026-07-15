import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as notificationService from "../services/notification.service";

/**
 * Register a Device for FCM Push Notifications
 * Extracts the user ID from the authenticated token and saves the provided FCM token.
 */
export const registerDevice = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { token, deviceType } = req.body;
  const device = await notificationService.registerDeviceToken(req.user.userId, token, deviceType);
  res.status(200).json(new ApiResponse(200, device, "Device registered for push notifications"));
});

/**
 * Get User Notifications
 * Fetches a paginated list of In-App notifications for the authenticated user.
 */
export const getNotifications = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await notificationService.getUserNotifications(req.user.userId, req.query);
  res.status(200).json(new ApiResponse(200, result));
});

/**
 * Get Notification Detail
 * Retrieves a single notification by its ID.
 */
export const getNotificationDetail = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const notification = await notificationService.getNotificationDetail(req.params.id, req.user.userId);
  res.status(200).json(new ApiResponse(200, notification));
});

/**
 * Mark Notification as Read
 * Flags a specific in-app notification as read.
 */
export const markAsRead = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const notification = await notificationService.markAsRead(req.params.id, req.user.userId);
  res.status(200).json(new ApiResponse(200, notification, "Notification marked as read"));
});

/**
 * Mark All Notifications as Read
 * Flags all unread in-app notifications for the authenticated user as read.
 */
export const markAllAsRead = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await notificationService.markAllAsRead(req.user.userId);
  res.status(200).json(new ApiResponse(200, result, "All notifications marked as read"));
});

/**
 * Delete Notification
 * Permanently deletes a specific notification belonging to the authenticated user.
 */
export const deleteNotification = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const notification = await notificationService.deleteNotification(req.params.id, req.user.userId);
  res.status(200).json(new ApiResponse(200, notification, "Notification deleted"));
});

/**
 * Get Notification Preferences
 * Returns the authenticated user's notification preferences (push, email, in-app).
 */
export const getPreferences = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const prefs = await notificationService.getPreferences(req.user.userId);
  res.status(200).json(new ApiResponse(200, prefs));
});

/**
 * Update Notification Preferences
 * Granularly updates the user's notification preferences.
 */
export const updatePreferences = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const prefs = await notificationService.updatePreferences(req.user.userId, req.body);
  res.status(200).json(new ApiResponse(200, prefs, "Preferences updated successfully"));
});
