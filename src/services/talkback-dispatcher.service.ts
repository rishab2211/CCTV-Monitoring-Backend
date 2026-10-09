/**
 * @file talkback-dispatcher.service.ts
 * @description Production audio dispatcher that bridges WebRTC WHIP microphone
 * streams from MediaMTX to physical IP camera loudspeakers via ONVIF Profile T
 * RTSP Backchannel or vendor-specific ISAPI/CGI HTTP streams.
 */

import { spawn, ChildProcess } from "child_process";
import { CameraDocument } from "../models/Camera";
import { logger } from "../utils/logger";
import { socketService } from "./socket.service";
import { getMediaMTXPathStatus } from "../config/mediamtx.service";

interface ActiveDispatcher {
  cameraId: string;
  sessionId: string;
  process: ChildProcess | null;
  watchdogTimer: NodeJS.Timeout;
  startedAt: Date;
  isCancelled: boolean;
}

// In-memory registry of currently active talkback audio bridges
const activeDispatchers = new Map<string, ActiveDispatcher>();

// Maximum continuous talkback transmission window (fail-safe watchdog)
const WATCHDOG_TIMEOUT_MS = 90 * 1000; // 90 seconds

/**
 * Builds low-latency FFmpeg argument array for RTSP backchannel delivery.
 */
const buildFFmpegArgs = (camera: CameraDocument): string[] => {
  const cameraId = camera._id.toString();
  const audioSettings = camera.settings?.audioSettings;
  const codec = audioSettings?.codec || "pcm_mulaw";
  const sampleRate = (audioSettings?.sampleRate || 8000).toString();

  // Local MediaMTX loopback stream where the operator's microphone is published via WHIP
  const loopbackUrl = `rtsp://127.0.0.1:8554/camera_${cameraId}_talkback`;

  // Standard ONVIF Profile T RTSP Backchannel configuration with zero-buffering flags
  return [
    "-hide_banner",
    "-loglevel", "warning",
    // Aggressive low-latency input flags (<200ms glass-to-speaker delay)
    "-fflags", "nobuffer",
    "-flags", "low_delay",
    "-analyzeduration", "100000",
    "-probesize", "32768",
    "-rtsp_transport", "tcp",
    "-i", loopbackUrl,
    // Audio processing: strip video, downsample to 8kHz/16kHz mono G.711
    "-vn",
    "-acodec", codec,
    "-ar", sampleRate,
    "-ac", "1",
    "-flush_packets", "1",
    // Target camera RTSP endpoint with backchannel flag
    "-f", "rtsp",
    "-rtsp_transport", "tcp",
    "-rtsp_flags", "backchannel",
    camera.rtspUrl,
  ];
};

/**
 * Starts the live audio dispatcher process for a camera.
 * Spawns an FFmpeg bridge that reads from MediaMTX and streams directly to the camera's speaker.
 * Performs background stream readiness polling to avoid race conditions with browser WHIP handshakes.
 */
