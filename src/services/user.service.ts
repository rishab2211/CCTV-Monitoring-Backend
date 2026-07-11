import mongoose from "mongoose";
import { User, UserDocument } from "../models/User";
import { ActivityLog, logActivity } from "../models/ActivityLog";
import { RefreshToken } from "../models/RefreshToken";
import { DeviceSession } from "../models/DeviceSession";
import { ApiError } from "../utils/ApiError";
import { parsePaginationParams } from "../utils/pagination";
import { UserRole } from "../types";
import {
  CreateUserInput,
  UpdateUserInput,
  UpdateProfileInput,
  UpdateStatusInput,
  ListUsersQuery,
} from "../validators/user.validator";
import { logger } from "../utils/logger";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds the MongoDB filter object for user list queries.
 */
const buildUserFilter = (
  query: ListUsersQuery,
  roleOverride?: UserRole
): Record<string, unknown> => {
  const filter: Record<string, unknown> = {
    isDeleted: false,
  };

  if (roleOverride) {
    filter.role = roleOverride;
  } else if (query.role) {
    filter.role = query.role;
  }

  if (query.isActive !== undefined) {
    filter.isActive = query.isActive;
  }

  if (query.search) {
    const searchRegex = new RegExp(query.search, "i");
    filter.$or = [
      { name: searchRegex },
      { email: searchRegex },
      { phone: searchRegex },
    ];
  }

  return filter;
};

/**
 * Revokes all sessions and refresh tokens for a user.
 * Used on deactivation and soft delete.
 */
const revokeUserSessions = async (userId: string): Promise<void> => {
  await Promise.all([
    RefreshToken.updateMany({ userId }, { isRevoked: true }),
    DeviceSession.updateMany({ userId }, { isActive: false }),
  ]);
};

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * List users with pagination, role filter, active filter, and search.
 * Excludes soft-deleted users.
 */
export const listUsers = async (
  query: ListUsersQuery,
  roleOverride?: UserRole
) => {
  const filter = buildUserFilter(query, roleOverride);
  const { page, limit, sortBy, sortOrder } = parsePaginationParams(query as Record<string, unknown>);
  const skip = (page - 1) * limit;
  const sortDir = sortOrder === "asc" ? 1 : -1;

  const [data, total] = await Promise.all([
    User.find(filter)
      .sort({ [sortBy]: sortDir })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
    },
  };
};

/**
 * Get a single user by ID. Throws 404 if not found or soft-deleted.
 */
export const getUserById = async (id: string): Promise<UserDocument> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest("Invalid user ID format");
  }

  const user = await User.findOne({ _id: id, isDeleted: false });
  if (!user) throw ApiError.notFound("User");
  return user;
};

/**
 * Create a new user (admin-initiated).
 * Password is set by the admin and will be hashed via pre-save hook.
 */
export const createUser = async (
  input: CreateUserInput,
  createdBy: { userId: string; name?: string }
): Promise<UserDocument> => {
  // Check uniqueness
  const [emailExists, phoneExists] = await Promise.all([
    User.findOne({ email: input.email, isDeleted: false }),
    User.findOne({ phone: input.phone, isDeleted: false }),
  ]);

  if (emailExists) throw ApiError.conflict("An account with this email already exists");
  if (phoneExists) throw ApiError.conflict("An account with this phone number already exists");

  const user = await User.create(input);

  logActivity({
    userId: user._id,
    action: "USER_CREATED",
    description: `Account created by admin (${createdBy.userId})`,
    metadata: { createdBy: createdBy.userId, role: user.role },
  });

  logger.info(`👤 User created: ${user.email} (${user.role}) by ${createdBy.userId}`);
  return user;
};

/**
 * Update a user's details (admin-initiated).
 * Role and email cannot be changed here.
 */
