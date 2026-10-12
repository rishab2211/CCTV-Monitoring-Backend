/**
 * @file recording-uploader.worker.ts
 * @description Decoupled background ingestion sweeper for MediaMTX video recordings.
 * Monitors local spool directory for completed fMP4 segments, uploads them to Cloudflare R2,
 * logs metadata to MongoDB, and removes local spool files.
 */
import fs from "fs";
import path from "path";
import { Camera, CameraDocument } from "../models/Camera";
import { createRecordingChunk } from "../services/recording.service";
import { uploadRecordingSegment, isStorageConfigured } from "../config/storage";
import { getCameraPathAliases } from "../config/mediamtx.service";
import { logger } from "../utils/logger";

// ─── Locate Spool Directory ───────────────────────────────────────────────────
export const resolveSpoolDirectory = (): string => {
  const containerDir = "/app/recordings";
  const localDir = path.resolve(process.cwd(), "recordings");

  if (fs.existsSync(containerDir)) {
    return containerDir;
  }
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  return localDir;
};

// ─── Parse Segment Filename Timestamps ─────────────────────────────────────────
// Expected MediaMTX format: YYYY-MM-DD_HH-mm-ss.mp4
export const parseSegmentTimestamp = (fileName: string): Date | null => {
  const base = path.basename(fileName, path.extname(fileName));
  const match = base.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day, hours, minutes, seconds] = match;
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds)
    )
  );
};

// ─── Resolve Camera from Stream Path Slug ─────────────────────────────────────
export const resolveCameraFromSlug = async (rawSlug: string): Promise<CameraDocument | null> => {
  // Strip MediaMTX ingest prefixes/suffixes: raw_cam-01 -> cam-01, cam-01_raw -> cam-01
  const cleanSlug = rawSlug
    .replace(/^(raw_|live_|raw\/|live\/)/i, "")
    .replace(/(_raw|_live)$/i, "")
    .trim()
    .toLowerCase();

  // 1. Direct serialNumber match (case-insensitive)
  let camera = await Camera.findOne({
    serialNumber: { $regex: new RegExp(`^${cleanSlug}$`, "i") },
    isDeleted: false,
  });

  if (camera) return camera;

  // 2. Fallback: match by MediaMTX path aliases, RTSP URL, serial slug, or camera name
  const allCameras = await Camera.find({ isDeleted: false });
  for (const cam of allCameras) {
    // Check MediaMTX path aliases
    const aliases = getCameraPathAliases(cam).map((a) => a.toLowerCase());
    if (aliases.includes(rawSlug.toLowerCase()) || aliases.includes(cleanSlug)) {
      return cam;
    }

    // Check if camera RTSP URL contains stream path or slug
    if (cam.rtspUrl) {
      const rtspLower = cam.rtspUrl.toLowerCase();
      if (
        rtspLower.includes(rawSlug.toLowerCase()) ||
        rtspLower.includes(cleanSlug) ||
        rtspLower.endsWith(`/${cleanSlug}`) ||
        rtspLower.endsWith(`/${rawSlug.toLowerCase()}`)
      ) {
        return cam;
      }
    }

    // Match slugified serialNumber or name
    const camSlug = cam.serialNumber.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    const nameSlug = cam.name.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    if (
      camSlug === cleanSlug ||
      camSlug === rawSlug.toLowerCase() ||
      nameSlug === cleanSlug ||
      nameSlug === rawSlug.toLowerCase()
    ) {
      return cam;
    }
  }

  return null;
};

// ─── Recursive File Scanner ───────────────────────────────────────────────────
const getSegmentFiles = (dir: string): string[] => {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  try {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(getSegmentFiles(fullPath));
      } else if (file.endsWith(".mp4") || file.endsWith(".m4s")) {
        results.push(fullPath);
      }
    }
  } catch (err) {
    logger.warn(`[RecordingSweeper] Directory scan warning for ${dir}: ${(err as Error).message}`);
  }

  return results;
};

