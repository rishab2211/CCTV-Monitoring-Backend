import { z } from "zod";

/**
 * Schema for creating a new Franchise.
 * Validates franchise name, code, owner, and optional contact info.
 */
export const createFranchiseSchema = z.object({
  body: z.object({
    name: z.string().min(3, "Franchise name must be at least 3 characters").max(100),
    franchiseCode: z.string().min(3, "Franchise code must be at least 3 characters").max(20).toUpperCase(),
    ownerId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Owner ID (must be a valid User ID)"),
    contactEmail: z.string().email("Invalid email").optional(),
    contactPhone: z.string().optional(),
    address: z.string().optional(),
  }),
});

/**
 * Schema for updating a Franchise.
 * Allows partial updates, including suspending a franchise.
 */
export const updateFranchiseSchema = z.object({
  body: z.object({
    name: z.string().min(3).max(100).optional(),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().optional(),
    address: z.string().optional(),
    status: z.enum(["active", "suspended"]).optional(),
  }),
});

/**
 * Schema for validating Franchise ID in route parameters.
 */
export const franchiseIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Franchise ID"),
  }),
});

/**
 * Schema for validating parameters when assigning a user to a franchise.
 * Validates both the franchise ID and the target user ID.
 */
export const assignUserToFranchiseSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Franchise ID"),
    userId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid User ID"),
  }),
});

/**
 * Schema for creating a CRM Lead for a franchise.
 */
export const createLeadSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Lead name is required"),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    status: z.enum(["new", "contacted", "qualified", "converted", "lost"]).optional(),
    notes: z.string().max(2000).optional(),
  }),
});

/**
 * Schema for updating a CRM Lead.
 */
export const updateLeadSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    status: z.enum(["new", "contacted", "qualified", "converted", "lost"]).optional(),
    notes: z.string().max(2000).optional(),
  }),
});

/**
 * Schema for validating franchise + lead params.
 */
export const leadParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Franchise ID"),
    leadId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Lead ID"),
  }),
});

/**
 * Schema for setting territory boundaries.
 */
export const updateTerritorySchema = z.object({
  body: z.object({
    city: z.string().optional(),
    state: z.string().optional(),
    zone: z.string().optional(),
    description: z.string().optional(),
  }),
});
