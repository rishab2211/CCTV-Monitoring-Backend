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
 * PATCH /api/v1/incidents/:id/assign
 * Admin assigns an incident to an operator for investigation.
 */
export const assignIncident = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const incident = await incidentService.assignIncident(req.params.id, req.body.assignedTo, req.user);
  res.status(200).json(new ApiResponse(200, { incident }, "Incident assigned successfully"));
});

/**
 * Add Note to Incident Endpoint
 * POST /api/v1/incidents/:id/notes
 * Operator appends a progress/investigation note to an incident.
 */
export const addIncidentNote = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const incident = await incidentService.addIncidentNote(req.params.id, req.body.text, req.user);
  res.status(200).json(new ApiResponse(200, { incident }, "Note added to incident"));
});

/**
 * Upload Media to Incident Endpoint
 * POST /api/v1/incidents/:id/media
 * Operator uploads photos or video clips as evidence for an incident.
 */
export const uploadIncidentMedia = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  // Files are handled by multer middleware before reaching here
  const filePaths = req.files
    ? (req.files as Express.Multer.File[]).map((f) => `/uploads/${f.filename}`)
    : [];

  if (filePaths.length === 0) {
    throw ApiError.badRequest("No media files provided");
  }

  const incident = await incidentService.uploadIncidentMedia(req.params.id, filePaths, req.user);
  res.status(200).json(new ApiResponse(200, { incident }, `${filePaths.length} media file(s) uploaded`));
});

/**
 * Close Incident Endpoint
 * PATCH /api/v1/incidents/:id/close
 * Operator or admin closes an incident with mandatory resolution notes.
 */
export const closeIncident = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const incident = await incidentService.closeIncident(req.params.id, req.body.resolutionNotes, req.user);
  res.status(200).json(new ApiResponse(200, { incident }, "Incident closed successfully"));
});

/**
 * Verify Incident Endpoint
 * POST /api/v1/incidents/:id/verify
 * Operator confirms the incident is a genuine, verified event.
 */
export const verifyIncident = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const incident = await incidentService.verifyIncident(req.params.id, req.body.notes, req.user);
  res.status(200).json(new ApiResponse(200, { incident }, "Incident verified"));
});

/**
 * Get Incident Timeline Endpoint
 * GET /api/v1/incidents/:id/timeline
 * Returns the full chronological audit trail of activity for an incident.
 */
export const getIncidentTimeline = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const timeline = await incidentService.getIncidentTimeline(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, { timeline }));
});

/**
 * Generate Incident Report Endpoint
 * GET /api/v1/incidents/:id/report
 * Returns a comprehensive data report for an incident (operator/admin only).
 */
export const getIncidentReport = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const report = await incidentService.getIncidentReport(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, report, "Incident report generated"));
});