// ─── Single File Processor ────────────────────────────────────────────────────
export const processSingleSegment = async (filePath: string): Promise<boolean> => {
  try {
    const stats = fs.statSync(filePath);

    // If file was modified in the last 4 seconds, MediaMTX is likely still flushing bytes.
    if (Date.now() - stats.mtimeMs < 4000) {
      return false;
    }

    // Discard zero-byte or corrupted fragments older than 60 seconds
    if (stats.size < 1024) {
      if (Date.now() - stats.mtimeMs > 60000) {
        logger.debug(`[RecordingSweeper] Purging empty fragment: ${filePath}`);
        fs.unlinkSync(filePath);
      }
      return false;
    }

    const fileName = path.basename(filePath);
    const parentDir = path.dirname(filePath);
    const streamSlug = path.basename(parentDir);

    const startTime = parseSegmentTimestamp(fileName) || new Date(stats.mtimeMs - 120000);
    const durationSeconds = 120; // Default MediaMTX segment length
    const endTime = new Date(startTime.getTime() + durationSeconds * 1000);

    const camera = await resolveCameraFromSlug(streamSlug);
    if (!camera) {
      if (Date.now() - stats.mtimeMs > 15 * 60 * 1000) {
        logger.warn(`[RecordingSweeper] Purging unmapped orphan segment older than 15m: ${filePath}`);
        try { fs.unlinkSync(filePath); } catch {}
        return false;
      }
      logger.warn(`[RecordingSweeper] Camera not found for stream slug '${streamSlug}' (file: ${fileName}). Will retry.`);
      return false;
    }

    const retentionDays = camera.settings?.recordingRetentionDays || 30;
    const expiresAt = new Date(startTime.getTime() + retentionDays * 24 * 60 * 60 * 1000);

    const yyyy = startTime.getUTCFullYear();
    const mm = String(startTime.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(startTime.getUTCDate()).padStart(2, "0");
    const franchiseId = camera.franchiseId ? camera.franchiseId.toString() : "global";
    const cameraId = camera._id.toString();

    const s3Key = `recordings/${franchiseId}/${cameraId}/${yyyy}/${mm}/${dd}/${fileName}`;

    let publicUrl = s3Key;

    if (isStorageConfigured()) {
      const fileBuffer = fs.readFileSync(filePath);
      const uploadRes = await uploadRecordingSegment({
        s3Key,
        body: fileBuffer,
        sizeBytes: stats.size,
        contentType: "video/mp4",
        metadata: {
          cameraId,
          franchiseId,
          duration: String(durationSeconds),
          type: "continuous",
        },
      });
      publicUrl = uploadRes.publicUrl;
    } else {
      logger.debug(`[RecordingSweeper] Storage credentials not set; logging segment metadata locally for key: ${s3Key}`);
    }

    // ── Ingest Metadata into MongoDB ──────────────────────────────────────────
    await createRecordingChunk({
      cameraId: camera._id,
      franchiseId: camera.franchiseId,
      startTime,
      endTime,
      type: "continuous",
      status: "completed",
      url: publicUrl,
      s3Key,
      sizeBytes: stats.size,
      durationSeconds,
      expiresAt,
    });

    // ── Unlink Local Spool File ───────────────────────────────────────────────
    fs.unlinkSync(filePath);
    logger.info(`✅ [RecordingSweeper] Segment processed & archived: ${camera.name} -> ${s3Key} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    return true;
  } catch (err) {
    logger.error(`[RecordingSweeper] Error processing segment ${filePath}: ${(err as Error).message}`);
    return false;
  }
};

// ─── Batch Sweeper Routine ────────────────────────────────────────────────────
let isSweeping = false;

export const sweepRecordingSpool = async (): Promise<void> => {
  if (isSweeping) return;
  isSweeping = true;

  try {
    const spoolDir = resolveSpoolDirectory();
    const files = getSegmentFiles(spoolDir);

    if (files.length > 0) {
      logger.debug(`[RecordingSweeper] Found ${files.length} segment file(s) in spool`);
    }

    // Process up to 10 files per sweep tick to prevent event-loop congestion
    const batch = files.slice(0, 10);
    for (const file of batch) {
      await processSingleSegment(file);
    }
  } catch (err) {
    logger.error(`[RecordingSweeper] Sweep error: ${(err as Error).message}`);
  } finally {
    isSweeping = false;
  }
};

// ─── Worker Lifecycle Controller ──────────────────────────────────────────────
let sweeperInterval: ReturnType<typeof setInterval> | null = null;

export const startRecordingSweeper = (intervalMs: number = 10000): void => {
  if (sweeperInterval) return;

  const spoolDir = resolveSpoolDirectory();
  logger.info(`📹 [RecordingSweeper] Initialized. Monitoring spool directory: ${spoolDir} (every ${intervalMs / 1000}s)`);

  sweeperInterval = setInterval(() => {
    sweepRecordingSpool().catch((err) => {
      logger.error(`[RecordingSweeper] Uncaught sweep error: ${(err as Error).message}`);
    });
  }, intervalMs);

  sweeperInterval.unref();
};

export const stopRecordingSweeper = (): void => {
  if (sweeperInterval) {
    clearInterval(sweeperInterval);
    sweeperInterval = null;
    logger.info("🛑 [RecordingSweeper] Sweeper worker stopped");
  }
};
