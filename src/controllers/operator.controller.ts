/**
 * @file operator.controller.ts
 * @description Express request handlers for Operator Module.
 */
import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as operatorService from "../services/operator.service";

/**
 * Clock In Endpoint
 * POST /api/v1/operators/clock-in
 * Marks an operator as active on shift and initializes a new OperatorShift record.
 * 
 * @param req - Express Request object
 * @param res - Express Response object
 */
export const clockIn = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const shift = await operatorService.clockIn(req.user);
  res.status(200).json(new ApiResponse(200, { shift }, "Operator clocked in successfully"));
});

/**
 * Clock Out Endpoint
 * POST /api/v1/operators/clock-out
 * Marks an operator as offline, finalizes the active OperatorShift record, 
 * tallies performance metrics, and broadcasts handover notes via WebSockets.
 * 
 * @param req - Express Request object containing handoverNotes in body
 * @param res - Express Response object
 */
export const clockOut = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { handoverNotes } = req.body;
  const shift = await operatorService.clockOut(handoverNotes, req.user);
  res.status(200).json(new ApiResponse(200, { shift }, "Operator clocked out successfully"));
});

/**
 * Assign Cameras Endpoint
 * POST /api/v1/operators/:id/cameras
 * Bulk assigns a list of cameras to a specific operator. This symmetrically updates
 * the User profile and the respective Camera documents.
 * 
 * @param req - Express Request object containing cameraIds array
 * @param res - Express Response object
 */
export const assignCameras = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const operator = await operatorService.assignCameras(req.params.id, req.body.cameraIds, req.user);
  res.status(200).json(new ApiResponse(200, { operator }, "Cameras assigned successfully"));
});

/**
 * List Shifts Endpoint
 * GET /api/v1/operators/shifts
 * Fetches a paginated list of historical shifts.
 * Operators see only their own shifts; Admins/Franchise see all requested shifts.
 * 
 * @param req - Express Request object containing query filters
 * @param res - Express Response object
 */
export const listShifts = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await operatorService.listShifts(req.query, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

/**
 * Get Operator Performance Endpoint
 * GET /api/v1/operators/:id/performance
 */
export const getPerformance = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await operatorService.getOperatorPerformance(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

/**
 * Get Operator Dashboard Endpoint
 * GET /api/v1/operator/dashboard
 * Returns shift status, camera counts, open incidents, and active SOS for the logged-in operator.
 */
export const getOperatorDashboard = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const dashboard = await operatorService.getOperatorDashboard(req.user);
  res.status(200).json(new ApiResponse(200, dashboard));
});

/**
 * Get Assigned Cameras Endpoint
 * GET /api/v1/operator/cameras
 * Returns full Camera documents for all cameras assigned to the logged-in operator.
 */
export const getAssignedCameras = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const cameras = await operatorService.getAssignedCameras(req.user);
  res.status(200).json(new ApiResponse(200, { cameras, count: cameras.length }));
});

/**
 * Get Pending Alerts Endpoint
 * GET /api/v1/operator/alerts/pending
 * Returns all unacknowledged alerts from the operator's assigned cameras.
 */
export const getPendingAlerts = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const alerts = await operatorService.getPendingAlerts(req.user);
  res.status(200).json(new ApiResponse(200, { alerts, count: alerts.length }));
});

/**
 * Get Active Alerts Endpoint
 * GET /api/v1/operator/alerts/active
 * Returns all acknowledged (in-progress) alerts from the operator's assigned cameras.
 */
export const getActiveAlerts = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const alerts = await operatorService.getActiveAlerts(req.user);
  res.status(200).json(new ApiResponse(200, { alerts, count: alerts.length }));
});

/**
 * Get Operator Calls Endpoint
 * GET /api/v1/operator/calls
 * Returns recent talkback sessions for cameras assigned to this operator.
 */
export const getOperatorCalls = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const calls = await operatorService.getOperatorCalls(req.user);
  res.status(200).json(new ApiResponse(200, { calls, count: calls.length }));
});

/**
 * Get Shift Status Endpoint
 * GET /api/v1/operator/shift/status
 * Returns the operator's current shift state (on-shift / off-shift) with timing details.
 */
export const getShiftStatus = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const status = await operatorService.getShiftStatus(req.user);
  res.status(200).json(new ApiResponse(200, status));
});

/**
 * Get Operator Timeline Endpoint
 * GET /api/v1/operator/timeline
 * Returns the last 100 activity log entries for this operator in reverse-chronological order.
 */
export const getOperatorTimeline = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const events = await operatorService.getOperatorTimeline(req.user);
  res.status(200).json(new ApiResponse(200, { events, count: events.length }));
});

/**
 * Get Operator Reports Endpoint
 * GET /api/v1/operator/reports
 * Returns a structured report of the last 30 shifts with per-shift metrics and aggregated totals.
 */
export const getOperatorReports = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const report = await operatorService.getOperatorReports(req.user);
  res.status(200).json(new ApiResponse(200, report));
});
