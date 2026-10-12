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

export const mediamtxFetch = async <T>(
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

import { getPublicBaseUrl } from "../utils/url";

// ─── API Functions ────────────────────────────────────────────────────────────

/**
 * Register a camera RTSP stream path in MediaMTX.
 * Also provisions the raw ingestion path (raw_<name>) so MediaMTX's dynamic
 * transcode pipeline auto-generates live_<name> with Opus audio for WebRTC.
 */
export const addMediaMTXPath = async (
  pathName: string,
  rtspUrl: string
): Promise<boolean> => {
  const isLocalSource = rtspUrl.includes("localhost") || rtspUrl.includes("127.0.0.1");
  const baseSlug = pathName.replace(/^(raw_|live_)/, "").replace(/(_raw|_live)$/, "");
  const rawPath = `raw_${baseSlug}`;

  const config: IMediaMTXPathConfig = {
    source: rtspUrl,
    sourceProtocol: "tcp",
    sourceOnDemand: !isLocalSource, // Keep local demo feeds pre-warmed for 0s lag
    maxReaders: 50,
  };

  // 1. Register raw path so regex auto-transcodes to live_<slug> with Opus audio
  await mediamtxFetch("POST", `/config/paths/add/${rawPath}`, config).then(async (res) => {
    if (res === null) {
      await mediamtxFetch("PATCH", `/config/paths/patch/${rawPath}`, config);
    }
  });

  // 2. Also register direct pathName for backwards compatibility
  const result = await mediamtxFetch("POST", `/config/paths/add/${pathName}`, config);
  if (result === null) {
    // If path already exists, patch it to ensure the source RTSP URL is updated
    await mediamtxFetch("PATCH", `/config/paths/patch/${pathName}`, config);
  }
  logger.debug(`[MediaMTX] Path registered/updated: ${pathName} and ${rawPath} (prewarmed: ${isLocalSource})`);
  return true;
};

/**
 * Remove a camera stream path from MediaMTX.
 */
export const removeMediaMTXPath = async (pathName: string): Promise<void> => {
  const baseSlug = pathName.replace(/^(raw_|live_)/, "").replace(/(_raw|_live)$/, "");
  await Promise.all([
    mediamtxFetch("DELETE", `/config/paths/remove/${pathName}`),
    mediamtxFetch("DELETE", `/config/paths/remove/raw_${baseSlug}`),
  ]);
  logger.debug(`[MediaMTX] Path removed: ${pathName}`);
};

/**
 * Registers an ephemeral WHIP publisher talkback path in MediaMTX.
 * source: "publisher" means MediaMTX waits for the browser to publish WebRTC audio via WHIP
 * rather than pulling from an external RTSP source.
 * Called by talkback.service when a session starts.
 */
export const addMediaMTXTalkbackPath = async (pathName: string): Promise<boolean> => {
  // If path matches the mediamtx.yml regex template (~^camera_[a-z0-9]+_talkback$),
  // MediaMTX automatically handles it as a dynamic publisher without needing API addition.
  // Adding it via API causes MediaMTX to trigger dynamic config reload which drops port 8889 sockets.
  if (/^camera_[a-z0-9]+_talkback$/i.test(pathName)) {
    return true;
  }

  const config = {
    source: "publisher",
    maxReaders: 10,
  };
  const result = await mediamtxFetch("POST", `/config/paths/add/${pathName}`, config);
  if (result === null) {
    // Path may already exist — patch to ensure correct config
    await mediamtxFetch("PATCH", `/config/paths/patch/${pathName}`, config);
  }
  logger.info(`[MediaMTX] Talkback path registered: ${pathName}`);
  return true;
};

/**
 * Removes the ephemeral talkback publisher path from MediaMTX when a session ends.
 * Non-fatal — if the path was matched by the yml regex, removal is a no-op.
 */
export const removeMediaMTXTalkbackPath = async (pathName: string): Promise<void> => {
  if (/^camera_[a-z0-9]+_talkback$/i.test(pathName)) {
    return;
  }
  await mediamtxFetch("DELETE", `/config/paths/remove/${pathName}`);
  logger.info(`[MediaMTX] Talkback path removed: ${pathName}`);
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
 * Maps raw camera ingestion paths to their transcoded Opus WebRTC playback counterparts.
 * Standard patterns:
 *   - raw_<slug>  -> live_<slug>
 *   - <slug>_raw  -> <slug>_live
 *   - raw/<slug>  -> live/<slug>
 *   - phone_cam   -> phone_cam_live
 *   - phone_cam_1 -> phone_cam_1_live
 */
export const toPlaybackPath = (pathName: string): string => {
  if (!pathName) return pathName;
  if (pathName.startsWith("raw_")) {
    return `live_${pathName.slice(4)}`;
  }
  if (pathName.endsWith("_raw")) {
    return `${pathName.slice(0, -4)}_live`;
  }
  if (pathName.startsWith("raw/")) {
    return `live/${pathName.slice(4)}`;
  }
  if (pathName === "phone_cam") {
    return "phone_cam_live";
  }
  if (pathName === "phone_cam_1") {
    return "phone_cam_1_live";
  }
  return pathName;
};

/**
 * Returns the standardized raw ingestion path name for a camera slug.
 * Example: "cam_entrance" -> "raw_cam_entrance"
 */
export const toIngestPath = (nameOrSlug: string): string => {
  const slug = toPathName(nameOrSlug);
  if (slug.startsWith("raw_") || slug.startsWith("raw/")) {
    return slug;
  }
  if (slug.endsWith("_raw")) {
    return slug;
  }
  if (slug.startsWith("live_")) {
    return `raw_${slug.slice(5)}`;
  }
  if (slug.endsWith("_live")) {
    return `${slug.slice(0, -5)}_raw`;
  }
  return `raw_${slug}`;
};

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
    // WebRTC WHIP/WHEP or HLS direct endpoints
    if (parsed.pathname.includes("/webrtc/") || parsed.pathname.includes("/hls/")) return true;
    if (parsed.pathname.endsWith("/whip") || parsed.pathname.endsWith("/whep")) return true;
  } catch {
    // Dynamic match for any host/IP on port 8554 or /webrtc/
    if (/^rtsp:\/\/(?:\[[^\]]+\]|[^/:]+):8554\//i.test(camera.rtspUrl)) return true;
    if (/\/webrtc\/[a-zA-Z0-9_.-]+/i.test(camera.rtspUrl)) return true;
  }
  return false;
};

