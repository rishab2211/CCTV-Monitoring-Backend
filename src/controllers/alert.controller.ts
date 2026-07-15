import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as alertService from "../services/alert.service";

export const createAlert = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const alert = await alertService.createAlert(req.body, req.user);
  res.status(201).json(new ApiResponse(201, alert, "Alert created successfully"));
});

export const listAlerts = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await alertService.listAlerts(req.query, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

export const getAlertDetails = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const alert = await alertService.getAlertDetails(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, alert));
});

export const acknowledgeAlert = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const alert = await alertService.acknowledgeAlert(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, alert, "Alert acknowledged"));
});

export const resolveAlert = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const alert = await alertService.resolveAlert(req.params.id, req.body.resolutionNotes, req.user);
  res.status(200).json(new ApiResponse(200, alert, "Alert resolved"));
});

export const escalateAlert = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const alert = await alertService.escalateAlert(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, alert, "Alert escalated"));
});

export const getPendingAlerts = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const alerts = await alertService.getPendingAlerts(req.user);
  res.status(200).json(new ApiResponse(200, { alerts, count: alerts.length }));
});

export const getAlertStats = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const stats = await alertService.getAlertStats(req.user);
  res.status(200).json(new ApiResponse(200, stats));
});

// The endpoint for alert history of a specific camera is essentially listAlerts with cameraId filter
// We will route /:cameraId/history to listAlerts in the router directly.

export const verifyAlert = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const alert = await alertService.verifyAlert(req.params.id, req.body.isVerified, req.body.notes, req.user);
  res.status(200).json(new ApiResponse(200, alert, "Alert verification updated"));
});

export const updateAlertRules = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const rules = await alertService.updateAlertRules(req.body.cameraId, req.body.rules, req.user);
  res.status(200).json(new ApiResponse(200, rules, "Alert rules updated"));
});

export const getAlertRules = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const rules = await alertService.getAlertRules(req.params.cameraId, req.user);
  res.status(200).json(new ApiResponse(200, rules, "Alert rules retrieved"));
});
