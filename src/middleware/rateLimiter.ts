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
    // Whitelist health check endpoints and root probes
    if (
      req.path === "/" ||
      req.path === "/health" ||
      req.path === "/api/health" ||
      req.path === "/api/v1/health" ||
      req.path.startsWith("/api/v1/health") ||
      req.path.startsWith("/health")
    ) {
      return true;
    }

    // Whitelist periodic heartbeats (stream sessions & camera hardware pings) (B16)
    // Multi-camera monitoring sends heartbeats every 30s which would quickly exceed the 100req/15m limit
    if (req.path.includes("/heartbeat")) {
      return true;
    }

    // Whitelist internal hardware and automated system requests
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

/**
 * WHIP/WHEP stream limiter — prevents DDoS on WebRTC session initiation and WHIP publish (B8).
 * Only throttles state-changing requests (POST, PUT, DELETE); GET media playback is never choked.
 */
export const whipLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // Up to 60 session starts/publishes per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // GET/OPTIONS/HEAD for reading streams must never be throttled
    return req.method === "GET" || req.method === "OPTIONS" || req.method === "HEAD";
  },
  handler: (_req, _res, next) => {
    next(
      new ApiError(
        429,
        "Too many stream initiation requests. Please wait a minute before retrying.",
        []
      )
    );
  },
});
