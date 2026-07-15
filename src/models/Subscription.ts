import mongoose, { Schema, Document, Model } from "mongoose";
import { ISubscription } from "../types";

export interface SubscriptionDocument extends Omit<ISubscription, "_id">, Document {}

/**
 * Subscription Schema
 * Tracks active, past_due, or canceled subscriptions for customers.
 */
const subscriptionSchema = new Schema<SubscriptionDocument>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    planName: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "past_due", "canceled"],
      default: "active",
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endDate: {
      type: Date,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

subscriptionSchema.index({ customerId: 1, status: 1 });

export const Subscription: Model<SubscriptionDocument> = mongoose.model<SubscriptionDocument>(
  "Subscription",
  subscriptionSchema
);
