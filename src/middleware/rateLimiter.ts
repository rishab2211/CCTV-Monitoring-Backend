import rateLimit from "express-rate-limit";
import { ApiError } from "../utils/ApiError";
import { env } from "../config/env";
import { safeCompare } from "../utils/helpers";

/**
 * General API rate limiter — 100 requests per 15 minutes per IP.
 * Applied globally to all routes.
 */
export const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  skip: (req) => {
    // Whitelist internal hardware and automated system requests from rate limiting
    const key = req.headers["x-system-key"];
    return typeof key === "string" && safeCompare(key, env.SYSTEM_API_KEY);
  },
  handler: (_req, _res, next) => {

    next(
      new ApiError(
        429,
        "Too many requests. Please try again later.",
        [],
      )
    );
  },
});

/**
 * Auth rate limiter — stricter: 10 requests per 15 minutes per IP.
 * Applied to login, register, forgot-password, verify-otp endpoints.
 */
export const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(
      new ApiError(
        429,
        "Too many authentication attempts. Please try again in 15 minutes.",
        [],
      )
    );
  },
  skipSuccessfulRequests: false,
});

/**
 * OTP rate limiter — very strict: 5 requests per 15 minutes per IP.
 * Applied to forgot-password specifically.
 */
export const otpLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(
      new ApiError(
        429,
        "Too many OTP requests. Please try again in 15 minutes.",
        [],
      )
    );
  },
});
