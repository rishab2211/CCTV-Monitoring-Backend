import mongoose, { Schema, Document, Model } from "mongoose";
import { IAlert } from "../types";

export interface AlertDocument extends Omit<IAlert, "_id">, Document {}

const alertSchema = new Schema<AlertDocument>(
  {
    cameraId: {
      type: Schema.Types.ObjectId,
      ref: "Camera",
      required: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["motion", "fire", "hazard", "tampering", "other"],
      required: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      required: true,
      default: "medium",
    },
    status: {
      type: String,
      enum: ["new", "acknowledged", "resolved", "escalated"],
      required: true,
      default: "new",
      index: true,
    },
    description: {
      type: String,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    acknowledgedAt: {
      type: Date,
    },
    resolvedAt: {
      type: Date,
    },
    resolutionNotes: {
      type: String,
    },
  },
  { timestamps: true }
);

// Compound index for finding pending alerts quickly
alertSchema.index({ status: 1, createdAt: -1 });

export const Alert: Model<AlertDocument> = mongoose.model<AlertDocument>("Alert", alertSchema);
