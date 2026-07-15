import mongoose, { Schema, Document, Model } from "mongoose";
import { INotification } from "../types";

export interface NotificationDocument extends Omit<INotification, "_id">, Document {}

const notificationSchema = new Schema<NotificationDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["alert", "system", "message"],
      required: true,
    },
    referenceId: {
      type: Schema.Types.ObjectId, // E.g., Alert ID
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Compound index for fetching a user's unread notifications quickly
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

export const Notification: Model<NotificationDocument> = mongoose.model<NotificationDocument>(
  "Notification",
  notificationSchema
);
