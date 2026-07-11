import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as userService from "../services/user.service";
import { UserRole } from "../types";
import { ListUsersQuery } from "../validators/user.validator";

// ─── Generic User CRUD ────────────────────────────────────────────────────────

/**
 * GET /api/v1/users
 * List all users with filters and pagination.
 */
export const listUsers = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.listUsers(req.query as unknown as ListUsersQuery);
  res.status(200).json(new ApiResponse(200, result));
});

/**
 * GET /api/v1/users/:id
 * Get a single user by ID.
 */
export const getUserById = catchAsync(async (req: Request, res: Response) => {
  const user = await userService.getUserById(req.params.id);
  res.status(200).json(new ApiResponse(200, { user }));
});

/**
 * POST /api/v1/users
 * Create a new user (admin-initiated).
 */
export const createUser = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await userService.createUser(req.body, {
    userId: req.user.userId,
  });
  res.status(201).json(new ApiResponse(201, { user }, "User created successfully"));
});

/**
 * PUT /api/v1/users/:id
 * Update a user's details.
 */
export const updateUser = catchAsync(async (req: Request, res: Response) => {
  const user = await userService.updateUser(req.params.id, req.body);
  res.status(200).json(new ApiResponse(200, { user }, "User updated successfully"));
});

/**
 * DELETE /api/v1/users/:id
 * Soft-delete a user (super_admin only).
 */
export const deleteUser = catchAsync(async (req: Request, res: Response) => {
  await userService.softDeleteUser(req.params.id);
  res.status(200).json(new ApiResponse(200, null, "User deleted successfully"));
});

/**
 * PATCH /api/v1/users/:id/status
 * Activate or deactivate a user account.
 */
export const updateUserStatus = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await userService.toggleUserStatus(
    req.params.id,
    req.body,
    req.user.userId
  );
  const action = user.isActive ? "activated" : "deactivated";
  res.status(200).json(new ApiResponse(200, { user }, `User ${action} successfully`));
});

/**
 * GET /api/v1/users/:id/activity
 * Get paginated activity log for a user.
 */
export const getUserActivity = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.getUserActivity(req.params.id, req.query as Record<string, unknown>);
  res.status(200).json(new ApiResponse(200, result));
});

// ─── Own Profile ──────────────────────────────────────────────────────────────

/**
 * PUT /api/v1/users/profile
 * Update own profile (any authenticated user).
 */
export const updateOwnProfile = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await userService.updateOwnProfile(req.user.userId, req.body);
  res.status(200).json(new ApiResponse(200, { user }, "Profile updated successfully"));
});

/**
 * PUT /api/v1/users/profile/avatar
 * Upload avatar — placeholder (501 Not Implemented).
 */
export const updateAvatar = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await userService.updateAvatar(req.user.userId);
  // updateAvatar always throws 501, this line is unreachable
  res.status(501).json(new ApiResponse(501, null, "Not implemented"));
});

// ─── Role-Specific List/Create Helpers ───────────────────────────────────────

/**
 * Factory for role-specific list controllers.
 * e.g. listByRole('operator') → GET /api/v1/operators
 */
const listByRole = (role: UserRole) =>
  catchAsync(async (req: Request, res: Response) => {
    const result = await userService.listUsers(
      req.query as unknown as ListUsersQuery,
      role
    );
    res.status(200).json(new ApiResponse(200, result));
  });

/**
 * Factory for role-specific create controllers.
 * e.g. createByRole('operator') → POST /api/v1/operators
 * Enforces the role in the body regardless of what the caller sends.
 */
const createByRole = (role: UserRole) =>
  catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const user = await userService.createUser(
      { ...req.body, role }, // override role to enforce correct type
      { userId: req.user.userId }
    );
    res.status(201).json(
      new ApiResponse(201, { user }, `${role.charAt(0).toUpperCase() + role.slice(1)} created successfully`)
    );
  });

// ─── Role-Specific Controllers ────────────────────────────────────────────────

export const listAdmins = listByRole("admin");
export const createAdmin = createByRole("admin");
export const listOperators = listByRole("operator");
export const createOperator = createByRole("operator");
export const listTechnicians = listByRole("technician");
export const createTechnician = createByRole("technician");
export const listCustomers = listByRole("customer");
export const createCustomer = createByRole("customer");

/**
 * GET /api/v1/customers/:id
 * Get a specific customer's details.
 */
export const getCustomerById = catchAsync(async (req: Request, res: Response) => {
  const customer = await userService.getCustomerById(req.params.id);
  res.status(200).json(new ApiResponse(200, { customer }));
});
