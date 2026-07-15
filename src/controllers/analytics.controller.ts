/**
 * @file analytics.controller.ts
 * @description Express request handlers for Analytics & Reports (Module 17).
 */
import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as analyticsService from "../services/analytics.service";

/**
 * 1. Main Dashboard Analytics
 * GET /api/v1/analytics/dashboard
 */
export const getDashboardAnalytics = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await analyticsService.getDashboardAnalytics(req.user);
  res.status(200).json(new ApiResponse(200, data));
});

/**
 * 2. Alert Analytics
 * GET /api/v1/analytics/alerts
 */
export const getAlertAnalytics = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await analyticsService.getAlertAnalytics(req.user);
  res.status(200).json(new ApiResponse(200, data));
});

/**
 * 3. Camera Analytics
 * GET /api/v1/analytics/cameras
 */
export const getCameraAnalytics = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await analyticsService.getCameraAnalytics(req.user);
  res.status(200).json(new ApiResponse(200, data));
});

/**
 * 4. Operator Performance
 * GET /api/v1/analytics/operators
 */
export const getOperatorAnalytics = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await analyticsService.getOperatorAnalytics(req.user);
  res.status(200).json(new ApiResponse(200, data));
});

/**
 * 5. Revenue Analytics
 * GET /api/v1/analytics/revenue
 */
export const getRevenueAnalytics = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await analyticsService.getRevenueAnalytics(req.user);
  res.status(200).json(new ApiResponse(200, data));
});

/**
 * 6. Subscription Growth
 * GET /api/v1/analytics/subscriptions
 */
export const getSubscriptionAnalytics = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await analyticsService.getSubscriptionAnalytics(req.user);
  res.status(200).json(new ApiResponse(200, data));
});

/**
 * 7. Incident Resolution Stats
 * GET /api/v1/analytics/incidents
 */
export const getIncidentAnalytics = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await analyticsService.getIncidentAnalytics(req.user);
  res.status(200).json(new ApiResponse(200, data));
});

/**
 * 8. Franchise Performance
 * GET /api/v1/analytics/franchises
 */
export const getFranchiseAnalytics = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await analyticsService.getFranchiseAnalytics(req.user);
  res.status(200).json(new ApiResponse(200, data));
});
