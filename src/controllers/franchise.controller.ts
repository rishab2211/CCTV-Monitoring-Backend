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

/**
 * Get Franchise Customers Endpoint
 * GET /api/v1/franchises/:id/customers
 * Returns all customers registered under this franchise.
 */
export const getFranchiseCustomers = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const customers = await franchiseService.getFranchiseCustomers(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, { customers, count: customers.length }));
});

/**
 * Get Franchise Leads Endpoint
 * GET /api/v1/franchises/:id/leads
 * Returns the CRM leads list for a franchise.
 */
export const getFranchiseLeads = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const leads = await franchiseService.getFranchiseLeads(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, { leads, count: leads.length }));
});

/**
 * Create Franchise Lead Endpoint
 * POST /api/v1/franchises/:id/leads
 * Adds a new prospect/lead to the franchise's CRM.
 */
export const createFranchiseLead = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const lead = await franchiseService.createFranchiseLead(req.params.id, req.body, req.user);
  res.status(201).json(new ApiResponse(201, { lead }, "Lead created successfully"));
});

/**
 * Update Franchise Lead Endpoint
 * PUT /api/v1/franchises/:id/leads/:leadId
 * Updates an existing CRM lead (e.g., marks as contacted, qualified, or converted).
 */
export const updateFranchiseLead = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const lead = await franchiseService.updateFranchiseLead(req.params.id, req.params.leadId, req.body, req.user);
  res.status(200).json(new ApiResponse(200, { lead }, "Lead updated successfully"));
});

/**
 * Get Commission Report Endpoint
 * GET /api/v1/franchises/:id/commission
 * Returns commission earned by the franchise for the current period.
 */
export const getCommissionReport = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const report = await franchiseService.getCommissionReport(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, report));
});

/**
 * Get Royalty Report Endpoint
 * GET /api/v1/franchises/:id/royalty
 * Returns royalty owed by the franchise to the parent company.
 */
export const getRoyaltyReport = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const report = await franchiseService.getRoyaltyReport(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, report));
});

/**
 * Get Sales Report Endpoint
 * GET /api/v1/franchises/:id/sales
 * Returns a sales summary including customer counts and lead conversions.
 */
export const getSalesReport = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const report = await franchiseService.getSalesReport(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, report));
});

/**
 * Update Territory Endpoint
 * PUT /api/v1/franchises/:id/territory
 * Admin sets the territory boundaries for a franchise (city/state/zone strings).
 */
export const updateTerritory = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const territory = await franchiseService.updateTerritory(req.params.id, req.body, req.user);
  res.status(200).json(new ApiResponse(200, { territory }, "Territory updated successfully"));
});

/**
 * Get Territory Endpoint
 * GET /api/v1/franchises/:id/territory
 * Returns the territory configuration for a franchise.
 */
export const getTerritory = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const territory = await franchiseService.getTerritory(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, { territory }));
});