export const updateUser = async (
  id: string,
  input: UpdateUserInput
): Promise<UserDocument> => {
  const user = await getUserById(id);

  // Build a flat update object to handle nested sub-documents correctly
  const updateData: Record<string, unknown> = {};

  if (input.name !== undefined) updateData.name = input.name;
  if (input.phone !== undefined) updateData.phone = input.phone;
  if (input.address !== undefined) updateData.address = input.address;

  // Merge role-specific sub-documents (only update provided fields)
  if (input.franchiseDetails !== undefined) {
    for (const [k, v] of Object.entries(input.franchiseDetails)) {
      updateData[`franchiseDetails.${k}`] = v;
    }
  }
  if (input.operatorDetails !== undefined) {
    for (const [k, v] of Object.entries(input.operatorDetails)) {
      updateData[`operatorDetails.${k}`] = v;
    }
  }
  if (input.technicianDetails !== undefined) {
    for (const [k, v] of Object.entries(input.technicianDetails)) {
      updateData[`technicianDetails.${k}`] = v;
    }
  }
  if (input.customerDetails !== undefined) {
    for (const [k, v] of Object.entries(input.customerDetails)) {
      updateData[`customerDetails.${k}`] = v;
    }
  }

  const updated = await User.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true, runValidators: true }
  );

  if (!updated) throw ApiError.notFound("User");

  logActivity({
    userId: user._id,
    action: "USER_UPDATED",
    description: `Profile updated by admin`,
    metadata: { updatedFields: Object.keys(updateData) },
  });

  return updated;
};

/**
 * Soft-delete a user.
 * Sets isDeleted: true, deletedAt: now.
 * Revokes all sessions — user cannot log in after deletion.
 */
export const softDeleteUser = async (id: string): Promise<void> => {
  const user = await getUserById(id);

  if (user.role === "super_admin") {
    throw ApiError.forbidden("Super admin accounts cannot be deleted");
  }

  await User.findByIdAndUpdate(id, {
    $set: { isDeleted: true, deletedAt: new Date(), isActive: false },
  });

  await revokeUserSessions(id);

  logActivity({
    userId: user._id,
    action: "USER_DELETED",
    description: `Account soft-deleted`,
  });

  logger.info(`🗑️  User soft-deleted: ${user.email}`);
};

/**
 * Activate or deactivate a user account.
 * Deactivating revokes all active sessions.
 */
export const toggleUserStatus = async (
  id: string,
  input: UpdateStatusInput,
  changedBy: string
): Promise<UserDocument> => {
  const user = await getUserById(id);

  if (user.role === "super_admin" && !input.isActive) {
    throw ApiError.forbidden("Super admin accounts cannot be deactivated");
  }

  const updated = await User.findByIdAndUpdate(
    id,
    { $set: { isActive: input.isActive } },
    { new: true }
  );

  if (!updated) throw ApiError.notFound("User");

  if (!input.isActive) {
    await revokeUserSessions(id);
  }

  logActivity({
    userId: user._id,
    action: input.isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
    description: input.isActive
      ? `Account activated by ${changedBy}`
      : `Account deactivated by ${changedBy}${input.reason ? `: ${input.reason}` : ""}`,
    metadata: { changedBy, reason: input.reason },
  });

  logger.info(
    `${input.isActive ? "✅" : "🚫"} User ${input.isActive ? "activated" : "deactivated"}: ${user.email}`
  );

  return updated;
};

/**
 * Get paginated activity log for a user.
 */
export const getUserActivity = async (
  userId: string,
  query: Record<string, unknown>
) => {
  await getUserById(userId); // ensure user exists

  const { page, limit } = parsePaginationParams(query);
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    ActivityLog.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ActivityLog.countDocuments({ userId }),
  ]);

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
    },
  };
};

/**
 * Update the authenticated user's own profile.
 * Cannot change email, role, or password here.
 */
export const updateOwnProfile = async (
  userId: string,
  input: UpdateProfileInput
): Promise<UserDocument> => {
  // Check phone uniqueness if phone is being changed
  if (input.phone) {
    const phoneExists = await User.findOne({
      phone: input.phone,
      _id: { $ne: userId },
      isDeleted: false,
    });
    if (phoneExists) {
      throw ApiError.conflict("This phone number is already registered to another account");
    }
  }

  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: input },
    { new: true, runValidators: true }
  );

  if (!updated) throw ApiError.notFound("User");

  logActivity({
    userId: updated._id,
    action: "PROFILE_UPDATED",
    description: "Updated own profile",
    metadata: { updatedFields: Object.keys(input) },
  });

  return updated;
};

/**
 * Update avatar — placeholder (Cloudinary not yet configured).
 * Returns 501 Not Implemented.
 */
export const updateAvatar = async (_userId: string): Promise<never> => {
  throw new ApiError(501, "Avatar upload is not yet implemented. Cloudinary integration coming soon.");
};

/**
 * Get customer by ID — accessible by admin, franchise, and operator.
 */
export const getCustomerById = async (id: string): Promise<UserDocument> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest("Invalid customer ID format");
  }

  const customer = await User.findOne({
    _id: id,
    role: "customer",
    isDeleted: false,
  });

  if (!customer) throw ApiError.notFound("Customer");
  return customer;
};
