import { Request, Response, NextFunction } from "express";
import { Role } from "../models/Role";
import { ApiError } from "../utils/ApiError";
import { logger } from "../utils/logger";

// ─── Permission Cache ─────────────────────────────────────────────────────────
// Avoids a DB lookup on every request. TTL = 60 seconds.
// Invalidated explicitly when role permissions are updated via the API.

interface CacheEntry {
  permissions: string[];
  cachedAt: number;
}

const CACHE_TTL_MS = 60 * 1000; // 60 seconds
const permissionCache = new Map<string, CacheEntry>();

/**
 * Invalidate a specific role's cache entry.
 * Call this in role.service.ts whenever role permissions are updated.
 */
export const invalidateRoleCache = (roleName: string): void => {
  permissionCache.delete(roleName);
};

/**
 * Invalidate all cached role entries.
 * Call this when bulk role changes occur.
 */
export const invalidateAllRoleCache = (): void => {
  permissionCache.clear();
};

// ─── Cache-aware Role Permission Lookup ──────────────────────────────────────

const getRolePermissions = async (roleName: string): Promise<string[]> => {
  const now = Date.now();
  const cached = permissionCache.get(roleName);

  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.permissions;
  }

  // Cache miss or expired — fetch from DB
  const role = await Role.findOne({ name: roleName }).lean();

  if (!role) {
    logger.warn(`[permit] Role "${roleName}" not found in DB — denying access`);
    return [];
  }

  permissionCache.set(roleName, {
    permissions: role.permissions,
    cachedAt: now,
  });

  return role.permissions;
};

// ─── Middleware Factory ───────────────────────────────────────────────────────

/**
 * `permit(...permissions)` — granular permission-based access control.
 *
 * Checks that the authenticated user's role has AT LEAST ONE of the
 * specified permissions (OR logic). Use after `authenticate`.
 *
 * @example
 * router.get('/cameras', authenticate, permit('cameras:read'), handler);
 * router.post('/cameras', authenticate, permit('cameras:write'), handler);
 * router.post('/cameras/:id/assign', authenticate, permit('cameras:assign', 'cameras:write'), handler);
 */
export const permit = (...requiredPermissions: string[]) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(ApiError.unauthorized("Authentication required"));
      }

      const { role } = req.user;

      // Super admin bypass — always has all permissions
      if (role === "super_admin") {
        return next();
      }

      const rolePermissions = await getRolePermissions(role);

      // OR logic: user needs at least one of the required permissions
      const hasPermission = requiredPermissions.some((p) =>
        rolePermissions.includes(p)
      );

      if (!hasPermission) {
        return next(
          ApiError.forbidden(
            `Permission denied. Required: ${requiredPermissions.join(" or ")}`
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
