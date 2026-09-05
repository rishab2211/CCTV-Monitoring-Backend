/**
 * @file billing.service.ts
 * @description Business logic for the Billing Module (Plans, Subscriptions, Payments, Invoices).
 */
import mongoose from "mongoose";
import { User } from "../models/User";
import { Plan } from "../models/Plan";
import { Subscription } from "../models/Subscription";
import { Payment } from "../models/Payment";
import { BillingInvoice } from "../models/BillingInvoice";
import { ApiError } from "../utils/ApiError";
import { JwtAccessPayload, ListBillingQuery } from "../types";
import { logActivity } from "../models/ActivityLog";
import * as notificationService from "./notification.service";
import crypto from "crypto";
import { env } from "../config/env";
import { safeCompare } from "../utils/helpers";

// ─── Plans ───────────────────────────────────────────────────────────────────

export const listPlans = async (user?: JwtAccessPayload) => {
  // Public can view active plans. Admins can view all plans.
  const filter = (!user || user.role !== "super_admin" && user.role !== "admin") ? { isActive: true } : {};
  return await Plan.find(filter).sort({ price: 1 }).lean();
};

export const createPlan = async (data: any, user: JwtAccessPayload) => {
  const plan = await Plan.create(data);
  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "SYSTEM_CONFIG_UPDATED",
    description: `Created subscription plan ${plan.name}`,
  });
  return plan;
};

export const updatePlan = async (id: string, data: any, user: JwtAccessPayload) => {
  const plan = await Plan.findByIdAndUpdate(id, data, { new: true });
  if (!plan) throw ApiError.notFound("Plan not found");
  
  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "SYSTEM_CONFIG_UPDATED",
    description: `Updated subscription plan ${plan.name}`,
  });
  return plan;
};

export const deletePlan = async (id: string, user: JwtAccessPayload) => {
  const plan = await Plan.findById(id);
  if (!plan) throw ApiError.notFound("Plan not found");

  const activeSubscriptions = await Subscription.exists({ planId: id, status: "active" });
  if (activeSubscriptions) {
    throw ApiError.badRequest("Cannot delete a plan with active subscriptions. Deactivate it instead.");
  }

  await plan.deleteOne();
  
  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "SYSTEM_CONFIG_UPDATED",
    description: `Deleted subscription plan ${plan.name}`,
  });
};

// ─── Subscriptions ───────────────────────────────────────────────────────────

export const createSubscription = async (data: { planId: string, customerId?: string }, user: JwtAccessPayload) => {
  // If customer creates it, force customerId to their own ID. If admin creates, use provided ID.
  const customerId = user.role === "customer" ? user.userId : (data.customerId || user.userId);
  
  const customer = await User.findById(customerId);
  if (!customer) throw ApiError.notFound("Customer not found");

  const plan = await Plan.findById(data.planId);
  if (!plan || (!plan.isActive && user.role === "customer")) {
    throw ApiError.notFound("Plan not found or inactive");
  }

  // Prevent multiple active subscriptions
  const existing = await Subscription.findOne({ customerId, status: "active" });
  if (existing) {
    throw ApiError.badRequest("Customer already has an active subscription");
  }

  const startDate = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + plan.durationMonths);

  const franchiseId = customer.customerDetails?.assignedFranchise;

  const subscription = await Subscription.create({
    customerId,
    franchiseId,
    planId: plan._id,
    planName: plan.name,
    status: "active",
    startDate,
    endDate,
    price: plan.price,
  });

  // Create an initial invoice
  await BillingInvoice.create({
    customerId,
    franchiseId,
    subscriptionId: subscription._id,
    amount: plan.price,
    status: "pending",
    billingDate: startDate,
  });

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "SUBSCRIPTION_CREATED",
    description: `Created ${plan.name} subscription for ${customer.name}`,
    metadata: { subscriptionId: subscription._id },
  });

  return subscription;
};

export const listSubscriptions = async (query: ListBillingQuery, user: JwtAccessPayload) => {
  const { page = 1, limit = 20, status, customerId } = query;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (customerId) filter.customerId = customerId;

  if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId) throw ApiError.forbidden("No franchise associated with your account");
    filter.franchiseId = user.franchiseId;
  } else if (user.role === "customer") {
    filter.customerId = user.userId;
  } else if (user.role !== "super_admin" && user.role !== "admin") {
    throw ApiError.forbidden();
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [subscriptions, total] = await Promise.all([
    Subscription.find(filter).skip(skip).limit(Number(limit)).sort({ createdAt: -1 }).populate("planId").lean(),
    Subscription.countDocuments(filter)
  ]);

  return { subscriptions, total, page: Number(page), limit: Number(limit) };
};

