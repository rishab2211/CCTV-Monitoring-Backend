import mongoose, { Schema, Document, Model } from "mongoose";
import { OTPType } from "../types";

// ─── Interface ────────────────────────────────────────────────────────────────

export interface OTPVerificationDocument extends Document {
  email: string;           // Target email
  otpHash: string;         // SHA-256 hash of the OTP (never store plain OTP)
  type: OTPType;
  expiresAt: Date;
  attempts: number;        // How many times user has tried the wrong OTP
  isUsed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const otpVerificationSchema = new Schema<OTPVerificationDocument>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["forgot_password", "verify_email"] as OTPType[],
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
      max: [5, "Maximum verification attempts exceeded"],
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// TTL index — MongoDB auto-deletes expired OTPs
otpVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index for fast lookup
otpVerificationSchema.index({ email: 1, type: 1, isUsed: 1 });

// ─── Model ───────────────────────────────────────────────────────────────────

export const OTPVerification: Model<OTPVerificationDocument> =
  mongoose.model<OTPVerificationDocument>(
    "OTPVerification",
    otpVerificationSchema
  );
