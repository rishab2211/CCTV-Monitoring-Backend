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
    // Territory definition — stored as simple string fields per the project analysis
    territory: {
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      zone: { type: String, trim: true },
      description: { type: String },
    },
    // CRM Leads — lightweight embedded documents for franchise-managed prospects
    leads: [
      {
        name: { type: String, required: true, trim: true },
        phone: { type: String },
        email: { type: String, lowercase: true, trim: true },
        status: { type: String, enum: ["new", "contacted", "qualified", "converted", "lost"], default: "new" },
        notes: { type: String },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
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
