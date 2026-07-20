import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError";
import { env } from "../config/env";
import { JwtAccessPayload } from "../types";

/**
 * Authentication middleware — verifies the JWT access token.
 *
 * Expects: Authorization: Bearer <token>
 * On success: attaches decoded payload to req.user
 * On failure: throws 401 ApiError
 */
export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  try {
    // ── Check System API Key (bypass JWT for internal hardware/cron requests) ──
    const systemKey = req.headers["x-system-key"];
    if (systemKey && systemKey === env.SYSTEM_API_KEY) {
      req.user = {
        userId: "system",
        role: "super_admin",
        sessionId: "system-session",
        email: "system@cctvmonitor.com",
      };
      return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw ApiError.unauthorized("No authentication token provided");
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      throw ApiError.unauthorized("No authentication token provided");
    }

    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET) as JwtAccessPayload;

    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      sessionId: decoded.sessionId,
      email: decoded.email,
      franchiseId: decoded.franchiseId,
    };

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else if ((error as Error).name === "TokenExpiredError") {
      next(ApiError.unauthorized("Access token has expired"));
    } else if ((error as Error).name === "JsonWebTokenError") {
      next(ApiError.unauthorized("Invalid access token"));
    } else {
      next(error);
    }
  }
};


/**
 * Optional authentication — does NOT throw if no token is present.
 * Attaches req.user if valid token found, otherwise continues without it.
 */
export const optionalAuthenticate = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return next();

    const token = authHeader.split(" ")[1];
    if (!token) return next();

    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET) as JwtAccessPayload;
    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      sessionId: decoded.sessionId,
      email: decoded.email,
      franchiseId: decoded.franchiseId,
    };
  } catch {
    // Silently ignore — optional auth doesn't fail on bad tokens
  } finally {
    next();
  }
};