/**
 * Resolves the MediaMTX stream path for a camera dynamically.
 * If the camera rtspUrl points to a MediaMTX port (8554) or WebRTC WHIP endpoint,
 * extracts and uses that path directly without any hardcoded IP addresses.
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
      // Match /webrtc/<pathName>(/whip|/whep)
      const webrtcMatch = parsed.pathname.match(/\/webrtc\/([a-zA-Z0-9_.-]+)(?:\/whip|\/whep)?/i);
      if (webrtcMatch && webrtcMatch[1]) {
        return webrtcMatch[1].trim();
      }
      // Match /<pathName>/(whip|whep)
      const whipMatch = parsed.pathname.match(/^\/?([a-zA-Z0-9_.-]+)\/(?:whip|whep)$/i);
      if (whipMatch && whipMatch[1]) {
        return whipMatch[1].trim();
      }
    } catch {
      // Dynamic fallback regex matching any hostname, IPv4, or IPv6 on port 8554
      const match = camera.rtspUrl.match(/^rtsp:\/\/(?:\[[^\]]+\]|[^/:]+):8554\/([a-zA-Z0-9_.-]+)/i);
      if (match && match[1]) {
        return match[1].trim();
      }
      const webrtcMatch = camera.rtspUrl.match(/\/webrtc\/([a-zA-Z0-9_.-]+)(?:\/whip|\/whep)?/i);
      if (webrtcMatch && webrtcMatch[1]) {
        return webrtcMatch[1].trim();
      }
    }
  }
  return toPathName(camera.serialNumber);
};

/**
 * Resolves the active playback path for a camera, checking MediaMTX for
 * auto-transcoded live feeds (live_<slug> or <slug>_live) if the base feed was specified.
 * Ensures the client always connects to the Opus audio + H.264 video feed.
 */
