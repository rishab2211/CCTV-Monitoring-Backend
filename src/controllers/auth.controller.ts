/**
 * @file auth.controller.ts
 * @description Express request handlers for user authentication.
 * Wraps service calls with `catchAsync` to forward errors to the global error handler.
 */
import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as authService from "../services/auth.service";
import { IDeviceInfo } from "../types";

// Helpers

/**
 * Gets device information from the request.
 * @param req The request object.
 * @returns The device information.
 */
const getDeviceInfo = (req: Request): IDeviceInfo => ({
  userAgent: req.headers["user-agent"] || "",
  ipAddress:
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "0.0.0.0",
});

// Controllers

/**
 * Register User Endpoint
 * POST /api/v1/auth/register
 */
export const register = catchAsync(async (req: Request, res: Response) => {
  const { user, tokens } = await authService.register(req.body, getDeviceInfo(req));

  res.status(201).json(
    new ApiResponse(201, { user, tokens }, "Account registered successfully")
  );
});


/**
 * Login User Endpoint
 * POST /api/v1/auth/login
 */
export const login = catchAsync(async (req: Request, res: Response) => {
  const { user, tokens } = await authService.login(req.body, getDeviceInfo(req));

  res.status(200).json(
    new ApiResponse(200, { user, tokens }, "Logged in successfully")
  );
});


/**
 * Refresh Token Endpoint
 * POST /api/v1/auth/refresh
 * Exchanges a valid refresh token for a new access token.
 */
export const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const { refreshToken: rawRefreshToken } = req.body as { refreshToken: string };
  const { userAgent, ipAddress } = getDeviceInfo(req);

  const tokens = await authService.refreshAccessToken(rawRefreshToken, userAgent, ipAddress);

  res.status(200).json(
    new ApiResponse(200, tokens, "Token refreshed successfully")
  );
});


/**
 * Logout User Endpoint
 * POST /api/v1/auth/logout
 * Revokes the current session.
 */
export const logout = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  await authService.logout(req.user.userId, req.user.sessionId);

  res.status(200).json(
    new ApiResponse(200, null, "Logged out successfully")
  );
});


/**
 * POST /api/v1/auth/forgot-password
 * Send a 6-digit OTP to the user's registered email.
 */
export const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.forgotPassword(req.body);

  // Always return 200 to prevent email enumeration
  res.status(200).json(
    new ApiResponse(
      200,
      { maskedEmail: result.maskedEmail },
      `If this email is registered, an OTP has been sent to ${result.maskedEmail}`
    )
  );
});


/**
 * POST /api/v1/auth/verify-otp
 * Verify OTP and receive a short-lived password reset token.
 */
export const verifyOtp = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.verifyOtp(req.body);

  res.status(200).json(
    new ApiResponse(
      200,
      result,
      "OTP verified successfully. Use the reset token to set a new password."
    )
  );
});


/**
 * POST /api/v1/auth/reset-password
 * Reset password using the token received after OTP verification.
 */
export const resetPassword = catchAsync(async (req: Request, res: Response) => {
  await authService.resetPassword(req.body);

  res.status(200).json(
    new ApiResponse(
      200,
      null,
      "Password reset successfully. Please log in with your new password."
    )
  );
});


/**
 * PUT /api/v1/auth/change-password
 * Change password for an authenticated user.
 */
export const changePassword = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  await authService.changePassword(req.user.userId, req.body);

  res.status(200).json(
    new ApiResponse(200, null, "Password changed successfully")
  );
});


/**
 * GET /api/v1/auth/sessions
 * List all active device sessions for the current user.
 */
export const getSessions = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const sessions = await authService.getSessions(req.user.userId);

  res.status(200).json(
    new ApiResponse(200, { sessions, currentSessionId: req.user.sessionId })
  );
});


/**
 * DELETE /api/v1/auth/sessions/:sessionId
 * Revoke a specific device session.
 */
export const revokeSession = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  await authService.revokeSession(
    req.user.userId,
    req.params.sessionId,
    req.user.sessionId
  );

  res.status(200).json(
    new ApiResponse(200, null, "Session revoked successfully")
  );
});


/**
 * DELETE /api/v1/auth/sessions
 * Revoke all sessions except the current one.
 */
export const revokeAllSessions = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const result = await authService.revokeAllOtherSessions(
    req.user.userId,
    req.user.sessionId
  );

  res.status(200).json(
    new ApiResponse(
      200,
      result,
      `${result.revokedCount} session${result.revokedCount !== 1 ? "s" : ""} revoked successfully`
    )
  );
});


/**
 * Get Current User Details Endpoint
 * GET /api/v1/auth/me
 * Uses the JWT payload to fetch the full user profile.
 */
export const getMe = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const user = await authService.getMe(req.user.userId);

  res.status(200).json(
    new ApiResponse(200, { user })
  );
});
