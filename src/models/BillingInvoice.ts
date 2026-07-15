import mongoose, { Schema, Document, Model } from "mongoose";
import { IBillingInvoice } from "../types";

export interface BillingInvoiceDocument extends Omit<IBillingInvoice, "_id">, Document {}

/**
 * BillingInvoice Schema
 * Tracks payment history for a customer's subscription.
 */
const billingInvoiceSchema = new Schema<BillingInvoiceDocument>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["paid", "pending", "failed"],
      default: "pending",
      required: true,
    },
    invoiceUrl: {
      type: String,
    },
    billingDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { timestamps: true }
);

billingInvoiceSchema.index({ customerId: 1, status: 1 });

export const BillingInvoice: Model<BillingInvoiceDocument> = mongoose.model<BillingInvoiceDocument>(
  "BillingInvoice",
  billingInvoiceSchema
);
