import mongoose, { Schema, Document, Model } from "mongoose";
import { ITalkbackSession } from "../types";

export interface TalkbackSessionDocument extends Omit<ITalkbackSession, "_id">, Document {}

const talkbackSessionSchema = new Schema<TalkbackSessionDocument>(
  {
    cameraId: {
      type: Schema.Types.ObjectId,
      ref: "Camera",
      required: true,
    },
    franchiseId: {
      type: Schema.Types.ObjectId,
      ref: "Franchise",
      index: true,
    },
    operatorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endedAt: {
      type: Date,
    },
    durationSeconds: {
      type: Number,
    },
    status: {
      type: String,
      enum: ["active", "completed", "failed"],
      required: true,
      default: "active",
      index: true, // Useful for querying active sessions to enforce concurrency
    },
  },
  { timestamps: true }
);

// Indexes
talkbackSessionSchema.index({ status: 1, cameraId: 1 });
talkbackSessionSchema.index({ operatorId: 1, status: 1 }); // for handleOperatorDisconnect queries
talkbackSessionSchema.index({ createdAt: -1 });
// Enforce at most one active session per camera at the database level (B4 TOCTOU prevention)
talkbackSessionSchema.index(
  { cameraId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active" },
    name: "unique_active_camera_talkback_session",
  }
);

export const TalkbackSession: Model<TalkbackSessionDocument> = mongoose.model<TalkbackSessionDocument>(
  "TalkbackSession",
  talkbackSessionSchema
);
