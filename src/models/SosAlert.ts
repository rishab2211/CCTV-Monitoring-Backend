import mongoose, { Schema, Document, Model } from "mongoose";
import { ISosAlert } from "../types";

export interface SosAlertDocument extends Omit<ISosAlert, "_id">, Document {}

const sosAlertSchema = new Schema<SosAlertDocument>(
  {
    triggeredBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    cameraId: {
      type: Schema.Types.ObjectId,
      ref: "Camera",
    },
    franchiseId: {
      type: Schema.Types.ObjectId,
      ref: "Franchise",
      index: true,
    },
    location: {
      type: String, // E.g., 'Main Gate', 'Zone B', or coordinates depending on client capabilities
    },
    status: {
      type: String,
      enum: ["active", "acknowledged", "resolved"],
      default: "active",
      required: true,
    },
    acknowledgedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    acknowledgedAt: {
      type: Date,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    resolvedAt: {
      type: Date,
    },
    resolutionNotes: {
      type: String,
    },
    notes: [
      {
        text: { type: String, required: true },
        addedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        addedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// Optimize for fast lookup of active alerts for dashboards
sosAlertSchema.index({ status: 1 });
sosAlertSchema.index({ cameraId: 1, status: 1 });
sosAlertSchema.index({ createdAt: -1 });
sosAlertSchema.index({ franchiseId: 1, status: 1, createdAt: -1 });
sosAlertSchema.index({ triggeredBy: 1, createdAt: -1 });

export const SosAlert: Model<SosAlertDocument> = mongoose.model<SosAlertDocument>(
  "SosAlert",
  sosAlertSchema
);
