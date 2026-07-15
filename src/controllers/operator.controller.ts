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
 * Calculates aggregated performance metrics (total shifts, resolved incidents, SOS acknowledged)
 * over the lifetime of the operator.
 * 
 * @param req - Express Request object
 * @param res - Express Response object
 */
export const getPerformance = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await operatorService.getOperatorPerformance(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, result));
});
