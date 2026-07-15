import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as recordingService from "../services/recording.service";

/**
 * POST /api/v1/recordings
 * Internal/System endpoint to log a new recording chunk.
 */
export const createRecordingChunk = catchAsync(async (req: Request, res: Response) => {
  // Only accessible via system token (handled by middleware)
  const recording = await recordingService.createRecordingChunk(req.body);
  res.status(201).json(new ApiResponse(201, recording, "Recording chunk logged"));
});

export const listRecordings = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await recordingService.listRecordings(req.query, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

export const getRecordingDetails = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await recordingService.getRecordingDetails(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

export const deleteRecording = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await recordingService.deleteRecording(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, result, "Recording deleted"));
});

export const getPlaybackChunks = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { start, end } = req.query as { start: string; end: string };
  const chunks = await recordingService.getPlaybackChunks(req.params.cameraId, start, end, req.user);
  res.status(200).json(new ApiResponse(200, { chunks, count: chunks.length }));
});

export const getTimeline = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { date } = req.query as { date: string };
  const chunks = await recordingService.getTimeline(req.params.cameraId, date, req.user);
  res.status(200).json(new ApiResponse(200, { timeline: chunks, count: chunks.length }));
});

export const updateRetentionPolicy = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await recordingService.updateRetentionPolicy(req.body.days, req.user);
  res.status(200).json(new ApiResponse(200, result, "Retention policy updated"));
});

export const getStorageStats = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const stats = await recordingService.getStorageStats();
  res.status(200).json(new ApiResponse(200, stats));
});

export const setSchedule = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { cameraId, rules } = req.body;
  const result = await recordingService.setSchedule(cameraId, rules, req.user);
  res.status(200).json(new ApiResponse(200, result, "Schedule updated"));
});

export const getSchedule = catchAsync(async (req: Request, res: Response) => {
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