export const getSubscription = async (id: string, user: JwtAccessPayload) => {
  const subscription = await Subscription.findById(id).populate("planId").lean();
  if (!subscription) throw ApiError.notFound("Subscription not found");

  if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId || subscription.franchiseId?.toString() !== user.franchiseId) {
      throw ApiError.forbidden();
    }
  } else if (user.role === "customer") {
    if (subscription.customerId.toString() !== user.userId) throw ApiError.forbidden();
  } else if (user.role !== "super_admin" && user.role !== "admin") {
    throw ApiError.forbidden();
  }

  return subscription;
};

export const renewSubscription = async (id: string, user: JwtAccessPayload) => {
  const subscription = await Subscription.findById(id);
  if (!subscription) throw ApiError.notFound("Subscription not found");

  if (user.role === "customer") {
    if (subscription.customerId.toString() !== user.userId) throw ApiError.forbidden();
  } else if (user.role !== "super_admin" && user.role !== "admin" && user.role !== "franchise" && user.role !== "franchise_admin") {
    throw ApiError.forbidden();
  }

  if (subscription.status === "canceled") {
    throw ApiError.badRequest("Cannot renew a canceled subscription");
  }

  const plan = await Plan.findById(subscription.planId);
  if (!plan) throw ApiError.notFound("Associated plan no longer exists");

  // Extend the end date
  const newEndDate = new Date(subscription.endDate);
  newEndDate.setMonth(newEndDate.getMonth() + plan.durationMonths);
  subscription.endDate = newEndDate;
  subscription.status = "active"; // in case it was past_due
  await subscription.save();

  // Generate new invoice
  await BillingInvoice.create({
    customerId: subscription.customerId,
    franchiseId: subscription.franchiseId,
    subscriptionId: subscription._id,
    amount: plan.price,
    status: "pending",
    billingDate: new Date(),
  });

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "SUBSCRIPTION_CREATED",
    description: `Renewed subscription ${subscription._id}`,
  });

  return subscription;
};

export const cancelSubscription = async (id: string, user: JwtAccessPayload) => {
  const subscription = await Subscription.findById(id);
  if (!subscription) throw ApiError.notFound("Subscription not found");

  if (user.role === "customer") {
    if (subscription.customerId.toString() !== user.userId) throw ApiError.forbidden();
  } else if (user.role !== "super_admin" && user.role !== "admin" && user.role !== "franchise" && user.role !== "franchise_admin") {
    throw ApiError.forbidden();
  }

  subscription.status = "canceled";
  await subscription.save();

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "SUBSCRIPTION_CANCELED",
    description: `Canceled subscription ${subscription._id}`,
  });

  return subscription;
};

// ─── Payments ────────────────────────────────────────────────────────────────

export const createPaymentOrder = async (subscriptionId: string, user: JwtAccessPayload) => {
  const subscription = await Subscription.findById(subscriptionId);
  if (!subscription) throw ApiError.notFound("Subscription not found");

  if (user.role === "customer") {
    if (subscription.customerId.toString() !== user.userId) throw ApiError.forbidden();
  } else if (user.role !== "super_admin" && user.role !== "admin" && user.role !== "franchise" && user.role !== "franchise_admin") {
    throw ApiError.forbidden();
  }

  // Mocking Razorpay Order Creation
  const mockOrderId = `order_${crypto.randomBytes(8).toString('hex')}`;
  
  const payment = await Payment.create({
    customerId: subscription.customerId,
    franchiseId: subscription.franchiseId,
    subscriptionId: subscription._id,
    amount: subscription.price * 100, // stored in paise
    currency: "INR",
    status: "created",
    provider: "razorpay",
    providerOrderId: mockOrderId,
  });

  return { orderId: mockOrderId, amount: payment.amount, currency: payment.currency, paymentId: payment._id };
};

