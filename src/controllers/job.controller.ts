/**
 * @file job.controller.ts
 * @description Express request handlers for Technician / Installation Jobs.
 */
import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as jobService from "../services/job.service";
import fs from "fs";

/**
 * Create Job Endpoint
 * POST /api/v1/jobs
 * Creates a new installation/maintenance job.
 * Only Admins and Franchise managers can perform this action.
 * 
 * @param req - Express Request object containing job payload
 * @param res - Express Response object
 */
export const createJob = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const job = await jobService.createJob(req.body, req.user);
  res.status(201).json(new ApiResponse(201, { job }, "Job created successfully"));
});

/**
 * List Jobs Endpoint
 * GET /api/v1/jobs
 * Retrieves a paginated list of jobs.
 * Filters output automatically using RBAC (Technicians only see theirs).
 * 
 * @param req - Express Request object containing query filters
 * @param res - Express Response object
 */
export const listJobs = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await jobService.listJobs(req.query, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

/**
 * Get Job Details Endpoint
 * GET /api/v1/jobs/:id
 * Retrieves details for a specific job, including populated relations 
 * for technician, franchise, and camera.
 * 
 * @param req - Express Request object
 * @param res - Express Response object
 */
export const getJobDetails = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const job = await jobService.getJobDetails(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, { job }));
});

/**
 * Update Job Status Endpoint
 * PUT /api/v1/jobs/:id/status
 * Updates the status of a job (e.g. to 'completed').
 * Handles multipart/form-data for uploading proof-of-work photos using Multer.
 * 
 * @param req - Express Request object containing multer files and status updates
 * @param res - Express Response object
 */
export const updateJobStatus = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  
  const updateData = { ...req.body };

  // Handle uploaded files from multer
  if (req.files && Array.isArray(req.files)) {
    const filePaths = req.files.map((file: Express.Multer.File) => {
      return `/uploads/${file.filename}`;
    });
    updateData.attachments = filePaths;
  }

  const job = await jobService.updateJobStatus(req.params.id, updateData, req.user);
  res.status(200).json(new ApiResponse(200, { job }, "Job status updated successfully"));
});

/**
 * Reassign Job Endpoint
 * PUT /api/v1/installations/:id/reassign
 * Changes the assigned technician for a job.
 */
export const reassignJob = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const job = await jobService.reassignJob(req.params.id, req.body.assignedTechnician, req.user);
  res.status(200).json(new ApiResponse(200, { job }, "Job reassigned successfully"));
});

/**
 * Get Assigned Jobs Endpoint
 * GET /api/v1/installations/assigned
 * Returns only the jobs assigned to the authenticated technician.
 */
export const getAssignedJobs = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const jobs = await jobService.getAssignedJobs(req.user);
  res.status(200).json(new ApiResponse(200, { jobs, count: jobs.length }));
});

/**
 * Submit Checklist Endpoint
 * POST /api/v1/installations/:id/checklist
 * Technician submits the on-site installation checklist.
 */
export const submitChecklist = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const job = await jobService.submitChecklist(req.params.id, req.body.items, req.user);
  res.status(200).json(new ApiResponse(200, { job }, "Checklist submitted"));
});

/**
 * Upload Installation Photos Endpoint
 * POST /api/v1/installations/:id/photos
 * Technician uploads proof-of-work photos (multipart/form-data).
 */
export const uploadJobPhotos = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const filePaths = req.files
    ? (req.files as Express.Multer.File[]).map((f) => `/uploads/${f.filename}`)
    : [];

  if (filePaths.length === 0) throw ApiError.badRequest("No photo files provided");

  const job = await jobService.uploadJobPhotos(req.params.id, filePaths, req.user);
  res.status(200).json(new ApiResponse(200, { job }, `${filePaths.length} photo(s) uploaded`));
});

/**
 * Upload Customer Signature Endpoint
 * POST /api/v1/installations/:id/signature
 * Technician uploads the customer's digital signature image after completion.
 */
export const uploadCustomerSignature = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) throw ApiError.badRequest("No signature file provided");

  const signaturePath = `/uploads/${files[0].filename}`;
  const job = await jobService.uploadCustomerSignature(req.params.id, signaturePath, req.user);
  res.status(200).json(new ApiResponse(200, { job }, "Customer signature uploaded"));
});

/**
 * Complete Job Endpoint
 * PATCH /api/v1/installations/:id/complete
 * Explicitly marks a job as completed and records the timestamp.
 */
export const completeJob = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const job = await jobService.completeJob(req.params.id, req.body.notes, req.user);
  res.status(200).json(new ApiResponse(200, { job }, "Job marked as completed"));
});

/**
 * Get Job Report Endpoint
 * GET /api/v1/installations/:id/report
 * Returns a full completion report including checklist, photos, and signature status.
 */
export const getJobReport = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const report = await jobService.getJobReport(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, report, "Job report generated"));
});

/**
 * Get Technician Schedule Endpoint
 * GET /api/v1/technicians/:id/schedule
 * Returns upcoming/active jobs for a specific technician.
 */
export const getTechnicianSchedule = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const jobs = await jobService.getTechnicianSchedule(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, { jobs, count: jobs.length }));
});

/**
 * Update GPS Location Endpoint
 * POST /api/v1/technicians/:id/gps
 * Technician posts their current coordinates during an active/scheduled job.
 */
export const updateGpsLocation = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await jobService.updateGpsLocation(req.params.id, req.body.lat, req.body.lng, req.user);
  res.status(200).json(new ApiResponse(200, result, "GPS location updated"));
});
