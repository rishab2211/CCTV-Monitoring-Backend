import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as cameraService from "../services/camera.service";
import { ListCamerasQuery } from "../validators/camera.validator";

/**
 * POST /api/v1/cameras
 * Add a new camera.
 */
export const createCamera = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const camera = await cameraService.createCamera(req.body, req.user.userId);
  res.status(201).json(new ApiResponse(201, { camera }, "Camera registered successfully"));
});

/**
 * GET /api/v1/cameras
 * List all cameras (filtered based on user's role).
 */
export const listCameras = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await cameraService.listCameras(
    req.query as unknown as ListCamerasQuery,
    req.user
  );
  res.status(200).json(new ApiResponse(200, result));
});

/**
 * GET /api/v1/cameras/:id
 * Get camera details by ID.
 */
export const getCameraById = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const camera = await cameraService.getCameraById(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, { camera }));
});

/**
 * PUT /api/v1/cameras/:id
 * Update camera information.
 */
export const updateCamera = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const camera = await cameraService.updateCamera(req.params.id, req.body, req.user);
  res.status(200).json(new ApiResponse(200, { camera }, "Camera updated successfully"));
});

/**
 * DELETE /api/v1/cameras/:id
 * Soft delete / decommission camera.
 */
export const deleteCamera = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await cameraService.softDeleteCamera(req.params.id, req.user.userId);
  res.status(200).json(new ApiResponse(200, null, "Camera decommissioned successfully"));
});

/**
 * POST /api/v1/cameras/:id/assign
 * Assign camera to customer, operators, and/or franchise.
 */
export const assignCamera = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const camera = await cameraService.assignCamera(req.params.id, req.body, req.user.userId);
  res.status(200).json(new ApiResponse(200, { camera }, "Camera assignments updated successfully"));
});

/**
 * POST /api/v1/cameras/:id/transfer
 * Transfer ownership of camera to another customer.
 */
export const transferCamera = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const camera = await cameraService.transferCamera(
    req.params.id,
    req.body.customerId,
    req.user.userId
  );
  res.status(200).json(new ApiResponse(200, { camera }, "Camera ownership transferred successfully"));
});

/**
 * PATCH /api/v1/cameras/:id/status
 * Remotely update camera online/offline/maintenance status.
 */
export const updateCameraStatus = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const camera = await cameraService.updateCameraStatus(
    req.params.id,
    req.body.status,
    req.user.userId
  );
  res.status(200).json(new ApiResponse(200, { camera }, `Camera status set to ${req.body.status}`));
});

/**
 * POST /api/v1/cameras/:id/heartbeat
 * Heartbeat ping from camera hardware/polling systems.
 */
export const updateCameraHealth = catchAsync(async (req: Request, res: Response) => {
  const camera = await cameraService.updateCameraHealth(req.params.id, req.body);
  res.status(200).json(new ApiResponse(200, { camera }, "Heartbeat received successfully"));
});

/**
 * POST /api/v1/cameras/:id/restart
 * Remotely restart the camera (mock action).
 */
export const restartCamera = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await cameraService.restartCamera(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, null, "Restart command sent successfully"));
});

/**
 * PATCH /api/v1/cameras/:id/recording
 * Toggle recording settings.
 */
export const updateRecording = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const camera = await cameraService.updateSettingsField(
    req.params.id,
    "recordingEnabled",
    req.body.enabled,
    req.user
  );
  res.status(200).json(
    new ApiResponse(200, { camera }, `Recording ${req.body.enabled ? "enabled" : "disabled"} successfully`)
  );
});

/**
 * PATCH /api/v1/cameras/:id/motion
 * Toggle motion detection settings.
 */
export const updateMotion = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const camera = await cameraService.updateSettingsField(
    req.params.id,
    "motionDetectionEnabled",
    req.body.enabled,
    req.user
  );
  res.status(200).json(
    new ApiResponse(200, { camera }, `Motion detection ${req.body.enabled ? "enabled" : "disabled"} successfully`)
  );
});

/**
 * PATCH /api/v1/cameras/:id/ai
 * Toggle AI features.
 */
export const updateAI = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const camera = await cameraService.updateSettingsField(
    req.params.id,
    "aiFeaturesEnabled",
    req.body.enabled,
    req.user
  );
  res.status(200).json(
    new ApiResponse(200, { camera }, `AI features ${req.body.enabled ? "enabled" : "disabled"} successfully`)
  );
});

/**
 * GET /api/v1/cameras/customer/:customerId
 * Fetch all cameras owned by a customer.
 */
export const getCustomerCameras = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const cameras = await cameraService.getCustomerCameras(req.params.customerId, req.user);
  res.status(200).json(new ApiResponse(200, { cameras, count: cameras.length }));
});

/**
 * GET /api/v1/cameras/operator/:operatorId
 * Fetch all cameras assigned to an operator.
 */
export const getOperatorCameras = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const cameras = await cameraService.getOperatorCameras(req.params.operatorId, req.user);
  res.status(200).json(new ApiResponse(200, { cameras, count: cameras.length }));
});

/**
 * POST /api/v1/cameras/:id/qr-scan
 * Configure camera using scanned QR code.
 */
export const qrScanCamera = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const camera = await cameraService.qrScanCamera(req.params.id, req.user.userId);
  res.status(200).json(new ApiResponse(200, { camera }, "Camera configured via QR code successfully"));
});

/**
 * GET /api/v1/cameras/:id/config
 * Get camera configurations.
 */
export const getCameraConfig = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const config = await cameraService.getCameraConfig(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, { config }));
});
