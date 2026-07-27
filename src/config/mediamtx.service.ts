/**
 * MediaMTX v3 API Service
 *
 * A typed wrapper around the MediaMTX REST API.
 * All functions are gracefully non-fatal — they log warnings but do not crash
 * the server if MediaMTX is unreachable (common in dev without a running instance).
 *
 * MediaMTX API docs: https://github.com/bluenviron/mediamtx/blob/main/apidocs/openapi.yaml
 */

import { env } from "./env";
import { logger } from "../utils/logger";
import {
  IMediaMTXPathConfig,
  IMediaMTXPath,
  IMediaMTXPathListResponse,
} from "../types";

const BASE_URL = env.MEDIAMTX_API_URL; // default: http://localhost:9997/v3

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

const mediamtxFetch = async <T>(
  method: "GET" | "POST" | "DELETE" | "PATCH",
  path: string,
  body?: unknown
): Promise<T | null> => {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(env.MEDIAMTX_STREAM_SECRET
          ? { Authorization: `Bearer ${env.MEDIAMTX_STREAM_SECRET}` }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5000), // 5-second timeout
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (text.includes("path already exists")) {
        logger.debug(`[MediaMTX] Path '${path}' already exists. Updating via PATCH...`);
      } else {
        logger.warn(`[MediaMTX] ${method} ${path} → ${res.status}: ${text}`);
      }
      return null;
    }

    // DELETE returns no body
    if (method === "DELETE" || res.status === 204) return null;

    return (await res.json()) as T;
  } catch (err) {
    // MediaMTX is not running — non-fatal, just log
    logger.warn(`[MediaMTX] Unreachable — ${method} ${path}: ${(err as Error).message}`);
    return null;
  }
};

// ─── API Functions ────────────────────────────────────────────────────────────

/**
 * Register a camera RTSP stream path in MediaMTX.
 * Uses `sourceOnDemand: true` so MediaMTX only pulls RTSP when someone is watching.
 */
export const addMediaMTXPath = async (
  pathName: string,
  rtspUrl: string
): Promise<boolean> => {
  const config: IMediaMTXPathConfig = {
    source: rtspUrl,
    sourceProtocol: "tcp",
    sourceOnDemand: true,
    maxReaders: 20,
  };

  const result = await mediamtxFetch("POST", `/config/paths/add/${pathName}`, config);
  if (result === null) {
    // If path already exists, patch it to ensure the source RTSP URL is updated
    await mediamtxFetch("PATCH", `/config/paths/patch/${pathName}`, config);
  }
  logger.debug(`[MediaMTX] Path registered/updated: ${pathName}`);
  return true;
};

/**
 * Remove a camera stream path from MediaMTX.
 */
export const removeMediaMTXPath = async (pathName: string): Promise<void> => {
  await mediamtxFetch("DELETE", `/config/paths/remove/${pathName}`);
  logger.debug(`[MediaMTX] Path removed: ${pathName}`);
};

/**
 * Get live status of a specific path.
 * Returns null if the path is not found or MediaMTX is unreachable.
 */
export const getMediaMTXPathStatus = async (
  pathName: string
): Promise<IMediaMTXPath | null> => {
  return mediamtxFetch<IMediaMTXPath>("GET", `/paths/get/${pathName}`);
};

/**
 * List all currently active (ready) paths in MediaMTX.
 */
export const listMediaMTXPaths = async (): Promise<IMediaMTXPath[]> => {
  const res = await mediamtxFetch<IMediaMTXPathListResponse>("GET", "/paths/list");
  return res?.items ?? [];
};

/**
 * Derives the MediaMTX path name from a camera's serial number.
 * Converts to lowercase slug: "CAM-FG-1004" → "cam-fg-1004"
 */
export const toPathName = (serialNumber: string): string =>
  serialNumber.toLowerCase().replace(/[^a-z0-9-]/g, "-");

/**
 * Startup sync — registers all non-deleted cameras as MediaMTX paths.
 * Called once after DB connect. Gracefully skips if MediaMTX is not running.
 */
export const syncMediaMTXPaths = async (): Promise<void> => {
  try {
    // Import here to avoid circular deps at module load time
    const { Camera } = await import("../models/Camera");

    const cameras = await Camera.find({ isDeleted: false }).select(
      "serialNumber rtspUrl"
    );

    logger.info(`📡 MediaMTX sync: registering ${cameras.length} camera paths...`);

    let registered = 0;
    for (const cam of cameras) {
      const pathName = toPathName(cam.serialNumber);
      const success = await addMediaMTXPath(pathName, cam.rtspUrl);
      if (success) registered++;
    }

    logger.info(`📡 MediaMTX sync complete — ${registered}/${cameras.length} paths registered`);
  } catch (err) {
    // Non-fatal — server continues even if sync fails
    logger.warn(`[MediaMTX] Startup sync failed (non-fatal): ${(err as Error).message}`);
  }
};
