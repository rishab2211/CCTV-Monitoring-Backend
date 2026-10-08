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
  const isLocalSource = rtspUrl.includes("localhost") || rtspUrl.includes("127.0.0.1");
  const config: IMediaMTXPathConfig = {
    source: rtspUrl,
    sourceProtocol: "tcp",
    sourceOnDemand: !isLocalSource, // Keep local demo feeds pre-warmed for 0s lag
    maxReaders: 50,
  };

  const result = await mediamtxFetch("POST", `/config/paths/add/${pathName}`, config);
  if (result === null) {
    // If path already exists, patch it to ensure the source RTSP URL is updated
    await mediamtxFetch("PATCH", `/config/paths/patch/${pathName}`, config);
  }
  logger.debug(`[MediaMTX] Path registered/updated: ${pathName} (prewarmed: ${isLocalSource})`);
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
  serialNumber.toLowerCase().replace(/[^a-z0-9_-]/g, "-");

/**
 * Determines if a camera stream is directly published into MediaMTX
 * (e.g. Larix Broadcaster, OBS, webcam scripts publishing to port 8554)
 * vs an external camera RTSP source that MediaMTX must pull from.
 */
export const isDirectPublishStream = (camera: { rtspUrl?: string }): boolean => {
  if (!camera.rtspUrl) return true;
  try {
    const parsed = new URL(camera.rtspUrl);
    // Port 8554 is MediaMTX's RTSP ingestion port
    if (parsed.port === "8554") return true;
  } catch {
    // Dynamic match for any host/IP on port 8554
    if (/^rtsp:\/\/(?:\[[^\]]+\]|[^/:]+):8554\//i.test(camera.rtspUrl)) return true;
  }
  return false;
};

/**
 * Resolves the MediaMTX stream path for a camera dynamically.
 * If the camera rtspUrl points to a MediaMTX port (8554), extracts and uses that path
 * directly without any hardcoded IP addresses.
 * Otherwise, falls back to the normalized camera serial number.
 */
export const getCameraStreamPath = (camera: { serialNumber: string; rtspUrl?: string }): string => {
  if (camera.rtspUrl) {
    try {
      const parsed = new URL(camera.rtspUrl);
      if (parsed.port === "8554") {
        const pathPart = parsed.pathname.replace(/^\/+/, "").split("/")[0]?.trim();
        if (pathPart) return pathPart;
      }
    } catch {
      // Dynamic fallback regex matching any hostname, IPv4, or IPv6 on port 8554
      const match = camera.rtspUrl.match(/^rtsp:\/\/(?:\[[^\]]+\]|[^/:]+):8554\/([a-zA-Z0-9_.-]+)/i);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  }
  return toPathName(camera.serialNumber);
};

/**
 * Startup sync — registers external camera RTSP pull paths in MediaMTX.
 * Direct publisher cameras (e.g. Larix, OBS) are skipped since MediaMTX
 * accepts them on-demand via `source: publisher`.
 */
export const syncMediaMTXPaths = async (): Promise<void> => {
  try {
    const { Camera } = await import("../models/Camera");

    const cameras = await Camera.find({ isDeleted: false }).select(
      "serialNumber rtspUrl"
    );

    logger.info(`📡 MediaMTX sync: inspecting ${cameras.length} camera paths...`);

    let registered = 0;
    for (const cam of cameras) {
      if (isDirectPublishStream(cam)) {
        continue;
      }
      const pathName = getCameraStreamPath(cam);
      if (cam.rtspUrl) {
        const success = await addMediaMTXPath(pathName, cam.rtspUrl);
        if (success) registered++;
      }
    }

    logger.info(`📡 MediaMTX sync complete — ${registered} external pull path(s) registered`);
  } catch (err) {
    // Non-fatal — server continues even if sync fails
    logger.warn(`[MediaMTX] Startup sync failed (non-fatal): ${(err as Error).message}`);
  }
};
