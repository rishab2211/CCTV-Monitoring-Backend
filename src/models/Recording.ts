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
  },
  { timestamps: true }
);

// Indexes for querying timelines and managing status
recordingSchema.index({ cameraId: 1, startTime: -1 });
recordingSchema.index({ status: 1 });
recordingSchema.index({ createdAt: 1 });

export const Recording: Model<RecordingDocument> = mongoose.model<RecordingDocument>(
  "Recording",
  recordingSchema
);
