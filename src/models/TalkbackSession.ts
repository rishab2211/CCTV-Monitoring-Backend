import mongoose, { Schema, Document, Model } from "mongoose";
import { ITalkbackSession } from "../types";

export interface TalkbackSessionDocument extends Omit<ITalkbackSession, "_id">, Document {}

const talkbackSessionSchema = new Schema<TalkbackSessionDocument>(
  {
    cameraId: {
      type: Schema.Types.ObjectId,
      ref: "Camera",
      required: true,
      index: true,
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
talkbackSessionSchema.index({ createdAt: -1 });

export const TalkbackSession: Model<TalkbackSessionDocument> = mongoose.model<TalkbackSessionDocument>(
  "TalkbackSession",
  talkbackSessionSchema
);
