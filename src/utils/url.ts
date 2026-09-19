import { Request } from "express";
import { env } from "../config/env";

/**
 * Resolves the public base URL of the running service.
 * Prioritizes:
 * 1. Explicit PUBLIC_BASE_URL env var
 * 2. Render-provided RENDER_EXTERNAL_URL (e.g. https://cctv-monitoring-backend.onrender.com)
 * 3. Incoming Request Host (if available via proxy headers)
 * 4. Localhost fallback
 */
export const getPublicBaseUrl = (req?: Request): string => {
  if (env.PUBLIC_BASE_URL) {
    return env.PUBLIC_BASE_URL.replace(/\/$/, "");
  }

  if (env.RENDER_EXTERNAL_URL) {
    return env.RENDER_EXTERNAL_URL.replace(/\/$/, "");
  }

  if (req) {
    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
    const host = (req.headers["x-forwarded-host"] as string) || req.get("host");
    if (host) {
      return `${proto}://${host}`;
    }
  }

  return `http://localhost:${env.PORT}`;
};

/**
 * Checks whether an incoming origin is permitted.
 * Permissively permits localhost and vercel.app preview branches
 * alongside explicitly configured origins for live demos.
 */
export const isOriginAllowed = (origin: string | undefined): boolean => {
  // Allow non-browser requests (curl, Postman, mobile native apps)
  if (!origin) return true;

  const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());

  // Wildcard configured
  if (allowedOrigins.includes("*")) return true;

  // Development mode
  if (env.NODE_ENV === "development") return true;

  // Explicit match in CORS_ORIGIN
  if (allowedOrigins.includes(origin)) return true;

  // Localhost (any port)
  if (/^http:\/\/localhost(:\d+)?$/.test(origin) || /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
    return true;
  }

  // Any Vercel preview or production deployment (e.g. cctv-monitoring-admin-panel.vercel.app or branch preview)
  if (/^https:\/\/[a-zA-Z0-9-_.]+\.vercel\.app$/.test(origin)) {
    return true;
  }

  return false;
};
