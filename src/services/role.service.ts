/**
 * @file role.service.ts
 * @description Manages dynamic RBAC roles and permissions.
 * Includes methods for creating, updating, and querying custom roles.
 */
import mongoose from "mongoose";
import { Role, RoleDocument, IRole } from "../models/Role";
import { Permission, PermissionDocument, IPermission } from "../models/Permission";
import { User } from "../models/User";
import { logActivity } from "../models/ActivityLog";
import { ApiError } from "../utils/ApiError";
import { invalidateRoleCache } from "../middleware/permit";
import { logger } from "../utils/logger";
import {
  CreateRoleInput,
  UpdateRoleInput,
  UpdateRolePermissionsInput,
  CreatePermissionInput,
  AssignRoleInput,
} from "../validators/role.validator";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface RoleWithCount extends IRole {
  permissionCount: number;
}

export interface GroupedRolePermissions {
  role: {
    _id: mongoose.Types.ObjectId;
    name: string;
    displayName: string;
    isSystem: boolean;
  };
  permissions: Record<string, IPermission[]>;
  totalCount: number;
}

export interface ListPermissionsResult {
  grouped: Record<
    string,
    Array<{ name: string; action: string; description: string; isSystem: boolean }>
  >;
  totalCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const validatePermissionsExist = async (permissions: string[]): Promise<void> => {
  if (permissions.length === 0) return;

  const existing = await Permission.find({ name: { $in: permissions } })
    .select("name")
    .lean<Array<{ name: string }>>();

  const existingNames = existing.map((p) => p.name);
  const invalid = permissions.filter((p) => !existingNames.includes(p));

  if (invalid.length > 0) {
    throw ApiError.badRequest(
      `The following permissions do not exist: ${invalid.join(", ")}`
    );
  }
};

/**
 * Get role by ID.
 * Retrieves the specific details and permissions array for a role.
 * 
 * @param id - Role ID
 */
export const getRoleById = async (id: string): Promise<RoleDocument> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest("Invalid role ID format");
  }
  const role = await Role.findById(id);
  if (!role) throw ApiError.notFound("Role");
  return role;
};

// ─── Role Service ─────────────────────────────────────────────────────────────

/**
 * Get all roles.
 * Returns a list of all roles (built-in and custom) configured in the system.
 */
export const listRoles = async (): Promise<RoleWithCount[]> => {
  const roles = await Role.find({}).sort({ isSystem: -1, name: 1 }).lean<IRole[]>();
  return roles.map((r) => ({
    ...r,
    permissionCount: r.permissions.length,
  }));
};

/**
 * Get permissions for a role by ID.
 * Specifically returns just the `permissions` array for a given role.
 * Used internally by the RBAC middleware or for frontend evaluation.
 * 
 * @param id - Role ID
 */
export const getRolePermissions = async (
  id: string
): Promise<GroupedRolePermissions> => {
  const role = await getRoleById(id);

  const permissions = await Permission.find({ name: { $in: role.permissions } })
    .sort({ resource: 1, action: 1 })
    .lean<IPermission[]>();

  // Group by resource for a cleaner API response
  const grouped = permissions.reduce<Record<string, IPermission[]>>(
    (acc, p) => {
      if (!acc[p.resource]) acc[p.resource] = [];
      acc[p.resource].push(p);
      return acc;
    },
    {}
  );

  return {
    role: {
      _id: role._id,
      name: role.name,
      displayName: role.displayName,
      isSystem: role.isSystem,
    },
    permissions: grouped,
    totalCount: permissions.length,
  };
};

/**
 * Create a new custom role.
 * Validates that a role with the same name doesn't already exist.
 * 
 * @param input - Role details (name, description, permissions)
 */
export const createRole = async (input: CreateRoleInput): Promise<RoleDocument> => {
  // Check name uniqueness
  const exists = await Role.findOne({ name: input.name });
  if (exists) throw ApiError.conflict(`A role with the name "${input.name}" already exists`);

  // Validate all permissions
  await validatePermissionsExist(input.permissions);

  const role = await Role.create({
    ...input,
    isSystem: false, // custom roles are never system roles
  });

  logger.info(`🔑 Custom role created: ${role.name}`);
  return role;
};

/**
 * Update an existing role.
 * Partially updates the permissions array or description of a custom role.
 * 
 * @param id - Role ID
 * @param input - Updates to apply
 */
export const updateRole = async (
  id: string,
  input: UpdateRoleInput
): Promise<RoleDocument> => {
  const updated = await Role.findByIdAndUpdate(
    id,
    { $set: input },
    { new: true, runValidators: true }
  );
  if (!updated) throw ApiError.notFound("Role");

  logger.info(`🔑 Role updated: ${updated.name}`);
  return updated;
};

/**
 * Delete a role.
 * Permanently removes a custom role from the database.
 * 
 * @param id - Role ID
 */
export const deleteRole = async (id: string): Promise<void> => {
  const role = await getRoleById(id);

  if (role.isSystem) {
    throw ApiError.forbidden(
      `System role "${role.name}" cannot be deleted. Only custom roles can be deleted.`
    );
  }

  // Check if any users are currently assigned to this role
  const usersWithRole = await User.countDocuments({ role: role.name, isDeleted: false });
  if (usersWithRole > 0) {
    throw ApiError.badRequest(
      `Cannot delete role "${role.name}" — ${usersWithRole} user(s) are currently assigned to it. Reassign them first.`
    );
  }

  await Role.findByIdAndDelete(id);
  invalidateRoleCache(role.name);
  logger.info(`🗑️  Custom role deleted: ${role.name}`);
};

