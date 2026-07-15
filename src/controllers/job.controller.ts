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
 * PUT /api/v1/jobs/:id/reassign
 * Changes the assigned technician for a job.
 * Dispatches a push notification to the new technician.
 * 
 * @param req - Express Request object containing new technician ID
 * @param res - Express Response object
 */
export const reassignJob = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const job = await jobService.reassignJob(req.params.id, req.body.assignedTechnician, req.user);
  res.status(200).json(new ApiResponse(200, { job }, "Job reassigned successfully"));
});
