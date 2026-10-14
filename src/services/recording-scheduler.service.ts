/**
 * @file recording-scheduler.service.ts
 * @description Edge-triggered recording scheduler daemon.
 * Evaluates camera schedule rules against wall-clock time and dynamically toggles
 * MediaMTX recording on state transitions without causing constant socket drops.
 */
import { Camera } from "../models/Camera";
import { RecordingSchedule } from "../models/RecordingSchedule";
import { getCameraStreamPath, mediamtxFetch } from "../config/mediamtx.service";
import { IRecordingScheduleRule } from "../types";
import { logger } from "../utils/logger";

// ─── In-Memory Recording State Cache (prevents redundant API patching) ─────────
const activeRecordingStates = new Map<string, boolean>();

/**
 * Checks whether a given set of schedule rules is currently active.
 * Handles overnight schedules (e.g. 22:00 -> 06:00).
 * Supports both daysOfWeek and days arrays.
 */
export const isScheduleRuleActive = (
  rules: IRecordingScheduleRule[],
  now: Date = new Date()
): boolean => {
  if (!rules || rules.length === 0) {
    // No specific time schedule defined: defaults to 24/7 active if camera recording is enabled
    return true;
  }

  const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
  const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  for (const rule of rules) {
    const days = rule.daysOfWeek || (rule as any).days || [];
    if (!days.includes(currentDay)) {
      continue;
    }

    if (rule.startTime <= rule.endTime) {
      if (currentHHMM >= rule.startTime && currentHHMM <= rule.endTime) {
        return true;
      }
    } else {
      // Overnight rule crossing midnight (e.g. 22:00 to 06:00)
      if (currentHHMM >= rule.startTime || currentHHMM <= rule.endTime) {
        return true;
      }
    }
  }

  return false;
};

/**
 * Syncs camera recording states with MediaMTX based on active schedules.
 * Only patches MediaMTX on state transitions (OFF -> ON or ON -> OFF).
 */
export const syncRecordingSchedules = async (): Promise<void> => {
  try {
    const cameras = await Camera.find({ isDeleted: false });
    if (!cameras.length) return;

    const schedules = await RecordingSchedule.find({});
    const scheduleMap = new Map(schedules.map((s) => [s.cameraId.toString(), s.rules]));

    const now = new Date();

    for (const camera of cameras) {
      const isFeatureEnabled = camera.settings?.recordingEnabled ?? true;
      const rules = scheduleMap.get(camera._id.toString()) || [];
      const shouldRecord = isFeatureEnabled && isScheduleRuleActive(rules, now);

      const pathSlug = getCameraStreamPath(camera);
      const rawPath = pathSlug.startsWith("raw_") ? pathSlug : `raw_${pathSlug}`;

      const currentState = activeRecordingStates.get(rawPath);

      // Edge-triggered check: only patch MediaMTX if state transitioned
      if (currentState !== shouldRecord) {
        activeRecordingStates.set(rawPath, shouldRecord);

        if (shouldRecord) {
          // Patch MediaMTX path config with recording enabled & standardized segment rules
          await mediamtxFetch("PATCH", `/config/paths/patch/${rawPath}`, {
            record: true,
            recordPath: "./recordings/%path/%Y-%m-%d_%H-%M-%S",
            recordFormat: "fmp4",
            recordPartDuration: "1s",
            recordSegmentDuration: "120s",
            recordDeleteAfter: "2h",
          });
        } else {
          // Disable recording for this path
          await mediamtxFetch("PATCH", `/config/paths/patch/${rawPath}`, {
            record: false,
          });
        }

        logger.info(
          `📹 [RecordingScheduler] State transition for '${camera.name}' (${rawPath}): record = ${shouldRecord}`
        );
      }
    }
  } catch (err) {
    logger.error(`[RecordingScheduler] Error evaluating schedules: ${(err as Error).message}`);
  }
};

/**
 * Force an immediate re-evaluation of recording schedules, bypassing wait interval.
 */
export const triggerImmediateScheduleSync = async (cameraId?: string): Promise<void> => {
  try {
    if (cameraId) {
      for (const [key] of activeRecordingStates.entries()) {
        if (key.includes(cameraId)) {
          activeRecordingStates.delete(key);
        }
      }
    } else {
      activeRecordingStates.clear();
    }
    await syncRecordingSchedules();
  } catch (err) {
    logger.warn(`[RecordingScheduler] Immediate sync warning: ${(err as Error).message}`);
  }
};

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export const startRecordingScheduler = (intervalMs: number = 60000): void => {
  if (schedulerInterval) return;

  logger.info(`⏰ [RecordingScheduler] Initialized (evaluating schedules every ${intervalMs / 1000}s)`);
  // Run initial sync
  syncRecordingSchedules().catch((err) => {
    logger.error(`[RecordingScheduler] Initial sync error: ${(err as Error).message}`);
  });

  schedulerInterval = setInterval(() => {
    syncRecordingSchedules().catch((err) => {
      logger.error(`[RecordingScheduler] Periodic sync error: ${(err as Error).message}`);
    });
  }, intervalMs);

  schedulerInterval.unref();
};

export const stopRecordingScheduler = (): void => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info("🛑 [RecordingScheduler] Scheduler stopped");
  }
};
