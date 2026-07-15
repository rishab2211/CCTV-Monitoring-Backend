/**
 * @file Camera.ts
 * @description Mongoose model representing a physical IP camera connected to the system.
 * Includes network credentials, stream configuration, talkback settings, and status tracking.
 */
import mongoose, { Schema, Document, Model } from "mongoose";
import { ICamera, CameraStatus } from "../types";

// ─── Document Interface ───────────────────────────────────────────────────────

export interface CameraDocument extends Omit<ICamera, "_id">, Document {}

// ─── Schema ───────────────────────────────────────────────────────────────────

/**
 * Camera Schema
 * 
 * Design Note:
 * Passwords and network credentials (ip, port, username, password) are required
 * for the backend to orchestrate RTSP/WebRTC streams via MediaMTX.
 */
const cameraSchema = new Schema<CameraDocument>(
  {
    name: {
      type: String,
      required: [true, "Camera name is required"],
      trim: true,
      maxlength: 100,
    },
    serialNumber: {
      type: String,
      required: [true, "Serial number is required"],
      unique: true,
      trim: true,
      maxlength: 100,
    },
    rtspUrl: {
      type: String,
      required: [true, "RTSP URL is required"],
      trim: true,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ["online", "offline", "maintenance"] as CameraStatus[],
      default: "offline",
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    operatorIds: {
      type: [Schema.Types.ObjectId],
      ref: "User",
      default: [],
      index: true,
    },
    franchiseId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    location: {
      street: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      pincode: { type: String, default: "" },
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
    },
    health: {
      cpuUsage: { type: Number, default: 0 },
      memoryUsage: { type: Number, default: 0 },
      temperature: { type: Number, default: 0 },
      storageUsage: { type: Number, default: 0 },
      lastPing: { type: Date, default: null },
    },
    settings: {
      recordingEnabled: { type: Boolean, default: false },
      motionDetectionEnabled: { type: Boolean, default: false },
      aiFeaturesEnabled: { type: Boolean, default: false },
      recordingRetentionDays: { type: Number, default: 30 },
      talkbackEnabled: { type: Boolean, default: false },
    },
    qrCode: {
      type: String,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// Optimized for finding cameras by ownership and online status

cameraSchema.index({ customerId: 1, isDeleted: 1 });
cameraSchema.index({ operatorIds: 1, isDeleted: 1 });
cameraSchema.index({ franchiseId: 1, isDeleted: 1 });
cameraSchema.index({ status: 1 });
cameraSchema.index({ "settings.talkbackEnabled": 1 });
cameraSchema.index({ serialNumber: 1, isDeleted: 1 });

// ─── Model ───────────────────────────────────────────────────────────────────

export const Camera: Model<CameraDocument> = mongoose.model<CameraDocument>(
  "Camera",
  cameraSchema
);