export const verifyPayment = async (razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string) => {
  if (env.RAZORPAY_KEY_SECRET) {
    const expectedSignature = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (!safeCompare(expectedSignature, razorpaySignature)) {
      throw ApiError.badRequest("Invalid payment signature");
    }

  } else if (env.NODE_ENV === "production") {
    throw ApiError.internal("Razorpay secret is not configured");
  }

  const payment = await Payment.findOne({ providerOrderId: razorpayOrderId });
  if (!payment) throw ApiError.notFound("Payment order not found");

  if (payment.status === "paid") return payment; // already processed

  payment.status = "paid";
  payment.providerPaymentId = razorpayPaymentId;
  payment.providerSignature = razorpaySignature;
  payment.paidAt = new Date();
  await payment.save();

  // Mark invoice as paid
  await BillingInvoice.findOneAndUpdate(
    { subscriptionId: payment.subscriptionId, status: "pending" },
    { status: "paid" },
    { sort: { createdAt: -1 } }
  );

  return payment;
};

export const listPayments = async (query: ListBillingQuery, user: JwtAccessPayload) => {
  const { page = 1, limit = 20, status, customerId } = query;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (customerId) filter.customerId = customerId;

  if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId) throw ApiError.forbidden("No franchise associated with your account");
    filter.franchiseId = user.franchiseId;
  } else if (user.role === "customer") {
    filter.customerId = user.userId;
  } else if (user.role !== "super_admin" && user.role !== "admin") {
    throw ApiError.forbidden();
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [payments, total] = await Promise.all([
    Payment.find(filter).skip(skip).limit(Number(limit)).sort({ createdAt: -1 }).populate("subscriptionId", "planName status").lean(),
    Payment.countDocuments(filter)
  ]);

  return { payments, total, page: Number(page), limit: Number(limit) };
};

export const getPayment = async (id: string, user: JwtAccessPayload) => {
  const payment = await Payment.findById(id).populate("subscriptionId").lean();
  if (!payment) throw ApiError.notFound("Payment not found");

  if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId || payment.franchiseId?.toString() !== user.franchiseId) {
      throw ApiError.forbidden();
    }
  } else if (user.role === "customer") {
    if (payment.customerId.toString() !== user.userId) throw ApiError.forbidden();
  } else if (user.role !== "super_admin" && user.role !== "admin") {
    throw ApiError.forbidden();
  }

  return payment;
};

export const refundPayment = async (id: string, reason: string = "", user: JwtAccessPayload) => {
  const payment = await Payment.findById(id);
  if (!payment) throw ApiError.notFound("Payment not found");
  if (payment.status !== "paid") throw ApiError.badRequest("Only paid transactions can be refunded");

  // Mock Refund Logic
  payment.status = "refunded";
  payment.refundId = `rfnd_${crypto.randomBytes(6).toString('hex')}`;
  payment.refundedAt = new Date();
  await payment.save();

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "PAYMENT_REFUNDED",
    description: `Refunded payment ${payment._id}. Reason: ${reason}`,
  });

  return payment;
};

// ─── Invoices ────────────────────────────────────────────────────────────────

export const listInvoices = async (query: ListBillingQuery, user: JwtAccessPayload) => {
  const { page = 1, limit = 20, status, customerId } = query;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (customerId) filter.customerId = customerId;

  if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId) throw ApiError.forbidden("No franchise associated with your account");
    filter.franchiseId = user.franchiseId;
  } else if (user.role === "customer") {
    filter.customerId = user.userId;
  } else if (user.role !== "super_admin" && user.role !== "admin") {
    throw ApiError.forbidden();
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [invoices, total] = await Promise.all([
    BillingInvoice.find(filter).skip(skip).limit(Number(limit)).sort({ billingDate: -1 }).lean(),
    BillingInvoice.countDocuments(filter)
  ]);

  return { invoices, total, page: Number(page), limit: Number(limit) };
};

export const getInvoice = async (id: string, user: JwtAccessPayload) => {
  const invoice = await BillingInvoice.findById(id).populate("subscriptionId", "planName").lean();
  if (!invoice) throw ApiError.notFound("Invoice not found");

  if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId || invoice.franchiseId?.toString() !== user.franchiseId) {
      throw ApiError.forbidden();
    }
  } else if (user.role === "customer") {
    if (invoice.customerId.toString() !== user.userId) throw ApiError.forbidden();
  } else if (user.role !== "super_admin" && user.role !== "admin") {
    throw ApiError.forbidden();
  }

  return invoice;
};
