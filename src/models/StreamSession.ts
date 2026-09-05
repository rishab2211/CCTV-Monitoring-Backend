import mongoose, { Schema, Document, Model } from "mongoose";
import { IStreamSession, UserRole } from "../types";

// ─── Document Interface ───────────────────────────────────────────────────────

export interface StreamSessionDocument
  extends Omit<IStreamSession, "_id">,
    Document {}

// ─── Schema ───────────────────────────────────────────────────────────────────

const streamSessionSchema = new Schema<StreamSessionDocument>(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    cameraId: {
      type: Schema.Types.ObjectId,
      ref: "Camera",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      required: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
    },
    ipAddress: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

streamSessionSchema.index({ cameraId: 1, isActive: 1 });
streamSessionSchema.index({ userId: 1, isActive: 1 });

// TTL index — auto-delete session documents 24 hours after they end
streamSessionSchema.index(
  { endedAt: 1 },
  { expireAfterSeconds: 86400, sparse: true } // sparse so active sessions (endedAt=null) are not affected
);

// Fallback TTL index — auto-delete abandoned/orphaned sessions 7 days after creation
streamSessionSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60 }
);


// ─── Model ───────────────────────────────────────────────────────────────────

export const StreamSession: Model<StreamSessionDocument> =
  mongoose.model<StreamSessionDocument>("StreamSession", streamSessionSchema);
