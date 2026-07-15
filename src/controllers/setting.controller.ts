/**
 * @file setting.controller.ts
 * @description Express request handlers for Module 20 (System Settings).
 */
import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as settingService from "../services/setting.service";

/**
 * 1. Get System Settings
 * GET /api/v1/settings
 */
export const getSystemSettings = catchAsync(async (req: Request, res: Response) => {
  const settings = await settingService.getSystemSettings();
  res.status(200).json(new ApiResponse(200, { settings }));
});

/**
 * 2. Update System Settings
 * PUT /api/v1/settings
 */
export const updateSystemSettings = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const settings = await settingService.updateSystemSettings(req.body, req.user);
  res.status(200).json(new ApiResponse(200, { settings }, "System settings updated successfully"));
});

/**
 * 3. Get Notification Settings
 * GET /api/v1/settings/notifications
 */
export const getNotificationSettings = catchAsync(async (req: Request, res: Response) => {
  const settings = await settingService.getNotificationSettings();
  res.status(200).json(new ApiResponse(200, { settings }));
});

/**
 * 4. Update Notification Settings
 * PUT /api/v1/settings/notifications
 */
export const updateNotificationSettings = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const settings = await settingService.updateNotificationSettings(req.body, req.user);
  res.status(200).json(new ApiResponse(200, { settings }, "Notification settings updated"));
});

/**
 * 5. Get Recording Settings
 * GET /api/v1/settings/recording
 */
export const getRecordingSettings = catchAsync(async (req: Request, res: Response) => {
  const settings = await settingService.getRecordingSettings();
  res.status(200).json(new ApiResponse(200, { settings }));
});

/**
 * 6. Update Recording Settings
 * PUT /api/v1/settings/recording
 */
export const updateRecordingSettings = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const settings = await settingService.updateRecordingSettings(req.body, req.user);
  res.status(200).json(new ApiResponse(200, { settings }, "Recording settings updated"));
});
