/**
 * @file storage.ts
 * @description Unified Object Storage Service (AWS S3 & Cloudflare R2).
 * Automatically detects whether AWS S3 or Cloudflare R2 credentials are provided.
 * Handles video segment uploads, pre-signed playback & download URLs, and batch deletion.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import { env } from "./env";
import { logger } from "../utils/logger";

// ─── Resolve Storage Configuration ───────────────────────────────────────────
const isAwsS3 = Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);

export const getBucketName = (): string => {
  return env.AWS_S3_BUCKET || env.R2_BUCKET_NAME || "cctv-recordings";
};

const resolveRegion = (): string => {
  if (isAwsS3 && !env.STORAGE_ENDPOINT && !env.R2_ACCOUNT_ID) {
    return env.AWS_REGION || "us-east-1";
  }
  return "auto";
};

const resolveEndpoint = (): string | undefined => {
  if (env.STORAGE_ENDPOINT) {
    return env.STORAGE_ENDPOINT;
  }
  if (env.R2_ACCOUNT_ID) {
    return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  }
  // Native AWS S3: return undefined so the official SDK uses https://s3.<region>.amazonaws.com
  if (isAwsS3) {
    return undefined;
  }
  return "https://r2.cloudflarestorage.com";
};

const resolveCredentials = () => {
  const accessKeyId = env.AWS_ACCESS_KEY_ID || env.R2_ACCESS_KEY_ID || "unconfigured";
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY || env.R2_SECRET_ACCESS_KEY || "unconfigured";
  return { accessKeyId, secretAccessKey };
};

// ─── Initialize Unified S3/R2 Client Singleton ────────────────────────────────
export const storageClient = new S3Client({
  region: resolveRegion(),
  endpoint: resolveEndpoint(),
  credentials: resolveCredentials(),
});

/**
 * Checks whether Object Storage (AWS S3 or Cloudflare R2) credentials are configured.
 */
export const isStorageConfigured = (): boolean => {
  return Boolean(
    (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) ||
      (env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) ||
      (env.STORAGE_ENDPOINT && (env.AWS_ACCESS_KEY_ID || env.R2_ACCESS_KEY_ID))
  );
};

export interface UploadSegmentOptions {
  s3Key: string;
  body: Buffer | Uint8Array | Readable;
  sizeBytes?: number;
  contentType?: string;
  metadata?: Record<string, string>;
}

/**
 * Uploads a video recording segment (fMP4) to S3 / Cloudflare R2.
 */
export const uploadRecordingSegment = async (
  options: UploadSegmentOptions
): Promise<{ s3Key: string; bucket: string; publicUrl: string }> => {
  const { s3Key, body, sizeBytes, contentType = "video/mp4", metadata } = options;
  const bucket = getBucketName();

  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: body,
      ContentType: contentType,
      ContentLength: sizeBytes,
      Metadata: metadata,
    });

    await storageClient.send(command);

    const publicUrl = env.R2_PUBLIC_DOMAIN
      ? `${env.R2_PUBLIC_DOMAIN.replace(/\/+$/, "")}/${s3Key}`
      : isAwsS3 && !env.STORAGE_ENDPOINT
      ? `https://${bucket}.s3.${resolveRegion()}.amazonaws.com/${s3Key}`
      : `${resolveEndpoint() || ""}/${bucket}/${s3Key}`;

    logger.debug(`[Storage] Uploaded segment to ${isAwsS3 ? "AWS S3" : "R2"}: ${s3Key} (${sizeBytes ?? 0} bytes)`);
    return { s3Key, bucket, publicUrl };
  } catch (err) {
    logger.error(`[Storage] Failed to upload segment ${s3Key}: ${(err as Error).message}`);
    throw err;
  }
};

/**
 * Generates a short-lived pre-signed GET URL for in-browser video playback.
 * Supports HTTP byte-range requests for continuous timeline scrubbing.
 * 
 * @param s3Key - Path key in the storage bucket
 * @param expiresInSeconds - Lifetime of the signed URL (default 900s = 15m)
 */
export const generatePresignedPlaybackUrl = async (
  s3Key: string,
  expiresInSeconds: number = 900
): Promise<string> => {
  const bucket = getBucketName();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: s3Key,
  });

  return getSignedUrl(storageClient, command, { expiresIn: expiresInSeconds });
};

/**
 * Generates a pre-signed GET URL that triggers a file download in the browser
 * with a human-readable attachment filename.
 * 
 * @param s3Key - Path key in the storage bucket
 * @param downloadFileName - Desired filename on user download (e.g. "cam-01_2026-10-12.mp4")
 * @param expiresInSeconds - Lifetime of the signed URL (default 900s = 15m)
 */
export const generatePresignedDownloadUrl = async (
  s3Key: string,
  downloadFileName: string,
  expiresInSeconds: number = 900
): Promise<string> => {
  const bucket = getBucketName();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    ResponseContentDisposition: `attachment; filename="${downloadFileName}"`,
  });

  return getSignedUrl(storageClient, command, { expiresIn: expiresInSeconds });
};

/**
 * Batch deletes up to 1,000 objects from storage.
 * Used by the daily retention pruning worker.
 */
export const deleteRecordingObjects = async (
  s3Keys: string[]
): Promise<number> => {
  if (!s3Keys.length) return 0;
  const bucket = getBucketName();

  try {
    const command = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: s3Keys.map((Key) => ({ Key })),
        Quiet: true,
      },
    });

    const response = await storageClient.send(command);
    const errors = response.Errors?.length ?? 0;
    const deletedCount = s3Keys.length - errors;

    if (errors > 0) {
      logger.warn(`[Storage] ${errors} errors occurred while deleting ${s3Keys.length} objects from ${bucket}`);
    } else {
      logger.info(`[Storage] Successfully deleted ${deletedCount} expired recording objects from ${bucket}`);
    }

    return deletedCount;
  } catch (err) {
    logger.error(`[Storage] Failed to batch delete objects: ${(err as Error).message}`);
    throw err;
  }
};
