/**
 * @file sos.controller.ts
 * @description Express request handlers for SOS emergency alerts.
 */
import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as sosService from "../services/sos.service";

/**
 * Trigger SOS Endpoint
 * POST /api/v1/sos
 * Creates an emergency SOS alert.
 */
/**
 * Trigger SOS Alert Endpoint
 * POST /api/v1/sos/trigger
 * Allows users to trigger an emergency SOS alert.
 */
export const triggerSos = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const alert = await sosService.triggerSos(req.body, req.user);
  res.status(201).json(new ApiResponse(201, { alert }, "SOS Alert triggered successfully"));
});

/**
 * Get SOS Detail Endpoint
 * GET /api/v1/sos/:id
 * Retrieves the detailed information of an SOS alert.
 */
export const getSosDetail = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const sos = await sosService.getSosDetail(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, sos));
});

/**
 * Get Active SOS Alerts Endpoint
 * GET /api/v1/sos/active
 * Retrieves a list of active SOS alerts globally.
 */
export const getActiveSos = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const sosAlerts = await sosService.getActiveSos(req.user);
  res.status(200).json(new ApiResponse(200, sosAlerts));
});

/**
 * Add SOS Note Endpoint
 * POST /api/v1/sos/:id/notes
 * Appends a resolution/progress note to an SOS alert.
 */
export const addSosNote = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const sos = await sosService.addSosNote(req.params.id, req.body.text, req.user);
  res.status(200).json(new ApiResponse(200, sos, "Note added to SOS alert"));
});

/**
 * Get SOS Timeline Endpoint
 * GET /api/v1/sos/:id/timeline
 * Fetches the chronological activity log events related to a specific SOS alert.
 */
export const getSosTimeline = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const timeline = await sosService.getSosTimeline(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, timeline));
});

/**
 * List SOS Alerts Endpoint
 * GET /api/v1/sos
 * Retrieves active/acknowledged/resolved SOS alerts.
 */
/**
 * List SOS Alerts Endpoint
 * GET /api/v1/sos
 * Retrieves a paginated list of SOS alerts.
 */
export const listSosAlerts = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await sosService.listSosAlerts(req.query, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

/**
 * Acknowledge SOS Endpoint
 * POST /api/v1/sos/:id/acknowledge
 * Acknowledges an active SOS alert.
 */
/**
 * Acknowledge SOS Alert Endpoint
 * POST /api/v1/sos/:id/acknowledge
 * Allows an operator to acknowledge an active SOS alert.
 */
export const acknowledgeSos = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const alert = await sosService.acknowledgeSos(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, { alert }, "SOS Alert acknowledged"));
});

/**
 * Resolve SOS Endpoint
 * POST /api/v1/sos/:id/resolve
 * Resolves an SOS alert with notes.
 */
/**
 * Resolve SOS Alert Endpoint
 * POST /api/v1/sos/:id/resolve
 * Allows an operator to resolve an acknowledged SOS alert with resolution notes.
 */
export const resolveSos = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { resolutionNotes } = req.body;
  const alert = await sosService.resolveSos(req.params.id, resolutionNotes, req.user);
  res.status(200).json(new ApiResponse(200, { alert }, "SOS Alert resolved"));
});
