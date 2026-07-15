import mongoose, { Schema, Document, Model } from "mongoose";
import { IInstallationJob, JobType, JobStatus } from "../types";

export interface InstallationJobDocument extends Omit<IInstallationJob, "_id">, Document {}

const installationJobSchema = new Schema<InstallationJobDocument>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["installation", "repair", "maintenance"],
      required: true,
    },
    status: {
      type: String,
      enum: ["scheduled", "in-progress", "completed", "cancelled"],
      default: "scheduled",
      required: true,
    },
    assignedTechnician: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    franchiseId: {
      type: Schema.Types.ObjectId,
      ref: "Franchise",
    },
    cameraId: {
      type: Schema.Types.ObjectId,
      ref: "Camera",
    },
    scheduledAt: {
      type: Date,
      required: true,
    },
    completedAt: {
      type: Date,
    },
    notes: {
      type: String,
      trim: true,
    },
    attachments: [
      {
        type: String,
      },
    ],
    // Customer signature URL after job completion
    customerSignature: {
      type: String,
    },
    // Installation checklist — an array of { item, checked } sub-documents
    checklist: [
      {
        item: { type: String, required: true },
        checked: { type: Boolean, default: false },
        checkedAt: { type: Date },
      },
    ],
    // Technician's last known GPS location for live tracking
    gpsLocation: {
      lat: { type: Number },
      lng: { type: Number },
      updatedAt: { type: Date },
    },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
installationJobSchema.index({ assignedTechnician: 1, status: 1 });
installationJobSchema.index({ franchiseId: 1 });
installationJobSchema.index({ scheduledAt: 1 });

export const InstallationJob: Model<InstallationJobDocument> = mongoose.model<InstallationJobDocument>(
  "InstallationJob",
  installationJobSchema
);
