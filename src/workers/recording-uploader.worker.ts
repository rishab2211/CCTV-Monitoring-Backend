/**
 * @file recording-uploader.worker.ts
 * @description Decoupled production-grade background ingestion sweeper for MediaMTX video recordings.
 * Monitors local spool directory for completed fMP4 segments, probes accurate video metadata via ffprobe,
 * archives segments to Cloudflare R2 / AWS S3 or persistent local storage, records MongoDB metadata,
 * and handles resilient retry backoff.
 */
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import util from "util";
import { Camera, CameraDocument } from "../models/Camera";
import { createRecordingChunk } from "../services/recording.service";
import { uploadRecordingSegment, isStorageConfigured } from "../config/storage";
import { getCameraPathAliases } from "../config/mediamtx.service";
import { logger } from "../utils/logger";

const execFileAsync = util.promisify(execFile);

// ─── Locate Spool Directories ────────────────────────────────────────────────
export const getSpoolDirectories = (): string[] => {
  const dirs = [
    "/app/recordings",
    path.resolve(process.cwd(), "recordings"),
    "/recordings",
  ];
  return Array.from(new Set(dirs)).filter((d) => fs.existsSync(d));
};

export const resolveSpoolDirectory = (): string => {
  const dirs = getSpoolDirectories();
  if (dirs.length > 0) return dirs[0];
  const defaultDir = path.resolve(process.cwd(), "recordings");
  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true });
  }
  return defaultDir;
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

// ─── Video Metadata Probing via ffprobe ────────────────────────────────────────
export interface ProbeMetadata {
  durationSeconds: number;
  width?: number;
  height?: number;
  codec?: string;
}

export const probeVideoMetadata = async (filePath: string): Promise<ProbeMetadata | null> => {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_name,width,height",
        "-of",
        "json",
        filePath,
      ],
      { timeout: 5000 }
    );

    const info = JSON.parse(stdout);
    const duration = parseFloat(info?.format?.duration);
    const videoStream = info?.streams?.find((s: any) => s.codec_name && s.width);

    return {
      durationSeconds: !isNaN(duration) && duration > 0 ? Math.round(duration * 100) / 100 : 120,
      width: videoStream?.width,
      height: videoStream?.height,
      codec: videoStream?.codec_name,
    };
  } catch (err) {
    logger.debug(`[RecordingSweeper] ffprobe probe fallback for ${filePath}: ${(err as Error).message}`);
    return null;
  }
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

  // 2. Direct _id match if slug is an ObjectId
  if (/^[0-9a-fA-F]{24}$/.test(cleanSlug)) {
    camera = await Camera.findOne({ _id: cleanSlug, isDeleted: false });
    if (camera) return camera;
  }

  // 3. Fallback: match by MediaMTX path aliases, RTSP URL, serial slug, or camera name
  const allCameras = await Camera.find({ isDeleted: false });
  for (const cam of allCameras) {
    const aliases = getCameraPathAliases(cam).map((a) => a.toLowerCase());
    if (aliases.includes(rawSlug.toLowerCase()) || aliases.includes(cleanSlug)) {
      return cam;
    }

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

    const camSlug = cam.serialNumber.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    const nameSlug = cam.name.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    const camSlugClean = cam.serialNumber.toLowerCase().replace(/[^a-z0-9]/g, "");
    const nameSlugClean = cam.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const rawClean = rawSlug.toLowerCase().replace(/[^a-z0-9]/g, "");
    const cleanClean = cleanSlug.replace(/[^a-z0-9]/g, "");

    if (
      camSlugClean === cleanClean ||
      camSlugClean === rawClean ||
      nameSlugClean === cleanClean ||
      nameSlugClean === rawClean
    ) {
      return cam;
    }
  }

  const available = allCameras.map((c) => `'${c.name}' (serial: ${c.serialNumber}, id: ${c._id})`).join(", ");
  logger.warn(
    `[RecordingSweeper] No camera matched stream slug '${rawSlug}' (cleaned: '${cleanSlug}'). Registered cameras in DB: [${available || "none"}]`
  );

  return null;
};

