/**
 * @file franchise.routes.ts
 * @description Express Router for Franchise Management (Module 12).
 * Implements all 14 endpoints specified in the project analysis.
 */
import { Router } from "express";
import * as franchiseController from "../../controllers/franchise.controller";
import { authenticate } from "../../middleware/auth";
import { permit } from "../../middleware/permit";
import { validate } from "../../middleware/validate";
import {
  createFranchiseSchema,
  updateFranchiseSchema,
  franchiseIdParamSchema,
  assignUserToFranchiseSchema,
  createLeadSchema,
  updateLeadSchema,
  leadParamSchema,
  updateTerritorySchema,
} from "../../validators/franchise.validator";

const router = Router();

// All endpoints require authentication
router.use(authenticate);

// ─── Core CRUD ────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/franchises
 * Super Admin / Admin creates a new franchise business entity.
 */
router.post(
  "/",
  permit("franchises:write"),
  validate(createFranchiseSchema, "body"),
  franchiseController.createFranchise
);

/**
 * GET /api/v1/franchises
 * Super Admin / Admin lists all franchises with aggregated stats.
 */
router.get(
  "/",
  permit("franchises:read"),
  franchiseController.listFranchises
);

/**
 * GET /api/v1/franchises/:id
 * Admin or franchise owner views franchise details.
 */
router.get(
  "/:id",
  permit("franchises:read"),
  validate(franchiseIdParamSchema, "params"),
  franchiseController.getFranchiseDetails
);

/**
 * PUT /api/v1/franchises/:id
 * Admin updates or suspends a franchise.
 */
router.put(
  "/:id",
  permit("franchises:write"),
  validate(franchiseIdParamSchema, "params"),
  validate(updateFranchiseSchema, "body"),
  franchiseController.updateFranchise
);

// ─── User Assignment ──────────────────────────────────────────────────────────

/**
 * POST /api/v1/franchises/:id/users/:userId
 * Admin assigns a customer or operator to a franchise.
 */
router.post(
  "/:id/users/:userId",
  permit("franchises:write"),
  validate(assignUserToFranchiseSchema, "params"),
  franchiseController.assignUserToFranchise
);

// ─── Customers ────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/franchises/:id/customers
 * Franchise owner or admin lists all customers registered under this franchise.
 */
router.get(
  "/:id/customers",
  permit("franchises:read"),
  validate(franchiseIdParamSchema, "params"),
  franchiseController.getFranchiseCustomers
);

// ─── CRM Leads ────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/franchises/:id/leads
 * Franchise owner or admin retrieves the CRM leads list.
 */
router.get(
  "/:id/leads",
  permit("franchises:read"),
  validate(franchiseIdParamSchema, "params"),
  franchiseController.getFranchiseLeads
);

/**
 * POST /api/v1/franchises/:id/leads
 * Franchise owner creates a new sales lead/prospect.
 */
router.post(
  "/:id/leads",
  permit("franchises:write"),
  validate(franchiseIdParamSchema, "params"),
  validate(createLeadSchema, "body"),
  franchiseController.createFranchiseLead
);

/**
 * PUT /api/v1/franchises/:id/leads/:leadId
 * Franchise owner updates an existing lead's status, notes, or contact info.
 */
router.put(
  "/:id/leads/:leadId",
  permit("franchises:write"),
  validate(leadParamSchema, "params"),
  validate(updateLeadSchema, "body"),
  franchiseController.updateFranchiseLead
);

// ─── Financial Reports ────────────────────────────────────────────────────────

/**
 * GET /api/v1/franchises/:id/commission
 * Franchise owner or admin views commission earned this period.
 */
router.get(
  "/:id/commission",
  permit("franchises:read"),
  validate(franchiseIdParamSchema, "params"),
  franchiseController.getCommissionReport
);

/**
 * GET /api/v1/franchises/:id/royalty
 * Franchise owner or admin views royalty owed to the parent company.
 */
router.get(
  "/:id/royalty",
  permit("franchises:read"),
  validate(franchiseIdParamSchema, "params"),
  franchiseController.getRoyaltyReport
);

/**
 * GET /api/v1/franchises/:id/sales
 * Franchise owner or admin views a sales summary report.
 */
router.get(
  "/:id/sales",
  permit("franchises:read"),
  validate(franchiseIdParamSchema, "params"),
  franchiseController.getSalesReport
);

// ─── Territory ────────────────────────────────────────────────────────────────

/**
 * PUT /api/v1/franchises/:id/territory
 * Admin sets the territory (city/state/zone) boundaries for a franchise.
 */
router.put(
  "/:id/territory",
  permit("franchises:write"),
  validate(franchiseIdParamSchema, "params"),
  validate(updateTerritorySchema, "body"),
  franchiseController.updateTerritory
);

/**
 * GET /api/v1/franchises/:id/territory
 * Franchise owner or admin retrieves territory configuration.
 */
router.get(
  "/:id/territory",
  permit("franchises:read"),
  validate(franchiseIdParamSchema, "params"),
  franchiseController.getTerritory
);

export default router;
