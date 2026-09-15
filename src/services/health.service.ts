/**
 * @file health.service.ts
 * @description Dynamic, modular health check service inspecting database,
 * media gateway (MediaMTX), storage (Cloudinary), mailer, and system telemetry.
 */
import mongoose from "mongoose";
import os from "os";
import { env } from "../config/env";

export interface ServiceHealth {
  status: "connected" | "disconnected" | "connecting" | "degraded" | "not_configured" | "unreachable";
  latencyMs?: number;
  details?: Record<string, unknown>;
}

export interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  success: boolean;
  statusCode: number;
  message: string;
  version: string;
  timestamp: string;
  environment: string;
  uptime: {
    seconds: number;
    formatted: string;
  };
  services: {
    database: ServiceHealth;
    mediaGateway: ServiceHealth;
    storage: ServiceHealth;
    email: ServiceHealth;
  };
  system: {
    memory: {
      rssMb: number;
      heapUsedMb: number;
      heapTotalMb: number;
      systemFreeMb: number;
      systemTotalMb: number;
    };
    process: {
      nodeVersion: string;
      platform: string;
      pid: number;
    };
  };
}

/**
 * Format uptime seconds into human-readable duration (e.g., "1d 2h 30m 15s")
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSecs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${remainingSecs}s`);
  return parts.join(" ");
}

/**
 * Inspect MongoDB connectivity and latency
 */
export async function checkDatabaseHealth(): Promise<ServiceHealth> {
  const state = mongoose.connection.readyState;
  if (state !== 1) {
    const stateMap: Record<number, ServiceHealth["status"]> = {
      0: "disconnected",
      2: "connecting",
      3: "disconnected",
    };
    return {
      status: stateMap[state] || "disconnected",
      details: { readyState: state },
    };
  }

  const start = Date.now();
  try {
    if (mongoose.connection.db) {
      await mongoose.connection.db.admin().ping();
    }
    return {
      status: "connected",
      latencyMs: Date.now() - start,
      details: { readyState: 1 },
    };
  } catch (err: unknown) {
    return {
      status: "degraded",
      latencyMs: Date.now() - start,
      details: { readyState: 1, error: err instanceof Error ? err.message : String(err) },
    };
  }
}

/**
 * Inspect MediaMTX Streaming Gateway status
 */
export async function checkMediaGatewayHealth(): Promise<ServiceHealth> {
  const apiUrl = env.MEDIAMTX_API_URL;
  if (!apiUrl) {
    return { status: "not_configured" };
  }

  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);

  try {
    const res = await fetch(`${apiUrl}/config/global/get`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return {
      status: res.ok ? "connected" : "degraded",
      latencyMs: Date.now() - start,
      details: { statusCode: res.status },
    };
  } catch {
    clearTimeout(timeout);
    // Fallback: ping root URL
    try {
      const fallbackCtrl = new AbortController();
      const fallbackTimeout = setTimeout(() => fallbackCtrl.abort(), 1000);
      const res = await fetch(env.MEDIAMTX_URL, { signal: fallbackCtrl.signal });
      clearTimeout(fallbackTimeout);
      return {
        status: res.ok || res.status < 500 ? "connected" : "degraded",
        latencyMs: Date.now() - start,
      };
    } catch {
      return {
        status: "unreachable",
        latencyMs: Date.now() - start,
        details: { target: apiUrl },
      };
    }
  }
}

/**
 * Inspect Cloudinary storage configuration
 */
export function checkStorageHealth(): ServiceHealth {
  const isConfigured = Boolean(
    env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
  );
  return {
    status: isConfigured ? "connected" : "not_configured",
    details: { provider: "cloudinary", configured: isConfigured },
  };
}

/**
 * Inspect Email / SMTP service configuration
 */
export function checkEmailHealth(): ServiceHealth {
  const isConfigured = Boolean(env.SMTP_USER && env.SMTP_PASS && env.SMTP_HOST);
  return {
    status: isConfigured ? "connected" : "not_configured",
    details: { provider: "smtp", host: env.SMTP_HOST, configured: isConfigured },
  };
}

/**
 * Check if the core database is ready for transactions
 */
export function isDatabaseReady(): boolean {
  return mongoose.connection.readyState === 1;
}

/**
 * Aggregate all health checks into a comprehensive diagnostics report
 */
export async function getFullHealthStatus(): Promise<HealthCheckResult> {
  const uptimeSeconds = Math.floor(process.uptime());
  const memUsage = process.memoryUsage();

  const [dbHealth, mediaHealth] = await Promise.all([
    checkDatabaseHealth(),
    checkMediaGatewayHealth(),
  ]);

  const storageHealth = checkStorageHealth();
  const emailHealth = checkEmailHealth();

  // Critical dependency: MongoDB
  const isDbHealthy = dbHealth.status === "connected";
  const isDegraded = isDbHealthy && (mediaHealth.status === "unreachable" || mediaHealth.status === "degraded");

  const overallStatus = !isDbHealthy ? "unhealthy" : isDegraded ? "degraded" : "healthy";
  const statusCode = isDbHealthy ? 200 : 503;

  return {
    status: overallStatus,
    success: isDbHealthy,
    statusCode,
    message: isDbHealthy
      ? isDegraded
        ? "CCTV Monitoring API is operational (streaming gateway degraded or offline)"
        : "CCTV Monitoring API is healthy"
      : "Critical service failure: Database disconnected",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    uptime: {
      seconds: uptimeSeconds,
      formatted: formatUptime(uptimeSeconds),
    },
    services: {
      database: dbHealth,
      mediaGateway: mediaHealth,
      storage: storageHealth,
      email: emailHealth,
    },
    system: {
      memory: {
        rssMb: Math.round(memUsage.rss / 1024 / 1024),
        heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024),
        systemFreeMb: Math.round(os.freemem() / 1024 / 1024),
        systemTotalMb: Math.round(os.totalmem() / 1024 / 1024),
      },
      process: {
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
      },
    },
  };
}