// ─── Recursive File Scanner ───────────────────────────────────────────────────
// Excludes persistent 'archived' subdirectories from spool sweep
const getSegmentFiles = (dir: string): string[] => {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  try {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      // Don't recurse into archived directories
      if (file === "archived") continue;

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

// ─── Upload Retry & Backoff Tracker ───────────────────────────────────────────
interface RetryState {
  attempts: number;
  lastAttempt: number;
}
const retryTracker = new Map<string, RetryState>();

// ─── Single File Processor ────────────────────────────────────────────────────
export const processSingleSegment = async (filePath: string): Promise<boolean> => {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stats = fs.statSync(filePath);

    // If file was modified in the last 4 seconds, MediaMTX is likely still actively writing.
    if (Date.now() - stats.mtimeMs < 4000) {
      return false;
    }

    // Check retry backoff (exponential backoff up to 2 minutes)
    const retryInfo = retryTracker.get(filePath);
    if (retryInfo) {
      const waitTimeMs = Math.min(120000, 2000 * Math.pow(2, retryInfo.attempts - 1));
      if (Date.now() - retryInfo.lastAttempt < waitTimeMs) {
        return false;
      }
    }

    // Discard zero-byte or corrupted fragments older than 60 seconds
    if (stats.size < 1024) {
      if (Date.now() - stats.mtimeMs > 60000) {
        logger.debug(`[RecordingSweeper] Purging empty fragment: ${filePath}`);
        try { fs.unlinkSync(filePath); } catch {}
        retryTracker.delete(filePath);
      }
      return false;
    }

    const fileName = path.basename(filePath);
    const parentDir = path.dirname(filePath);
    const streamSlug = path.basename(parentDir);

    const startTime = parseSegmentTimestamp(fileName) || new Date(stats.mtimeMs - 120000);

    // ── Extract Accurate Metadata via ffprobe ──────────────────────────────────
    const probe = await probeVideoMetadata(filePath);
    const durationSeconds = probe?.durationSeconds || 120;
    const resolution = probe?.width && probe?.height ? `${probe.width}x${probe.height}` : undefined;
    const videoCodec = probe?.codec;
    const endTime = new Date(startTime.getTime() + Math.round(durationSeconds * 1000));

    const camera = await resolveCameraFromSlug(streamSlug);
    if (!camera) {
      if (Date.now() - stats.mtimeMs > 15 * 60 * 1000) {
        logger.warn(`[RecordingSweeper] Purging unmapped orphan segment older than 15m: ${filePath}`);
        try { fs.unlinkSync(filePath); } catch {}
        retryTracker.delete(filePath);
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
    let localPath: string | undefined = undefined;

    // ── Dual Storage Strategy ──────────────────────────────────────────────────
    if (isStorageConfigured()) {
      try {
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

        // Unlink local spool file only after successful cloud upload
        fs.unlinkSync(filePath);
        retryTracker.delete(filePath);
      } catch (uploadErr) {
        // Track retry attempt and keep local file intact for next pass
        const prev = retryTracker.get(filePath) || { attempts: 0, lastAttempt: 0 };
        retryTracker.set(filePath, { attempts: prev.attempts + 1, lastAttempt: Date.now() });
        logger.warn(
          `[RecordingSweeper] Upload failed for ${filePath} (attempt ${prev.attempts + 1}): ${(uploadErr as Error).message}`
        );
        return false;
      }
    } else {
      // ── Local Archiving Mode ───────────────────────────────────────────────
      // When Object Storage is not configured, preserve footage in local persistent archive
      const spoolDir = resolveSpoolDirectory();
      const archiveDir = path.resolve(spoolDir, "archived", franchiseId, cameraId, String(yyyy), mm, dd);
      fs.mkdirSync(archiveDir, { recursive: true });
      localPath = path.join(archiveDir, fileName);

      try {
        fs.renameSync(filePath, localPath);
      } catch {
        fs.copyFileSync(filePath, localPath);
        try { fs.unlinkSync(filePath); } catch {}
      }
      retryTracker.delete(filePath);
    }

    // ── Ingest Metadata into MongoDB ──────────────────────────────────────────
    const chunk = await createRecordingChunk({
      cameraId: camera._id,
      franchiseId: camera.franchiseId,
      startTime,
      endTime,
      type: "continuous",
      status: "completed",
      url: localPath ? "" : publicUrl, // Updated below with chunk ID for local streaming
      s3Key: isStorageConfigured() ? s3Key : undefined,
      localPath,
      resolution,
      videoCodec,
      sizeBytes: stats.size,
      durationSeconds,
      expiresAt,
    });

    if (localPath && chunk?._id) {
      chunk.url = `/api/v1/recordings/${chunk._id}/stream`;
      await chunk.save();
    }

    logger.info(
      `✅ [RecordingSweeper] Segment processed & archived: ${camera.name} -> ${
        localPath ? `local:${localPath}` : s3Key
      } (${(stats.size / 1024 / 1024).toFixed(2)} MB, ${durationSeconds.toFixed(1)}s)`
    );
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
    const spoolDirs = getSpoolDirectories();
    const files: string[] = [];
    for (const dir of spoolDirs) {
      files.push(...getSegmentFiles(dir));
    }

    if (files.length > 0) {
      logger.debug(
        `[RecordingSweeper] Found ${files.length} segment file(s) across spool directories: ${spoolDirs.join(", ")}`
      );
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
