import mongoose, { Schema, Document, Model } from "mongoose";

// ─── Interface ────────────────────────────────────────────────────────────────

export interface DeviceSessionDocument extends Document {
  userId: mongoose.Types.ObjectId;
  sessionId: string;      // UUID — same as in JWT payload + RefreshToken
  deviceName: string;     // "iPhone 15 Pro", "Chrome on Windows"
  deviceType: string;     // "mobile" | "tablet" | "desktop" | "unknown"
  os: string;             // "iOS 17", "Windows 11"
  browser: string;        // "Chrome 125", "Safari 17"
  ipAddress: string;
  userAgent: string;
  isActive: boolean;
  lastActiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const deviceSessionSchema = new Schema<DeviceSessionDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    deviceName: {
      type: String,
      default: "Unknown Device",
      maxlength: 200,
    },
    deviceType: {
      type: String,
      enum: ["mobile", "tablet", "desktop", "unknown"],
      default: "unknown",
    },
    os: {
      type: String,
      default: "Unknown OS",
      maxlength: 100,
    },
    browser: {
      type: String,
      default: "Unknown Browser",
      maxlength: 100,
    },
    ipAddress: {
      type: String,
      default: "0.0.0.0",
    },
    userAgent: {
      type: String,
      default: "",
      maxlength: 500,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Compound index for fast active session lookups per user
deviceSessionSchema.index({ userId: 1, isActive: 1 });

// ─── Model ───────────────────────────────────────────────────────────────────

export const DeviceSession: Model<DeviceSessionDocument> =
  mongoose.model<DeviceSessionDocument>("DeviceSession", deviceSessionSchema);
