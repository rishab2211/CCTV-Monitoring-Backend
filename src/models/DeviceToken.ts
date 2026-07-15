import mongoose, { Schema, Document, Model } from "mongoose";
import { IDeviceToken } from "../types";

export interface DeviceTokenDocument extends Omit<IDeviceToken, "_id">, Document {}

const deviceTokenSchema = new Schema<DeviceTokenDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true, // Prevents duplicate registrations of the same device
    },
    deviceType: {
      type: String,
      enum: ["android", "ios", "web"],
      required: true,
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export const DeviceToken: Model<DeviceTokenDocument> = mongoose.model<DeviceTokenDocument>(
  "DeviceToken",
  deviceTokenSchema
);
