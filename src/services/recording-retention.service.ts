/**
 * @file recording-retention.service.ts
 * @description Storage retention pruning daemon.
 * Periodically identifies expired video recording chunks, purges cloud objects from
 * Cloudflare R2 / AWS S3, unlinks local archive files from disk, and updates database metadata
 * to prevent orphaned storage costs and disk exhaustion.
 */
import fs from "fs";
import { Recording } from "../models/Recording";
import { deleteRecordingObjects, isStorageConfigured } from "../config/storage";
import { logger } from "../utils/logger";

/**
 * Runs a single retention pruning pass.
 * Deletes expired R2 objects in batches of up to 500 per pass and purges local files.
 */
export const pruneExpiredRecordings = async (): Promise<number> => {
  try {
    const now = new Date();

    // Query expired chunks that have not yet been marked deleted
    const expiredChunks = await Recording.find({
      expiresAt: { $lte: now },
      status: { $ne: "deleted" },
    })
      .limit(500)
      .select("_id s3Key url localPath");

    if (!expiredChunks.length) {
      logger.debug("[RetentionPruner] No expired recordings to prune");
      return 0;
    }

    logger.info(`🧹 [RetentionPruner] Found ${expiredChunks.length} expired recording(s) to prune`);

    // 1. Delete objects from Cloudflare R2 / AWS S3
    const s3KeysToDelete = expiredChunks
      .map((c) => c.s3Key)
      .filter((k): k is string => Boolean(k));

    if (s3KeysToDelete.length > 0 && isStorageConfigured()) {
      try {
        await deleteRecordingObjects(s3KeysToDelete);
      } catch (cloudErr) {
        logger.error(`[RetentionPruner] Cloud storage deletion error: ${(cloudErr as Error).message}`);
      }
    }

    // 2. Delete local files from server disk (critical for local archive storage mode)
    let localDeletedCount = 0;
    for (const chunk of expiredChunks) {
      if (chunk.localPath && fs.existsSync(chunk.localPath)) {
        try {
          fs.unlinkSync(chunk.localPath);
          localDeletedCount++;
        } catch (unlinkErr) {
          logger.warn(
            `[RetentionPruner] Failed to delete local file ${chunk.localPath}: ${(unlinkErr as Error).message}`
          );
        }
      }
    }

    if (localDeletedCount > 0) {
      logger.info(`[RetentionPruner] Cleaned up ${localDeletedCount} local expired recording file(s) from disk`);
    }

    // 3. Mark documents as deleted in MongoDB
    const chunkIds = expiredChunks.map((c) => c._id);
    const updateResult = await Recording.updateMany(
      { _id: { $in: chunkIds } },
      { $set: { status: "deleted" } }
    );

    logger.info(`✅ [RetentionPruner] Pruned ${updateResult.modifiedCount} recording chunk(s) from storage & database`);
    return updateResult.modifiedCount;
  } catch (err) {
    logger.error(`[RetentionPruner] Error during retention pruning: ${(err as Error).message}`);
    return 0;
  }
};

let retentionInterval: ReturnType<typeof setInterval> | null = null;

export const startRetentionPruner = (intervalMs: number = 86400000): void => {
  if (retentionInterval) return;

  logger.info(`🧹 [RetentionPruner] Initialized (running daily retention cleanup)`);

  // Delay first run slightly (20 seconds after server boot) to avoid contention during startup
  setTimeout(() => {
    pruneExpiredRecordings().catch((err) => {
      logger.error(`[RetentionPruner] Initial run error: ${(err as Error).message}`);
    });
  }, 20000).unref();

  retentionInterval = setInterval(() => {
    pruneExpiredRecordings().catch((err) => {
      logger.error(`[RetentionPruner] Periodic pruner error: ${(err as Error).message}`);
    });
  }, intervalMs);

  retentionInterval.unref();
};

export const stopRetentionPruner = (): void => {
  if (retentionInterval) {
    clearInterval(retentionInterval);
    retentionInterval = null;
    logger.info("🛑 [RetentionPruner] Retention pruner stopped");
  }
};
