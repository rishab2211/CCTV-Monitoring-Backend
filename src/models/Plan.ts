import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * @file Plan.ts
 * @description Subscription Plan model.
 * Plans are created by Admin and listed publicly for customers to choose from.
 */

export interface IPlan {
  _id: mongoose.Types.ObjectId;
  name: string;
  description: string;
  price: number;           // price in INR per month
  durationMonths: number;  // billing cycle length
  cameraLimit: number;     // max cameras allowed under this plan
  features: string[];      // human-readable feature list
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanDocument extends Omit<IPlan, "_id">, Document {}

const planSchema = new Schema<PlanDocument>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    durationMonths: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    cameraLimit: {
      type: Number,
      required: true,
      default: 4,
    },
    features: [{ type: String }],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

planSchema.index({ isActive: 1, price: 1 });

export const Plan: Model<PlanDocument> = mongoose.model<PlanDocument>("Plan", planSchema);
