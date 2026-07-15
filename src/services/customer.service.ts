/**
 * @file customer.service.ts
 * @description Business logic for the Customer Module (Subscriptions, Invoices, Dashboard).
 */
import mongoose from "mongoose";
import { User } from "../models/User";
import { Subscription } from "../models/Subscription";
import { BillingInvoice } from "../models/BillingInvoice";
import { Camera } from "../models/Camera";
import { Incident } from "../models/Incident";
import { SosAlert } from "../models/SosAlert";
import { ApiError } from "../utils/ApiError";
import { JwtAccessPayload } from "../types";
import { logActivity } from "../models/ActivityLog";
import * as notificationService from "./notification.service";

const PLAN_PRICES: Record<string, number> = {
  "Basic": 9.99,
  "Premium": 19.99,
  "AI-Pro": 39.99,
};

/**
 * Subscribe to a Plan
 * Creates or updates a customer's subscription and generates a paid invoice.
 * 
 * @param planName - The name of the plan ("Basic", "Premium", "AI-Pro")
 * @param durationMonths - How many months they are subscribing for
 * @param user - The JWT payload of the customer
 */
export const subscribeToPlan = async (planName: string, durationMonths: number, user: JwtAccessPayload) => {
  if (user.role !== "customer") {
    throw ApiError.forbidden("Only customers can subscribe to plans");
  }

  const customer = await User.findOne({ _id: user.userId, isDeleted: false });
  if (!customer) throw ApiError.notFound("Customer not found");

  const existingSubscription = await Subscription.findOne({ customerId: customer._id, status: "active" });
  if (existingSubscription) {
    throw ApiError.badRequest("You already have an active subscription. Please cancel it before changing plans.");
  }

  const pricePerMonth = PLAN_PRICES[planName] || 9.99;
  const totalAmount = pricePerMonth * durationMonths;

  const startDate = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + durationMonths);

  const subscription = await Subscription.create({
    customerId: customer._id,
    planName,
    status: "active",
    startDate,
    endDate,
    price: totalAmount,
  });

  const invoice = await BillingInvoice.create({
    customerId: customer._id,
    subscriptionId: subscription._id,
    amount: totalAmount,
    status: "paid", // Assuming payment is instantly successful in this simulation
    billingDate: startDate,
    invoiceUrl: `https://billing.example.com/inv/${new mongoose.Types.ObjectId().toString()}` // Mock URL
  });

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "SUBSCRIPTION_CREATED",
    description: `Subscribed to ${planName} plan for ${durationMonths} months`,
    metadata: { subscriptionId: subscription._id, invoiceId: invoice._id, amount: totalAmount },
  });

  await notificationService.sendNotification(
    user.userId,
    "Subscription Confirmed",
    `Thank you! You are now subscribed to the ${planName} plan.`,
    "system"
  );

  return { subscription, invoice };
};

/**
 * Cancel Active Subscription
 * Marks an active subscription as canceled.
 * 
 * @param user - The JWT payload of the customer
 */
export const cancelSubscription = async (user: JwtAccessPayload) => {
  if (user.role !== "customer") {
    throw ApiError.forbidden("Only customers can cancel subscriptions");
  }

  const subscription = await Subscription.findOne({ customerId: user.userId, status: "active" });
  if (!subscription) {
    throw ApiError.badRequest("No active subscription found to cancel");
  }

  subscription.status = "canceled";
  // We keep the endDate as is, meaning they have access until the end of the billing period
  await subscription.save();

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "SUBSCRIPTION_CANCELED",
    description: `Canceled ${subscription.planName} subscription`,
    metadata: { subscriptionId: subscription._id },
  });

  await notificationService.sendNotification(
    user.userId,
    "Subscription Canceled",
    `Your ${subscription.planName} subscription has been canceled. You have access until ${subscription.endDate.toDateString()}.`,
    "system"
  );

  return subscription;
};

/**
 * List Billing Invoices
 * Fetches a paginated list of invoices for the customer.
 * 
 * @param query - Query filters (page, limit, status)
 * @param user - The JWT payload of the customer
 */
export const listInvoices = async (query: any, user: JwtAccessPayload) => {
  const { page, limit, status } = query;
  
  if (user.role !== "customer") {
    throw ApiError.forbidden("Only customers can view their invoices");
  }

  const filter: any = { customerId: user.userId };
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);

  const [invoices, total] = await Promise.all([
    BillingInvoice.find(filter)
      .skip(skip)
      .limit(Number(limit))
      .sort({ billingDate: -1 })
      .lean(),
    BillingInvoice.countDocuments(filter),
  ]);

  return { invoices, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) };
};

