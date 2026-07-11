import { z } from "zod";
import { objectIdSchema } from "./auth.validator";

// ─── Permission name format ───────────────────────────────────────────────────

const permissionNameSchema = z
  .string()
  .regex(/^[a-z_]+:[a-z_]+$/, "Permission name must follow 'resource:action' format (e.g. cameras:read)");

// ─── Create Custom Role ───────────────────────────────────────────────────────

export const createRoleSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9_]+$/, "Role name must be lowercase letters, numbers, or underscores")
    .trim(),
  displayName: z.string().min(2).max(100).trim(),
  description: z.string().max(300).default(""),
  permissions: z
    .array(permissionNameSchema)
    .min(1, "At least one permission is required")
    .max(50, "Too many permissions"),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;

// ─── Update Role Metadata ─────────────────────────────────────────────────────

export const updateRoleSchema = z.object({
  displayName: z.string().min(2).max(100).trim().optional(),
  description: z.string().max(300).optional(),
});

export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

// ─── Update Role Permissions ──────────────────────────────────────────────────

export const updateRolePermissionsSchema = z.object({
  permissions: z
    .array(permissionNameSchema)
    .max(50, "Too many permissions"),
  // If true, replaces the entire permission set; if false, merges with existing
  replace: z.boolean().default(true),
});

export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;

// ─── Create Custom Permission ─────────────────────────────────────────────────

export const createPermissionSchema = z.object({
  name: permissionNameSchema,
  resource: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z_]+$/, "Resource must be lowercase letters or underscores")
    .trim(),
  action: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z_]+$/, "Action must be lowercase letters or underscores")
    .trim(),
  description: z.string().min(1).max(300).trim(),
});

export type CreatePermissionInput = z.infer<typeof createPermissionSchema>;

// ─── Assign Role to User ──────────────────────────────────────────────────────

export const assignRoleSchema = z.object({
  role: z.enum(
    ["admin", "franchise", "operator", "technician", "customer"],
    { errorMap: () => ({ message: "Invalid role. Cannot assign super_admin via API." }) }
  ),
});

export type AssignRoleInput = z.infer<typeof assignRoleSchema>;

// ─── Param Schemas ────────────────────────────────────────────────────────────

export const roleIdParamSchema = z.object({
  id: objectIdSchema,
});

export const userRoleParamSchema = z.object({
  id: objectIdSchema,      // user ID
  roleId: objectIdSchema,  // role ID to remove
});

export type RoleIdParam = z.infer<typeof roleIdParamSchema>;
