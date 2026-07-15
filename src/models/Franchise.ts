import mongoose, { Schema, Document, Model } from "mongoose";
import { IFranchise } from "../types";

export interface FranchiseDocument extends Omit<IFranchise, "_id">, Document {}

const franchiseSchema = new Schema<FranchiseDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    franchiseCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    contactPhone: {
      type: String,
    },
    address: {
      type: String,
    },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
      required: true,
    },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
franchiseSchema.index({ ownerId: 1 });
franchiseSchema.index({ status: 1 });

export const Franchise: Model<FranchiseDocument> = mongoose.model<FranchiseDocument>(
  "Franchise",
  franchiseSchema
);
