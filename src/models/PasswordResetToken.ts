import mongoose, { Schema, Document, Model } from "mongoose";

export interface PasswordResetTokenDocument extends Document {
  email: string;
  tokenHash: string;
  expiresAt: Date;
  isUsed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const passwordResetTokenSchema = new Schema<PasswordResetTokenDocument>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// TTL index — MongoDB auto-deletes expired reset tokens
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
passwordResetTokenSchema.index({ tokenHash: 1, isUsed: 1 });

export const PasswordResetToken: Model<PasswordResetTokenDocument> =
  mongoose.model<PasswordResetTokenDocument>(
    "PasswordResetToken",
    passwordResetTokenSchema
  );
