import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as roleService from "../services/role.service";

// ─── Role Controllers ─────────────────────────────────────────────────────────

/**
 * GET /api/v1/roles
 * List all roles (system + custom).
 */
export const listRoles = catchAsync(async (_req: Request, res: Response) => {
  const roles = await roleService.listRoles();
  res.status(200).json(new ApiResponse(200, { roles, count: roles.length }));
});

/**
 * GET /api/v1/roles/:id
 * Get single role by ID.
 */
export const getRole = catchAsync(async (req: Request, res: Response) => {
  const role = await roleService.getRoleById(req.params.id);
  res.status(200).json(new ApiResponse(200, { role }));
});

/**
 * POST /api/v1/roles
 * Create a new custom role.
 */
export const createRole = catchAsync(async (req: Request, res: Response) => {
  const role = await roleService.createRole(req.body);
  res.status(201).json(new ApiResponse(201, { role }, "Role created successfully"));
});

/**
 * PUT /api/v1/roles/:id
 * Update a role's display name and/or description.
 */
export const updateRole = catchAsync(async (req: Request, res: Response) => {
  const role = await roleService.updateRole(req.params.id, req.body);
  res.status(200).json(new ApiResponse(200, { role }, "Role updated successfully"));
});

/**
 * DELETE /api/v1/roles/:id
 * Delete a custom role (fails on system roles).
 */
export const deleteRole = catchAsync(async (req: Request, res: Response) => {
  await roleService.deleteRole(req.params.id);
  res.status(200).json(new ApiResponse(200, null, "Role deleted successfully"));
});

/**
 * GET /api/v1/roles/:id/permissions
 * Get all permissions for a role, grouped by resource.
 */
export const getRolePermissions = catchAsync(async (req: Request, res: Response) => {
  const data = await roleService.getRolePermissions(req.params.id);
  res.status(200).json(new ApiResponse(200, data));
});

/**
 * PUT /api/v1/roles/:id/permissions
 * Replace or merge a role's permission set.
 */
export const updateRolePermissions = catchAsync(async (req: Request, res: Response) => {
  const role = await roleService.updateRolePermissions(req.params.id, req.body);
  res.status(200).json(
    new ApiResponse(200, { role }, `Role permissions updated (${role.permissions.length} total)`)
  );
});

// ─── Permission Controllers ───────────────────────────────────────────────────

/**
 * GET /api/v1/permissions
 * List all available permissions, grouped by resource.
 */
export const listPermissions = catchAsync(async (_req: Request, res: Response) => {
  const data = await roleService.listPermissions();
  res.status(200).json(new ApiResponse(200, data));
});

/**
 * POST /api/v1/permissions
 * Create a new custom permission.
 */
export const createPermission = catchAsync(async (req: Request, res: Response) => {
  const permission = await roleService.createPermission(req.body);
  res.status(201).json(
    new ApiResponse(201, { permission }, "Permission created successfully")
  );
});

// ─── User Role Assignment Controllers ─────────────────────────────────────────

/**
 * POST /api/v1/users/:id/roles
 * Assign a role to a user (replaces their current role).
 */
export const assignRoleToUser = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const result = await roleService.assignRoleToUser(
    req.params.id,
    req.body,
    req.user.userId
  );

  res.status(200).json(
    new ApiResponse(
      200,
      result,
      `Role changed from "${result.previousRole}" to "${result.newRole}" successfully`
    )
  );
});

/**
 * DELETE /api/v1/users/:id/roles/:roleId
 * Remove a specific role from a user (reverts to "customer").
 */
export const removeRoleFromUser = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const result = await roleService.removeRoleFromUser(
    req.params.id,
    req.params.roleId,
    req.user.userId
  );

  res.status(200).json(
    new ApiResponse(
      200,
      result,
      `Role "${result.previousRole}" removed. User reverted to "${result.newRole}".`
    )
  );
});
