/**
 * @file Recording.ts
 * @description Mongoose model for Video Recordings (VOD).
 * Records metadata about saved footage (S3 URLs, durations, and retention periods).
 */
import mongoose, { Schema, Document, Model } from "mongoose";
import { IRecording } from "../types";

export interface RecordingDocument extends Omit<IRecording, "_id">, Document {}

const recordingSchema = new Schema<RecordingDocument>(
  {
    cameraId: {
      type: Schema.Types.ObjectId,
      ref: "Camera",
      required: true,
      index: true,
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
    },
    type: {
      type: String,
      enum: ["continuous", "motion", "scheduled"],
      required: true,
    },
    status: {
      type: String,
      enum: ["recording", "completed", "failed", "deleted"],
      required: true,
      default: "recording",
    },
    url: {
      type: String,
      required: true,
    },
    publicId: {
      type: String,
    },
    sizeBytes: {
      type: Number,
      required: true,
      default: 0,
    },
    durationSeconds: {
      type: Number,
      required: true,
      default: 0,
    },
    expiresAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// Optimized for the Recording Module's list filters (time-range, camera, retention)

recordingSchema.index({ cameraId: 1, startTime: -1 });
recordingSchema.index({ status: 1 });
recordingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index for automatic pruning

export const Recording: Model<RecordingDocument> = mongoose.model<RecordingDocument>(
  "Recording",
  recordingSchema
);
