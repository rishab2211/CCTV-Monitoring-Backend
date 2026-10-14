/**
 * @file recording.controller.ts
 * @description Express request handlers for VOD recording chunks, schedules, and byte-range streaming.
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
 * Stream Video Recording
 * GET /api/v1/recordings/:id/stream
 * Handles HTTP 206 Range requests for HTML5 video players or redirects to cloud storage.
 */
export const streamRecording = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await recordingService.streamRecording(req.params.id, req, res, req.user);
});

/**
 * Delete Recording Endpoint
 * DELETE /api/v1/recordings/:id
 * Soft deletes a recording chunk and removes local archive files.
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
  const start = (req.query.start || req.query.startTime) as string;
  const end = (req.query.end || req.query.endTime) as string;
  if (!start || !end) {
    throw ApiError.badRequest("start (or startTime) and end (or endTime) query params are required");
  }
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
  const days = req.body.days !== undefined ? req.body.days : req.body.retentionDays;
  const result = await recordingService.updateRetentionPolicy(days, req.user);
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
 * PUT /api/v1/recordings/:cameraId/schedule
 * Overwrites the recording schedule rules for a camera.
 */
export const updateSchedule = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const cameraId = req.params.cameraId || req.body.cameraId;
  const rules = req.body.rules !== undefined ? req.body.rules : req.body;
  if (!cameraId) throw ApiError.badRequest("Camera ID is required");
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
 * DELETE /api/v1/recordings/:cameraId/schedule
 * Stops all automated recordings for the camera (resets to 24/7 continuous default).
 */
export const deleteSchedule = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await recordingService.deleteSchedule(req.params.cameraId, req.user);
  res.status(200).json(new ApiResponse(200, result, "Schedule reset to default"));
});

export const generateDownloadLink = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const downloadUrl = await recordingService.generateDownloadUrl(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, { downloadUrl }, "Download link generated"));
});

/**
 * Dynamic HLS VOD Playlist Endpoint
 * GET /api/v1/recordings/:cameraId/vod.m3u8
 * Returns an HLS playlist stitching together all fMP4 chunks in the requested time range.
 */
export const getVodPlaylist = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const start = (req.query.start || req.query.startTime) as string;
  const end = (req.query.end || req.query.endTime) as string;
  if (!start || !end) {
    throw ApiError.badRequest("start (or startTime) and end (or endTime) query params are required");
  }

  const playlist = await recordingService.generateVodPlaylist(req.params.cameraId, start, end, req.user);
  res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.status(200).send(playlist);
});