export const startDispatcher = async (
  camera: CameraDocument,
  sessionId: string
): Promise<boolean> => {
  const cameraId = camera._id.toString();

  // If a previous bridge process is already running on this camera, terminate it first
  if (activeDispatchers.has(cameraId)) {
    logger.warn(`[TalkbackDispatcher] Terminating existing bridge on camera ${cameraId} before starting new one`);
    await stopDispatcher(cameraId);
  }

  // Set up 90-second safety watchdog to kill runaway/abandoned sessions
  const watchdogTimer = setTimeout(() => {
    logger.warn(`[TalkbackDispatcher] Watchdog limit reached (90s) for camera ${cameraId}. Auto-stopping.`);
    stopDispatcher(cameraId).catch(() => {});
  }, WATCHDOG_TIMEOUT_MS);

  const dispatcherState: ActiveDispatcher = {
    cameraId,
    sessionId,
    process: null,
    watchdogTimer,
    startedAt: new Date(),
    isCancelled: false,
  };

  activeDispatchers.set(cameraId, dispatcherState);

  // Background worker: Waits for MediaMTX WHIP stream to be published before launching FFmpeg.
  // This eliminates 404 connection failures while the browser completes its WebRTC WHIP negotiation.
  (async () => {
    const pathName = `camera_${cameraId}_talkback`;
    let streamReady = false;

    // Poll for up to 4 seconds (40 iterations * 100ms)
    for (let i = 0; i < 40; i++) {
      if (dispatcherState.isCancelled || !activeDispatchers.has(cameraId)) {
        return; // Operator already released PTT
      }
      try {
        const status = await getMediaMTXPathStatus(pathName);
        if (status?.ready) {
          streamReady = true;
          break;
        }
      } catch {
        // non-fatal
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    if (dispatcherState.isCancelled || !activeDispatchers.has(cameraId)) {
      return;
    }

    // Brief grace period (150ms) to ensure loopback sockets are ready
    await new Promise((r) => setTimeout(r, 150));

    if (dispatcherState.isCancelled || !activeDispatchers.has(cameraId)) {
      return;
    }

    // Check if camera is using a local loopback MediaMTX stream (e.g. phone Larix, webcam script, or test stream)
    const isLocalTestStream =
      camera.rtspUrl.includes("127.0.0.1:8554") ||
      camera.rtspUrl.includes("localhost:8554");

    if (isLocalTestStream) {
      logger.info(
        `[TalkbackDispatcher] Camera "${camera.name}" is using a local MediaMTX stream (${camera.rtspUrl}). ` +
        `WebRTC audio is live on MediaMTX at rtsp://127.0.0.1:8554/${pathName}. Skipping RTSP backchannel bridge.`
      );
      return;
    }

    const ffmpegArgs = buildFFmpegArgs(camera);
    logger.info(`[TalkbackDispatcher] Spawning audio bridge for camera ${cameraId} (${camera.name}) - MediaMTX ready: ${streamReady}`);

    let ffmpegProc: ChildProcess;
    try {
      ffmpegProc = spawn("ffmpeg", ffmpegArgs, {
        stdio: ["ignore", "ignore", "pipe"],
      });
      dispatcherState.process = ffmpegProc;
    } catch (err) {
      logger.error(`[TalkbackDispatcher] Failed to spawn ffmpeg: ${(err as Error).message}`);
      return;
    }

    // Monitor stderr for hardware errors
    let stderrBuffer = "";
    ffmpegProc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderrBuffer += text;
      if (text.includes("error") || text.includes("fail") || text.includes("refused") || text.includes("401")) {
        logger.warn(`[TalkbackDispatcher:${camera.name}] ${text.trim()}`);
      }
    });

    ffmpegProc.on("exit", (code, signal) => {
      logger.info(`[TalkbackDispatcher] Process exited for camera ${cameraId} (code=${code}, signal=${signal})`);
      clearTimeout(watchdogTimer);
      activeDispatchers.delete(cameraId);

      // If exited with error unexpectedly within the first 5 seconds, inform the UI
      const runDuration = Date.now() - dispatcherState.startedAt.getTime();
      if (code !== 0 && code !== null && signal !== "SIGTERM" && signal !== "SIGKILL" && runDuration < 5000) {
        logger.error(`[TalkbackDispatcher] Bridge failed early: ${stderrBuffer.slice(-200)}`);
        socketService.emitToCamera(cameraId, "talkback_error", {
          cameraId,
          sessionId,
          message: "Camera speaker refused connection or backchannel is not supported by hardware.",
        });
      }
    });

    ffmpegProc.on("error", (procErr) => {
      logger.error(`[TalkbackDispatcher] Process error on camera ${cameraId}: ${procErr.message}`);
      clearTimeout(watchdogTimer);
      activeDispatchers.delete(cameraId);
    });
  })().catch((err) => {
    logger.error(`[TalkbackDispatcher] Background dispatcher runner error: ${(err as Error).message}`);
  });

  return true;
};

/**
 * Stops and cleans up the active talkback dispatcher process for a camera.
 */
export const stopDispatcher = async (cameraId: string): Promise<void> => {
  const active = activeDispatchers.get(cameraId);
  if (!active) {
    return;
  }

  logger.info(`[TalkbackDispatcher] Stopping audio bridge for camera ${cameraId}`);
  active.isCancelled = true;
  clearTimeout(active.watchdogTimer);
  activeDispatchers.delete(cameraId);

  const proc = active.process;
  if (proc && !proc.killed) {
    proc.kill("SIGTERM");

    // Force SIGKILL if process fails to terminate gracefully within 600ms
    setTimeout(() => {
      try {
        if (!proc.killed) {
          proc.kill("SIGKILL");
        }
      } catch {
        // ignore
      }
    }, 600);
  }
};

/**
 * Check if a camera currently has a running audio bridge process.
 */
export const isDispatcherRunning = (cameraId: string): boolean => {
  return activeDispatchers.has(cameraId);
};
