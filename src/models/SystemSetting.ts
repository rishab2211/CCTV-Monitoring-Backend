import mongoose, { Schema, Document, Model } from "mongoose";
import { ISystemSetting } from "../types";

export interface SystemSettingDocument extends Omit<ISystemSetting, "_id">, Document {}

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
