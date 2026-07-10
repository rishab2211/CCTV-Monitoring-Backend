import mongoose, { Schema, Document, Model } from "mongoose";

// ─── Interface ────────────────────────────────────────────────────────────────

export interface RefreshTokenDocument extends Document {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;      // SHA-256 hash of the actual refresh token
  sessionId: string;      // UUID linking this token to a DeviceSession
  expiresAt: Date;
  isRevoked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const refreshTokenSchema = new Schema<RefreshTokenDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      index: true, // Looked up on every refresh request
    },
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    isRevoked: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// ─── TTL Index — MongoDB auto-deletes expired tokens ─────────────────────────
// Runs the MongoDB TTL process approximately every 60 seconds
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index for fast lookup + revocation check
refreshTokenSchema.index({ tokenHash: 1, isRevoked: 1 });

// ─── Model ───────────────────────────────────────────────────────────────────

export const RefreshToken: Model<RefreshTokenDocument> =
  mongoose.model<RefreshTokenDocument>("RefreshToken", refreshTokenSchema);
