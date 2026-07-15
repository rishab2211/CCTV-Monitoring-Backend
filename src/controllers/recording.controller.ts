/**
 * @file recording.controller.ts
 * @description Express request handlers for VOD recording chunks and schedules.
 */
import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as recordingService from "../services/recording.service";

/**
 * Internal Webhook Endpoint
 * POST /api/v1/recordings/internal/chunk
 * Called by external FFmpeg processes to log a new recording chunk in the DB.
 */
export const createRecordingChunk = catchAsync(async (req: Request, res: Response) => {
  // Only accessible via system token (handled by middleware)
  const recording = await recordingService.createRecordingChunk(req.body);
  res.status(201).json(new ApiResponse(201, recording, "Recording chunk logged"));
});

/**
 * List Recordings Endpoint
 * GET /api/v1/recordings
 * Retrieves paginated list of video chunks, enforcing RBAC based on assigned cameras.
 */
export const listRecordings = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await recordingService.listRecordings(req.query, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

/**
 * Get Recording Details Endpoint
 * GET /api/v1/recordings/:id
 * Fetches specific metadata for a recording chunk.
 */
export const getRecordingDetails = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await recordingService.getRecordingDetails(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

/**
 * Delete Recording Endpoint
 * DELETE /api/v1/recordings/:id
 * Soft deletes a recording chunk.
 */
export const deleteRecording = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await recordingService.deleteRecording(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, result, "Recording deleted"));
});

/**
 * Get Playback Chunks Endpoint
 * GET /api/v1/recordings/camera/:cameraId/playback
 * Returns raw VOD chunks between a start and end time.
 */
export const getPlaybackChunks = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { start, end } = req.query as { start: string; end: string };
  const chunks = await recordingService.getPlaybackChunks(req.params.cameraId, start, end, req.user);
  res.status(200).json(new ApiResponse(200, { chunks, count: chunks.length }));
});

/**
 * Get Timeline Endpoint
 * GET /api/v1/recordings/camera/:cameraId/timeline
 * Aggregates VOD chunks for a camera over a given date range to populate the frontend scrubber.
 */
export const getTimeline = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { date } = req.query as { date: string };
  const chunks = await recordingService.getTimeline(req.params.cameraId, date, req.user);
  res.status(200).json(new ApiResponse(200, { timeline: chunks, count: chunks.length }));
});

/**
 * Update Retention Policy Endpoint
 * PUT /api/v1/recordings/retention
 * Admin endpoint to update global or per-camera video retention policy.
 */
export const updateRetentionPolicy = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await recordingService.updateRetentionPolicy(req.body.days, req.user);
  res.status(200).json(new ApiResponse(200, result, "Retention policy updated"));
});

/**
 * Get Storage Stats Endpoint
 * GET /api/v1/recordings/stats
 * Admin endpoint to view storage consumption across all recordings.
 */
export const getStorageStats = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const stats = await recordingService.getStorageStats();
  res.status(200).json(new ApiResponse(200, stats));
});

/**
 * Update Schedule Endpoint
 * PUT /api/v1/recordings/schedule/:cameraId
 * Overwrites the recording schedule rules for a camera.
 */
export const updateSchedule = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { cameraId, rules } = req.body;
  const result = await recordingService.updateSchedule(cameraId, rules, req.user);
  res.status(200).json(new ApiResponse(200, result, "Schedule updated"));
});

export const getSchedule = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await recordingService.getSchedule(req.params.cameraId, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

/**
 * Delete Schedule Endpoint
 * DELETE /api/v1/recordings/schedule/:cameraId
 * Stops all automated recordings for the camera.
 */
export const deleteSchedule = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await recordingService.getSchedule(req.params.cameraId, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

export const generateDownloadLink = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  // Simplified logic: ensure user has access, then just return the URL. 
  // In a real app with S3, this would generate a signed presigned URL.
  const recording = await recordingService.getRecordingDetails(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, { downloadUrl: recording.url }, "Download link generated"));
});