/**
 * Replace or merge a role's permissions.
 * Validates all provided permissions exist.
 * Invalidates the permission cache for this role.
 */
export const updateRolePermissions = async (
  id: string,
  input: UpdateRolePermissionsInput
): Promise<RoleDocument> => {
  const role = await getRoleById(id);

  await validatePermissionsExist(input.permissions);

  let newPermissions: string[];

  if (input.replace) {
    newPermissions = input.permissions;
  } else {
    // Merge mode — add permissions without duplicates
    const merged = new Set([...role.permissions, ...input.permissions]);
    newPermissions = [...merged];
  }

  role.permissions = newPermissions;
  await role.save();

  // Invalidate cache so the permit() middleware picks up the new permissions immediately
  invalidateRoleCache(role.name);

  logger.info(`🔑 Permissions updated for role: ${role.name} (${newPermissions.length} total)`);
  return role;
};

// ─── Permission Service ───────────────────────────────────────────────────────

/**
 * List all permissions, grouped by resource.
 */
export const listPermissions = async (): Promise<ListPermissionsResult> => {
  const permissions = await Permission.find({})
    .sort({ resource: 1, action: 1 })
    .lean();

  const grouped = permissions.reduce<
    Record<string, Array<{ name: string; action: string; description: string; isSystem: boolean }>>
  >((acc, p) => {
    if (!acc[p.resource]) acc[p.resource] = [];
    acc[p.resource].push({
      name: p.name,
      action: p.action,
      description: p.description,
      isSystem: p.isSystem,
    });
    return acc;
  }, {});

  return {
    grouped,
    totalCount: permissions.length,
  };
};

/**
 * Create a new custom permission.
 * The name is auto-derived from resource:action if provided separately.
 */
export const createPermission = async (
  input: CreatePermissionInput
): Promise<PermissionDocument> => {
  const derivedName = `${input.resource}:${input.action}`;

  // Ensure the name field matches resource:action
  if (input.name !== derivedName) {
    throw ApiError.badRequest(
      `Permission name must match resource:action format. Expected: "${derivedName}", got: "${input.name}"`
    );
  }

  const exists = await Permission.findOne({ name: input.name });
  if (exists) throw ApiError.conflict(`Permission "${input.name}" already exists`);

  const permission = await Permission.create({ ...input, isSystem: false });
  logger.info(`🔑 Custom permission created: ${permission.name}`);
  return permission;
};

// ─── User Role Assignment ─────────────────────────────────────────────────────

/**
 * Assign a role to a user (replaces their current role).
 */
export const assignRoleToUser = async (
  userId: string,
  input: AssignRoleInput,
  changedBy: string
): Promise<{ userId: string; previousRole: string; newRole: string }> => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw ApiError.badRequest("Invalid user ID format");
  }

  const user = await User.findOne({ _id: userId, isDeleted: false });
  if (!user) throw ApiError.notFound("User");

  // Cannot assign super_admin via API
  if (input.role === "super_admin" as string) {
    throw ApiError.forbidden("super_admin cannot be assigned via the API");
  }

  // Validate the role exists in DB
  const roleDoc = await Role.findOne({ name: input.role });
  if (!roleDoc) throw ApiError.notFound("Role");

  const previousRole = user.role;
  user.role = input.role;
  await user.save();

  logActivity({
    userId: user._id,
    action: "USER_UPDATED",
    description: `Role changed from "${previousRole}" to "${input.role}" by ${changedBy}`,
    metadata: { previousRole, newRole: input.role, changedBy },
  });

  logger.info(`🔑 User ${user.email} role changed: ${previousRole} → ${input.role}`);

  return { userId, previousRole, newRole: input.role };
};

/**
 * Remove a role from a user (reverts to "customer" as the safe default).
 * The `:roleId` param refers to the Role document _id that should match the user's current role.
 */
export const removeRoleFromUser = async (
  userId: string,
  roleId: string,
  changedBy: string
): Promise<{ userId: string; previousRole: string; newRole: string }> => {
  if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(roleId)) {
    throw ApiError.badRequest("Invalid ID format");
  }

  const user = await User.findOne({ _id: userId, isDeleted: false });
  if (!user) throw ApiError.notFound("User");

  // Verify the roleId corresponds to the user's current role
  const roleDoc = await Role.findById(roleId);
  if (!roleDoc) throw ApiError.notFound("Role");

  if (roleDoc.name !== user.role) {
    throw ApiError.badRequest(
      `User's current role is "${user.role}", not "${roleDoc.name}". Cannot remove a role the user doesn't have.`
    );
  }

  if (user.role === "super_admin") {
    throw ApiError.forbidden("Cannot remove the super_admin role via API");
  }

  const previousRole = user.role;
  user.role = "customer"; // safe default
  await user.save();

  logActivity({
    userId: user._id,
    action: "USER_UPDATED",
    description: `Role "${previousRole}" removed by ${changedBy} — reverted to customer`,
    metadata: { previousRole, newRole: "customer", changedBy },
  });

  logger.info(`🔑 User ${user.email} role reverted: ${previousRole} → customer`);

  return { userId, previousRole, newRole: "customer" };
};
