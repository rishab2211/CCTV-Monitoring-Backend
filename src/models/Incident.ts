import mongoose, { Schema, Document, Model } from "mongoose";
import { IIncident } from "../types";

export interface IncidentDocument extends Omit<IIncident, "_id">, Document {}

const incidentSchema = new Schema<IncidentDocument>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["theft", "vandalism", "technical_issue", "other"],
      required: true,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      required: true,
    },
    status: {
      type: String,
      enum: ["open", "investigating", "resolved", "closed"],
      default: "open",
      required: true,
    },
    cameraId: {
      type: Schema.Types.ObjectId,
      ref: "Camera",
    },
    reportedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    attachments: [
      {
        type: String, // Path or URL to the file
      },
    ],
    resolutionNotes: {
      type: String,
    },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// Optimize filtering by status, assignee, and camera
incidentSchema.index({ status: 1 });
incidentSchema.index({ assignedTo: 1, status: 1 });
incidentSchema.index({ cameraId: 1 });
incidentSchema.index({ createdAt: -1 });

export const Incident: Model<IncidentDocument> = mongoose.model<IncidentDocument>(
  "Incident",
  incidentSchema
);
