/**
 * @file SystemSetting.ts
 * @description Mongoose model for global system settings (e.g., retention periods, global feature toggles).
 * Designed as a key-value store.
 */
import mongoose, { Schema, Document, Model } from "mongoose";
import { ISystemSetting } from "../types";

export interface SystemSettingDocument extends Omit<ISystemSetting, "_id">, Document {}

/**
 * System Setting Schema
 * Simple Key-Value structure with mixed types supported via Schema.Types.Mixed
 */
const systemSettingSchema = new Schema<SystemSettingDocument>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    value: {
      type: Schema.Types.Mixed,
      required: true,
    },
    description: {
      type: String,
    },
  },
  { timestamps: true }
);

export const SystemSetting: Model<SystemSettingDocument> = mongoose.model<SystemSettingDocument>(
  "SystemSetting",
  systemSettingSchema
);
