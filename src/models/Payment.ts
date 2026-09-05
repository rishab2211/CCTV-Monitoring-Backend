import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * @file Payment.ts
 * @description Payment transaction model.
 * Records every payment attempt against a subscription (Razorpay / mock).
 */

export type PaymentStatus = "created" | "paid" | "failed" | "refunded";
export type PaymentProvider = "razorpay" | "stripe" | "manual";

export interface IPayment {
  _id: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  franchiseId?: mongoose.Types.ObjectId;
  subscriptionId: mongoose.Types.ObjectId;
  amount: number;                   // in smallest currency unit (paise for INR)
  currency: string;                 // e.g. "INR"
  status: PaymentStatus;
  provider: PaymentProvider;
  providerOrderId?: string;         // Razorpay orderId / Stripe paymentIntentId
  providerPaymentId?: string;       // Razorpay paymentId set after verification
  providerSignature?: string;       // Razorpay signature for webhook verification
  refundId?: string;                // Provider refund ID if refunded
  refundedAt?: Date;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentDocument extends Omit<IPayment, "_id">, Document {}

const paymentSchema = new Schema<PaymentDocument>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    franchiseId: {
      type: Schema.Types.ObjectId,
      ref: "Franchise",
      index: true,
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
    currency: {
      type: String,
      default: "INR",
    },
    status: {
      type: String,
      enum: ["created", "paid", "failed", "refunded"],
      default: "created",
      required: true,
    },
    provider: {
      type: String,
      enum: ["razorpay", "stripe", "manual"],
      default: "manual",
    },
    providerOrderId: { type: String },
    providerPaymentId: { type: String },
    providerSignature: { type: String },
    refundId: { type: String },
    refundedAt: { type: Date },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

paymentSchema.index({ customerId: 1, status: 1, createdAt: -1 });
paymentSchema.index({ franchiseId: 1, status: 1, createdAt: -1 });
paymentSchema.index({ subscriptionId: 1, status: 1 });
paymentSchema.index({ providerOrderId: 1 });

export const Payment: Model<PaymentDocument> = mongoose.model<PaymentDocument>("Payment", paymentSchema);
