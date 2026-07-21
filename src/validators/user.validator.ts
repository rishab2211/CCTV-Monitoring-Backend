import { z } from "zod";
import { objectIdSchema } from "./auth.validator";

// ─── Reusable field schemas ───────────────────────────────────────────────────

const phoneSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, "Please provide a valid 10-digit Indian phone number");

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

const addressSchema = z
  .object({
    street: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    pincode: z.string().regex(/^\d{6}$/, "Pincode must be 6 digits").optional(),
    country: z.string().max(100).default("India").optional(),
  })
  .optional();

// ─── Role-specific detail schemas ─────────────────────────────────────────────

const franchiseDetailsSchema = z
  .object({
    territory: z
      .object({
        city: z.string().min(1),
        state: z.string().min(1),
        zone: z.string().min(1),
      })
      .optional(),
    commissionRate: z.number().min(0).max(100).optional(),
    royaltyRate: z.number().min(0).max(100).optional(),
    franchiseCode: z.string().max(50).optional(),
    franchiseRef: objectIdSchema.optional(),
  })
  .optional();

const operatorDetailsSchema = z
  .object({
    shiftStart: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "shiftStart must be HH:MM format")
      .optional(),
    shiftEnd: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "shiftEnd must be HH:MM format")
      .optional(),
    assignedFranchise: objectIdSchema.optional(),
  })
  .optional();

const technicianDetailsSchema = z
  .object({
    skills: z.array(z.string().max(100)).max(20).optional(),
    certifications: z.array(z.string().max(200)).max(20).optional(),
    assignedFranchise: objectIdSchema.optional(),
  })
  .optional();

const customerDetailsSchema = z
  .object({
    billingAddress: addressSchema,
    assignedFranchise: objectIdSchema.optional(),
    emergencyContact: z
      .object({
        name: z.string().min(1).max(100),
        phone: phoneSchema,
        relation: z.string().min(1).max(50),
      })
      .optional(),
  })
  .optional();

// ─── List Users Query ─────────────────────────────────────────────────────────

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  role: z
    .enum(["super_admin", "admin", "franchise", "franchise_admin", "operator", "technician", "customer"])
    .optional(),
  isActive: z
    .preprocess((v) => {
      if (v === "true" || v === true) return true;
      if (v === "false" || v === false) return false;
      return undefined;
    }, z.boolean().optional()),
  search: z.string().max(100).trim().optional(), // searches name, email, phone
  sortBy: z
    .enum(["createdAt", "name", "email", "role"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

// ─── Create User (admin creates any role) ────────────────────────────────────

export const createUserSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().toLowerCase().trim(),
  phone: phoneSchema,
  password: passwordSchema,
  role: z.enum(["admin", "franchise", "franchise_admin", "operator", "technician", "customer"]),
  address: addressSchema,
  // Role-specific optional sub-documents
  franchiseDetails: franchiseDetailsSchema,
  operatorDetails: operatorDetailsSchema,
  technicianDetails: technicianDetailsSchema,
  customerDetails: customerDetailsSchema,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// ─── Update User (admin updates any user) ────────────────────────────────────

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  phone: phoneSchema.optional(),
  address: addressSchema,
  franchiseDetails: franchiseDetailsSchema,
  operatorDetails: operatorDetailsSchema,
  technicianDetails: technicianDetailsSchema,
  customerDetails: customerDetailsSchema,
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// ─── Update Own Profile ───────────────────────────────────────────────────────

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  phone: phoneSchema.optional(),
  address: addressSchema,
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ─── Toggle Status ─────────────────────────────────────────────────────────────

export const updateStatusSchema = z.object({
  isActive: z.boolean({ required_error: "isActive (boolean) is required" }),
  reason: z.string().max(300).optional(), // optional reason for audit
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

// ─── Param Schemas ────────────────────────────────────────────────────────────

export const userIdParamSchema = z.object({
  id: objectIdSchema,
});

export const sessionIdParamSchema = z.object({
  sessionId: z.string().min(1),
});

export type UserIdParam = z.infer<typeof userIdParamSchema>;
