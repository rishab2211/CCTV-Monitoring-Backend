/**
 * @file setting.service.ts
 * @description Business logic for System Settings (Module 20).
 * Handles global, notification, and recording settings in a key-value store.
 */
import { SystemSetting } from "../models/SystemSetting";
import { ApiError } from "../utils/ApiError";
import { JwtAccessPayload } from "../types";
import { logActivity } from "../models/ActivityLog";
import mongoose from "mongoose";

const ensureSuperAdmin = (user: JwtAccessPayload) => {
  if (user.role !== "super_admin") {
    throw ApiError.forbidden("Only super admins can modify system settings");
  }
};

const getSettingByKey = async (key: string) => {
  const setting = await SystemSetting.findOne({ key });
  return setting ? setting.value : {};
};

const updateSettingByKey = async (key: string, value: any, user: JwtAccessPayload) => {
  ensureSuperAdmin(user);
  
  const setting = await SystemSetting.findOneAndUpdate(
    { key },
    { value },
    { new: true, upsert: true } // Create if it doesn't exist
  );

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "SYSTEM_CONFIG_UPDATED",
    description: `Updated system setting: ${key}`,
  });

  return setting.value;
};

// ─── Global Settings ─────────────────────────────────────────────────────────

export const getSystemSettings = async () => {
  return getSettingByKey("global_settings");
};

export const updateSystemSettings = async (data: any, user: JwtAccessPayload) => {
  return updateSettingByKey("global_settings", data, user);
};

// ─── Notification Settings ───────────────────────────────────────────────────

export const getNotificationSettings = async () => {
  return getSettingByKey("notification_settings");
};

export const updateNotificationSettings = async (data: any, user: JwtAccessPayload) => {
  return updateSettingByKey("notification_settings", data, user);
};

// ─── Recording Settings ──────────────────────────────────────────────────────

export const getRecordingSettings = async () => {
  return getSettingByKey("recording_settings");
};

export const updateRecordingSettings = async (data: any, user: JwtAccessPayload) => {
  return updateSettingByKey("recording_settings", data, user);
};