/**
 * Get Customer Dashboard
 * Aggregates all critical data for the customer's mobile app home screen.
 * 
 * @param user - The JWT payload of the customer
 */
export const getDashboard = async (user: JwtAccessPayload) => {
  if (user.role !== "customer") {
    throw ApiError.forbidden("Only customers can access the customer dashboard");
  }

  const customer = await User.findById(user.userId)
    .populate("customerDetails.assignedFranchise", "name email phone")
    .lean();
    
  if (!customer) throw ApiError.notFound("Customer not found");

  const [subscription, cameras, recentIncidents, activeSosAlerts] = await Promise.all([
    // 1. Get active or past_due subscription
    Subscription.findOne({ 
      customerId: user.userId, 
      status: { $in: ["active", "past_due"] } 
    }).lean(),

    // 2. Get cameras owned by this customer
    Camera.find({ ownerId: user.userId, isDeleted: false })
      .select("name location status streamUrl")
      .lean(),

    // 3. Get the 5 most recent incidents
    Incident.find({ reportedBy: user.userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("type status severity location createdAt")
      .lean(),

    // 4. Get any currently active SOS alerts
    SosAlert.find({ triggeredBy: user.userId, status: { $in: ["active", "acknowledged"] } })
      .select("status location createdAt")
      .lean()
  ]);

  // Aggregate Camera Statuses
  const cameraStats = {
    total: cameras.length,
    online: cameras.filter(c => c.status === "online").length,
    offline: cameras.filter(c => c.status === "offline").length,
    maintenance: cameras.filter(c => c.status === "maintenance").length,
  };

  return {
    customer: {
      name: customer.name,
      email: customer.email,
      franchiseContact: customer.customerDetails?.assignedFranchise || null,
    },
    subscription: subscription || { status: "none", planName: "Free Tier" },
    cameraStats,
    cameras, // Include lite details for immediate rendering
    recentIncidents,
    activeSosAlerts,
  };
};

/**
 * Share a camera with a family member (another registered customer).
 */
export const shareCamera = async (cameraId: string, emailToShareWith: string, user: JwtAccessPayload) => {
  if (user.role !== "customer") throw ApiError.forbidden();

  const camera = await Camera.findOne({ _id: cameraId, customerId: user.userId, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera not found or you don't own it");

  const familyMember = await User.findOne({ email: emailToShareWith, role: "customer", isDeleted: false });
  if (!familyMember) throw ApiError.notFound("No active customer found with that email");

  if (familyMember._id.toString() === user.userId) {
    throw ApiError.badRequest("You cannot share a camera with yourself");
  }

  // Ensure not already shared
  if (camera.sharedWith && camera.sharedWith.includes(familyMember._id as any)) {
    throw ApiError.badRequest("Camera is already shared with this user");
  }

  if (!camera.sharedWith) camera.sharedWith = [];
  camera.sharedWith.push(familyMember._id as any);
  await camera.save();

  await notificationService.sendNotification(
    familyMember._id.toString(),
    "Camera Shared With You",
    `A camera (${camera.name}) has been shared with you by ${user.email}.`,
    "system"
  );

  return camera;
};

/**
 * Revoke a camera share.
 */
export const revokeCameraShare = async (cameraId: string, userIdToRevoke: string, user: JwtAccessPayload) => {
  if (user.role !== "customer") throw ApiError.forbidden();

  const camera = await Camera.findOne({ _id: cameraId, customerId: user.userId, isDeleted: false });
  if (!camera) throw ApiError.notFound("Camera not found or you don't own it");

  if (!camera.sharedWith) return camera;

  camera.sharedWith = camera.sharedWith.filter(id => id.toString() !== userIdToRevoke) as any;
  await camera.save();

  return camera;
};

/**
 * Get all cameras for a customer (owned + shared).
 */
export const getMyCameras = async (user: JwtAccessPayload) => {
  if (user.role !== "customer") throw ApiError.forbidden();

  return await Camera.find({
    $or: [
      { customerId: user.userId },
      { sharedWith: user.userId }
    ],
    isDeleted: false
  }).lean();
};
