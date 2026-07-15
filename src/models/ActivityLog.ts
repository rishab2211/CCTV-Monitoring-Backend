import mongoose, { Schema, Document, Model } from "mongoose";
import { ActivityAction, IActivityLog } from "../types";

// ─── Document Interface ───────────────────────────────────────────────────────

export interface ActivityLogDocument
  extends Omit<IActivityLog, "_id">,
    Document {}

// ─── Schema ───────────────────────────────────────────────────────────────────

const activityLogSchema = new Schema<ActivityLogDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "LOGIN",
        "LOGOUT",
        "REGISTER",
        "PASSWORD_CHANGED",
        "PASSWORD_RESET",
        "PROFILE_UPDATED",
        "AVATAR_UPDATED",
        "USER_CREATED",
        "USER_UPDATED",
        "USER_DELETED",
        "USER_ACTIVATED",
        "USER_DEACTIVATED",
        "SESSION_REVOKED",
        "ALL_SESSIONS_REVOKED",
        "INCIDENT_REPORTED",
        "INCIDENT_STATUS_UPDATED",
        "INCIDENT_ASSIGNED",
        "SOS_TRIGGERED",
        "SOS_ACKNOWLEDGED",
        "SOS_RESOLVED",
      ] as ActivityAction[],
    },
    description: {
      type: String,
      required: true,
      maxlength: 500,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
      maxlength: 500,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // only createdAt — logs are immutable
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// TTL — auto-delete logs older than 90 days
activityLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
);

// Fast activity feed per user (newest first)
activityLogSchema.index({ userId: 1, createdAt: -1 });

// Filter by action type
activityLogSchema.index({ action: 1 });

// ─── Helper: fire-and-forget log creator ─────────────────────────────────────

export const logActivity = (data: {
  userId: string | mongoose.Types.ObjectId;
  action: ActivityAction;
  description: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}): void => {
  // Fire-and-forget — never await this in service functions
  // Errors are logged but never bubble up to the API response
  ActivityLog.create(data).catch((err) => {
    // Use console to avoid circular import with logger
    console.error("[ActivityLog] Failed to write log:", err?.message);
  });
};

// ─── Model ───────────────────────────────────────────────────────────────────

export const ActivityLog: Model<ActivityLogDocument> =
  mongoose.model<ActivityLogDocument>("ActivityLog", activityLogSchema);