export const resolveActiveStreamPath = async (camera: { serialNumber: string; rtspUrl?: string }): Promise<string> => {
  const basePath = getCameraStreamPath(camera);

  // If basePath is already a live playback path, return it directly
  if (basePath.startsWith("live_") || basePath.endsWith("_live") || basePath.startsWith("live/")) {
    return basePath;
  }

  const playbackCandidate = toPlaybackPath(basePath);

  // If already mapped by prefix/suffix rule (e.g. raw_cam -> live_cam), return immediately
  if (playbackCandidate !== basePath) {
    return playbackCandidate;
  }

  // If basePath is not prefixed (e.g. "cam-01" or "entrance"), check if a transcoded live stream exists in MediaMTX
  try {
    const livePrefix = `live_${basePath}`;
    const prefixStatus = await getMediaMTXPathStatus(livePrefix);
    if (prefixStatus?.ready) {
      return livePrefix;
    }

    const liveSuffix = `${basePath}_live`;
    const suffixStatus = await getMediaMTXPathStatus(liveSuffix);
    if (suffixStatus?.ready) {
      return liveSuffix;
    }
  } catch {
    // Non-fatal — MediaMTX unreachable
  }

  return basePath;
};

/**
 * Returns standardized ingestion and playback endpoints for any camera.
 * Used during camera onboarding so technicians and operators know exactly where
 * to publish the feed and where it is monitored.
 */
export const getStandardizedCameraEndpoints = (camera: { serialNumber: string; rtspUrl?: string }) => {
  const slug = toPathName(camera.serialNumber);
  const ingestPath = toIngestPath(slug);
  const playbackPath = toPlaybackPath(ingestPath);
  const baseUrl = getPublicBaseUrl();

  let publicDomain = "localhost";
  try {
    const parsed = new URL(baseUrl);
    publicDomain = parsed.hostname;
  } catch {
    publicDomain = env.MEDIAMTX_URL.replace(/^https?:\/\//, "").split(":")[0] || "localhost";
  }

  return {
    slug,
    ingestPath,
    playbackPath,
    ingestRtspUrl: `rtsp://${publicDomain}:8554/${ingestPath}`,
    playbackRtspUrl: `rtsp://localhost:8554/${playbackPath}`,
    webrtcUrl: `${baseUrl}/webrtc/${playbackPath}`,
    whepUrl: `${baseUrl}/webrtc/${playbackPath}/whep`,
    hlsUrl: `${baseUrl}/hls/${playbackPath}/index.m3u8`,
  };
};

/**
 * Returns all potential MediaMTX path aliases for a camera (raw, live, base slug).
 * Ensures camera online state reconciliation catches both raw ingests and live transcode feeds.
 */
export const getCameraPathAliases = (camera: { serialNumber: string; rtspUrl?: string }): string[] => {
  const primaryPath = getCameraStreamPath(camera).toLowerCase();
  const serialPath = toPathName(camera.serialNumber).toLowerCase();
  const baseSlug = primaryPath.replace(/^(raw_|live_)/, "").replace(/(_raw|_live)$/, "");

  const aliases = new Set<string>([
    primaryPath,
    serialPath,
    baseSlug,
    toPlaybackPath(primaryPath).toLowerCase(),
    toPlaybackPath(serialPath).toLowerCase(),
    `raw_${baseSlug}`,
    `live_${baseSlug}`,
    `${baseSlug}_raw`,
    `${baseSlug}_live`,
  ]);

  return Array.from(aliases);
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
