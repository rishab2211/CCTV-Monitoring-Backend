/**
 * @file audit.controller.ts
 * @description Express request handlers for Module 18 (Audit & Activity Logs).
 */
import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as auditService from "../services/audit.service";

/**
 * List Audit Logs
 * GET /api/v1/audit-logs
 */
export const listAuditLogs = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await auditService.listAuditLogs(req.query, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

/**
 * Get Audit Log Details
 * GET /api/v1/audit-logs/:id
 */
export const getAuditLogDetail = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const log = await auditService.getAuditLogDetail(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, { log }));
});

/**
 * List Activity Logs
 * GET /api/v1/activity-logs
 */
export const listActivityLogs = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await auditService.listActivityLogs(req.query, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

/**
 * Logs for specific user
 * GET /api/v1/activity-logs/user/:userId
 */
export const getUserActivityLogs = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await auditService.getUserActivityLogs(req.params.userId, req.query, req.user);
  res.status(200).json(new ApiResponse(200, result));
});
