/**
 * @file recording-retention.service.ts
 * @description Storage retention pruning daemon.
 * Periodically identifies expired video recording chunks, purges the files from Cloudflare R2,
 * and updates database metadata to prevent orphaned object storage costs.
 */
import { Recording } from "../models/Recording";
import { deleteRecordingObjects, isStorageConfigured } from "../config/storage";
import { logger } from "../utils/logger";

/**
 * Runs a single retention pruning pass.
 * Deletes expired R2 objects in batches of up to 500 per pass.
 */
export const pruneExpiredRecordings = async (): Promise<number> => {
  try {
    const now = new Date();

    // Query expired chunks that have not yet been deleted
    const expiredChunks = await Recording.find({
      expiresAt: { $lte: now },
      status: { $ne: "deleted" },
    })
      .limit(500)
      .select("_id s3Key url");

    if (!expiredChunks.length) {
      logger.debug("[RetentionPruner] No expired recordings to prune");
      return 0;
    }

    logger.info(`🧹 [RetentionPruner] Found ${expiredChunks.length} expired recording(s) to prune`);

    // Extract s3Keys that need to be deleted from Cloudflare R2
    const s3KeysToDelete = expiredChunks
      .map((c) => c.s3Key)
      .filter((k): k is string => Boolean(k));

    if (s3KeysToDelete.length > 0 && isStorageConfigured()) {
      await deleteRecordingObjects(s3KeysToDelete);
    }

    // Mark the documents as deleted in MongoDB
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
