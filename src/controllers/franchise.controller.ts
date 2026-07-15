/**
 * @file franchise.controller.ts
 * @description Express request handlers for Franchise Management.
 */
import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as franchiseService from "../services/franchise.service";

/**
 * Create Franchise Endpoint
 * POST /api/v1/franchises
 * Creates a new franchise business entity.
 */
export const createFranchise = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const franchise = await franchiseService.createFranchise(req.body, req.user);
  res.status(201).json(new ApiResponse(201, { franchise }, "Franchise created successfully"));
});

/**
 * List Franchises Endpoint
 * GET /api/v1/franchises
 * Retrieves a paginated list of all franchises with aggregated stats.
 */
export const listFranchises = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await franchiseService.listFranchises(req.query, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

/**
 * Get Franchise Details Endpoint
 * GET /api/v1/franchises/:id
 * Retrieves details for a single franchise.
 */
export const getFranchiseDetails = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const franchise = await franchiseService.getFranchiseDetails(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, { franchise }));
});

/**
 * Update Franchise Endpoint
 * PUT /api/v1/franchises/:id
 * Updates franchise details or changes its status (e.g., suspends the franchise).
 */
export const updateFranchise = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const franchise = await franchiseService.updateFranchise(req.params.id, req.body, req.user);
  res.status(200).json(new ApiResponse(200, { franchise }, "Franchise updated successfully"));
});

/**
 * Assign User to Franchise Endpoint
 * POST /api/v1/franchises/:id/users/:userId
 * Links a customer or operator to a franchise.
 */
export const assignUserToFranchise = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const targetUser = await franchiseService.assignUserToFranchise(req.params.id, req.params.userId, req.user);
  res.status(200).json(new ApiResponse(200, { user: targetUser }, "User assigned to franchise successfully"));
});
