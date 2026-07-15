import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as talkbackService from "../services/talkback.service";

export const getCapabilities = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const caps = await talkbackService.getCapabilities(req.params.cameraId, req.user);
  res.status(200).json(new ApiResponse(200, caps));
});

export const startSession = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await talkbackService.startSession(req.params.cameraId, req.user);
  res.status(201).json(new ApiResponse(201, result, "Talkback session started"));
});

export const stopSession = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await talkbackService.stopSession(req.params.cameraId, req.user);
  res.status(200).json(new ApiResponse(200, result, "Talkback session stopped"));
});

export const getSessionStatus = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const status = await talkbackService.getSessionStatus(req.params.cameraId, req.user);
  res.status(200).json(new ApiResponse(200, status));
});

export const getLogs = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await talkbackService.getLogs(req.query, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

export const getActiveSessions = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const activeSessions = await talkbackService.getActiveSessions(req.user);
  res.status(200).json(new ApiResponse(200, { activeSessions, count: activeSessions.length }));
});
