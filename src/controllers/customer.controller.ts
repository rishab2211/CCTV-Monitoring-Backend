/**
 * @file customer.controller.ts
 * @description Express request handlers for the Customer Module.
 */
import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as customerService from "../services/customer.service";

/**
 * Subscribe Endpoint
 * POST /api/v1/customers/subscribe
 * Subscribes a customer to a new billing plan.
 */
export const subscribe = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { planName, durationMonths } = req.body;
  const result = await customerService.subscribeToPlan(planName, durationMonths, req.user);
  res.status(200).json(new ApiResponse(200, result, "Subscribed successfully"));
});

/**
 * Cancel Subscription Endpoint
 * POST /api/v1/customers/cancel-subscription
 * Cancels a customer's active subscription.
 */
export const cancelSubscription = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const subscription = await customerService.cancelSubscription(req.user);
  res.status(200).json(new ApiResponse(200, { subscription }, "Subscription canceled successfully"));
});

/**
 * List Invoices Endpoint
 * GET /api/v1/customers/invoices
 * Retrieves a paginated list of billing invoices for the customer.
 */
export const listInvoices = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await customerService.listInvoices(req.query, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

/**
 * Get Dashboard Endpoint
 * GET /api/v1/customers/dashboard
 * Aggregates subscription, cameras, recent incidents, and SOS alerts into a single payload.
 */
export const getDashboard = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const dashboard = await customerService.getDashboard(req.user);
  res.status(200).json(new ApiResponse(200, dashboard, "Dashboard fetched successfully"));
});

// ─── Camera wrappers ─────────────────────────────────────────────────────────

import * as streamService from "../services/stream.service";
import * as recordingService from "../services/recording.service";
import { Notification } from "../models/Notification";
import { Incident } from "../models/Incident";
import { User } from "../models/User";
import { Subscription } from "../models/Subscription";

export const getMyCameras = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const cameras = await customerService.getMyCameras(req.user);
  res.status(200).json(new ApiResponse(200, cameras));
});

export const getLiveView = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await streamService.getStreamToken(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, result, "Live view stream token generated"));
});

export const getPlayback = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const start = (req.query.startTime || req.query.start) as string;
  const end = (req.query.endTime || req.query.end) as string;
  if (!start || !end) {
    throw ApiError.badRequest("startTime (or start) and endTime (or end) query params are required");
  }
  const result = await recordingService.getPlaybackChunks(req.params.id, start, end, req.user);
  res.status(200).json(new ApiResponse(200, result, "Playback URL generated"));
});

export const shareCamera = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const camera = await customerService.shareCamera(req.params.id, req.body.email, req.user);
  res.status(200).json(new ApiResponse(200, camera, "Camera shared successfully"));
});

export const revokeCameraShare = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const camera = await customerService.revokeCameraShare(req.params.id, req.params.userId, req.user);
  res.status(200).json(new ApiResponse(200, camera, "Camera share revoked"));
});

// ─── Others wrappers ─────────────────────────────────────────────────────────

export const getCurrentSubscription = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const subscription = await Subscription.findOne({ customerId: req.user.userId, status: "active" }).lean();
  if (!subscription) {
    return res.status(200).json(new ApiResponse(200, null, "No active subscription"));
  }
  res.status(200).json(new ApiResponse(200, subscription));
});

export const getMyNotifications = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const notifications = await Notification.find({ userId: req.user.userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  res.status(200).json(new ApiResponse(200, notifications));
});

export const getMyReports = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const incidents = await Incident.find({ reportedBy: req.user.userId }).sort({ createdAt: -1 }).lean();
  res.status(200).json(new ApiResponse(200, incidents));
});

export const getProfile = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await User.findById(req.user.userId).select("-password -__v").lean();
  res.status(200).json(new ApiResponse(200, user));
});

export const updateProfile = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { name, phone, customerDetails } = req.body;
  const user = await User.findByIdAndUpdate(req.user.userId, { name, phone, customerDetails }, { new: true }).select("-password");
  res.status(200).json(new ApiResponse(200, user, "Profile updated successfully"));
});
