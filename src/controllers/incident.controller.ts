/**
 * @file incident.controller.ts
 * @description Express request handlers for Incident Management.
 */
import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as incidentService from "../services/incident.service";
import { env } from "../config/env";

/**
 * Report Incident Endpoint
 * POST /api/v1/incidents
 * Creates a new incident, uploading optional attachments.
 */
export const reportIncident = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  // If files were uploaded, map them to public URLs
  const attachments = req.files
    ? (req.files as Express.Multer.File[]).map((f) => `/uploads/${f.filename}`)
    : [];

  const incidentData = {
    ...req.body,
    attachments,
  };

  const incident = await incidentService.reportIncident(incidentData, req.user);
  res.status(201).json(new ApiResponse(201, { incident }, "Incident reported successfully"));
});

/**
 * List Incidents Endpoint
 * GET /api/v1/incidents
 * Retrieves a paginated list of incidents based on RBAC.
 */
export const listIncidents = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await incidentService.listIncidents(req.query, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

/**
 * Get Incident Details Endpoint
 * GET /api/v1/incidents/:id
 */
export const getIncidentDetails = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const incident = await incidentService.getIncidentDetails(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, { incident }));
});

/**
 * Update Incident Status Endpoint
 * PUT /api/v1/incidents/:id/status
 */
export const updateIncidentStatus = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const incident = await incidentService.updateIncidentStatus(req.params.id, req.body, req.user);
  res.status(200).json(new ApiResponse(200, { incident }, "Incident status updated"));
});

/**
 * Assign Incident Endpoint
 * POST /api/v1/incidents/:id/assign
 */
export const assignIncident = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const incident = await incidentService.assignIncident(req.params.id, req.body.assignedTo, req.user);
  res.status(200).json(new ApiResponse(200, { incident }, "Incident assigned successfully"));
});
