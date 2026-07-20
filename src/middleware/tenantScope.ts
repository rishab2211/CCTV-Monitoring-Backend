import { Request, Response, NextFunction, RequestHandler } from "express";
import { ApiError } from "../utils/ApiError";

/**
 * Tenant Scope Middleware
 *
 * Extracts the franchiseId from the authenticated user's JWT payload
 * and attaches it to `req.franchiseScope`.
 *
 * Usage: place AFTER `authenticate` on any route that requires tenant isolation.
 *
 * - `req.franchiseScope === null`  → super_admin / admin → global access (no filter)
 * - `req.franchiseScope === string` → scoped to that franchiseId
 *
 * Services should spread `franchiseScope` into their MongoDB queries:
 *   const filter = { isDeleted: false, ...(req.franchiseScope ? { franchiseId: req.franchiseScope } : {}) };
 */
export const tenantScope: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    return next(ApiError.unauthorized("Authentication required"));
  }

  const { role, franchiseId } = req.user;

  if (role === "super_admin" || role === "admin") {
    // Global access — no tenant filter applied
    req.franchiseScope = null;
    return next();
  }

  if (!franchiseId) {
    // Franchise-scoped role but no franchiseId in token — account not properly set up
    return next(
      ApiError.forbidden(
        "Your account is not associated with a franchise. Please contact your administrator."
      )
    );
  }

  req.franchiseScope = franchiseId;
  next();
};
