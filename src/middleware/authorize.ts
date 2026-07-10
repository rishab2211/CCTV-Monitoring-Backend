import { Request, Response, NextFunction, RequestHandler } from "express";
import { ApiError } from "../utils/ApiError";
import { UserRole } from "../types";

/**
 * Role-based access control middleware factory.
 *
 * Usage:
 *   router.get('/admin-only', authenticate, authorize('super_admin', 'admin'), controller)
 *
 * Must be used AFTER authenticate middleware.
 */
export const authorize = (...roles: UserRole[]): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(ApiError.unauthorized("Authentication required"));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `Access denied. Required roles: ${roles.join(", ")}. Your role: ${req.user.role}`
        )
      );
    }

    next();
  };
};

/**
 * Convenience aliases for common role combinations.
 * Usage: router.get('/path', authenticate, isSuperAdmin, controller)
 */
export const isSuperAdmin = authorize("super_admin");
export const isAdmin = authorize("super_admin", "admin");
export const isFranchise = authorize("super_admin", "admin", "franchise");
export const isOperator = authorize("super_admin", "admin", "operator");
export const isTechnician = authorize("super_admin", "admin", "technician");
export const isCustomer = authorize("customer");
