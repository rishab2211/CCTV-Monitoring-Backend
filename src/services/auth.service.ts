/**
 * @file auth.service.ts
 * @description Handles user authentication, token generation, and password management.
 * Interfaces with the Redis-backed session store to maintain active logins.
 */
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import UAParser from "ua-parser-js";
import { User, UserDocument } from "../models/User";
import { RefreshToken } from "../models/RefreshToken";
import { DeviceSession } from "../models/DeviceSession";
import { OTPVerification } from "../models/OTPVerification";
import { logActivity } from "../models/ActivityLog";
import { ApiError } from "../utils/ApiError";
import { hashToken, generateOTP, generateSecureToken, addMinutes } from "../utils/helpers";
import { sendOTPEmail } from "./email.service";
import { env } from "../config/env";
import { AuthTokens, IDeviceInfo, JwtRefreshPayload } from "../types";
import {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  VerifyOtpInput,
  ResetPasswordInput,
  ChangePasswordInput,
} from "../validators/auth.validator";
import { logger } from "../utils/logger";


// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parses device information from a User-Agent string.
 */
const parseDeviceInfo = (userAgent: string = "", ipAddress: string = ""): IDeviceInfo => {
  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  const deviceType = result.device.type || "desktop";
  const os = result.os.name
    ? `${result.os.name}${result.os.version ? ` ${result.os.version}` : ""}`
    : "Unknown OS";
  const browser = result.browser.name
    ? `${result.browser.name}${result.browser.major ? ` ${result.browser.major}` : ""}`
    : "Unknown Browser";
  const deviceName =
    result.device.vendor && result.device.model
      ? `${result.device.vendor} ${result.device.model}`
      : `${browser} on ${os}`;

  return {
    deviceName,
    deviceType: ["mobile", "tablet", "desktop"].includes(deviceType)
      ? deviceType
      : "unknown",
    os,
    browser,
    ipAddress,
    userAgent: userAgent.slice(0, 500),
  };
};

/**
 * Issues both access and refresh tokens and creates a device session.
 */
const issueTokens = async (
  user: UserDocument,
  deviceInfo: IDeviceInfo
): Promise<AuthTokens> => {
  const sessionId = uuidv4();

  // Generate tokens
  const accessToken = user.generateAccessToken(sessionId);
  const rawRefreshToken = user.generateRefreshToken();

  // Hash refresh token before storing
  const tokenHash = hashToken(rawRefreshToken);

  // Parse expiry for DB storage (30 days default)
  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Store hashed refresh token
  await RefreshToken.create({
    userId: user._id,
    tokenHash,
    sessionId,
    expiresAt: refreshExpiresAt,
  });

  // Create device session
  await DeviceSession.create({
    userId: user._id,
    sessionId,
    ...deviceInfo,
    lastActiveAt: new Date(),
  });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    sessionId,
    expiresIn: 15 * 60, // 15 minutes in seconds
  };
};

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Register a new User
 * Hashes the password and sets default notification preferences.
 * 
 * @param input - User registration details
 * @param deviceInfo - Device metadata
 * @returns Object containing the created user document and auth tokens
 */
export const register = async (
  input: RegisterInput,
  deviceInfo: IDeviceInfo
): Promise<{ user: UserDocument; tokens: AuthTokens }> => {
  // Check for existing email
  const existingEmail = await User.findOne({ email: input.email });
  if (existingEmail) {
    throw ApiError.conflict("An account with this email already exists");
  }

  // Check for existing phone
  const existingPhone = await User.findOne({ phone: input.phone });
  if (existingPhone) {
    throw ApiError.conflict("An account with this phone number already exists");
  }

  // Create user (password hashed via pre-save hook)
  const user = await User.create({
    name: input.name,
    email: input.email,
    phone: input.phone,
    password: input.password,
    role: input.role,
  });

  // Issue tokens and create session
  const tokens = await issueTokens(user, parseDeviceInfo(deviceInfo.userAgent, deviceInfo.ipAddress));

  logActivity({
    userId: user._id,
    action: "REGISTER",
    description: `New ${user.role} account registered`,
    ipAddress: deviceInfo.ipAddress,
    userAgent: deviceInfo.userAgent,
  });

  logger.info(`✅ New user registered: ${user.email} (${user.role})`);

  return { user, tokens };
};

/**
 * Login User
 * Authenticates credentials, generates a new session ID, and issues JWT tokens.
 * 
 * @param input - Email or phone and plain-text password
 * @param deviceInfo - Device metadata
 * @returns Access token, refresh token, and user details
 */
export const login = async (
  input: LoginInput,
  deviceInfo: IDeviceInfo
): Promise<{ user: UserDocument; tokens: AuthTokens }> => {
  // Find user — must explicitly select password (it's excluded by default)
  // Also exclude soft-deleted accounts
  const query = input.email
    ? { email: input.email, isDeleted: false }
    : { phone: input.phone, isDeleted: false };

  const user = await User.findOne(query).select("+password");

  console.log("USER DETAILS",user);
  

  if (!user) {
    throw ApiError.unauthorized("Invalid credentials");
  }

  if (!user.isActive) {
    throw ApiError.forbidden("Your account has been deactivated. Please contact support.");
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(input.password);
  if (!isPasswordValid) {
    throw ApiError.unauthorized("Invalid credentials");
  }

  // Issue tokens and create session
  const tokens = await issueTokens(user, parseDeviceInfo(deviceInfo.userAgent, deviceInfo.ipAddress));

  logActivity({
    userId: user._id,
    action: "LOGIN",
    description: `Logged in from ${deviceInfo.ipAddress ?? "unknown IP"}`,
    ipAddress: deviceInfo.ipAddress,
    userAgent: deviceInfo.userAgent,
  });

  logger.info(`🔓 User logged in: ${user.email}`);

  return { user, tokens };
};

/**
 * Refresh Access Token
 * Validates a refresh token and issues a new access token if the session is still valid.
 * 
 * @param rawRefreshToken - The unexpired refresh token string
 * @param userAgent - Device user agent
 * @param ipAddress - Request IP address
 * @returns A fresh token pair
 */
export const refreshAccessToken = async (
  rawRefreshToken: string,
  userAgent: string = "",
  ipAddress: string = ""
): Promise<AuthTokens> => {
  // Verify JWT signature first
  let decoded: JwtRefreshPayload;
  try {
    decoded = jwt.verify(rawRefreshToken, env.REFRESH_TOKEN_SECRET) as JwtRefreshPayload;
  } catch {
    throw ApiError.unauthorized("Invalid or expired refresh token");
  }

  // Find matching token in DB
  const tokenHash = hashToken(rawRefreshToken);
  const storedToken = await RefreshToken.findOne({
    tokenHash,
    isRevoked: false,
  });

  if (!storedToken) {
    // Possible token reuse attack — revoke ALL tokens for this user
    await RefreshToken.updateMany(
      { userId: decoded.userId },
      { isRevoked: true }
    );
    logger.warn(`⚠️  Refresh token reuse detected for user ${decoded.userId}. All sessions invalidated.`);
    throw ApiError.unauthorized("Session has been invalidated. Please log in again.");
  }

  // Get the user
  const user = await User.findById(storedToken.userId);
  if (!user || !user.isActive) {
    throw ApiError.unauthorized("User not found or deactivated");
  }

  // Revoke the used token (rotation)
  storedToken.isRevoked = true;
  await storedToken.save();

  // Issue new token pair
  const parsedDevice = parseDeviceInfo(userAgent, ipAddress);
  const tokens = await issueTokens(user, parsedDevice);

  // Deactivate old session
  await DeviceSession.findOneAndUpdate(
    { sessionId: storedToken.sessionId },
    { isActive: false }
  );

  logger.info(`🔄 Tokens refreshed for user: ${user.email}`);

  return tokens;
};

/**
 * Logout User
 * Invalidates the current session ID in the database, effectively rendering
 * the current access token unusable.
 * 
 * @param userId - ID of the user logging out
 * @param sessionId - The specific session ID to invalidate
 */
export const logout = async (
  userId: string,
  sessionId: string
): Promise<void> => {
  await Promise.all([
    RefreshToken.findOneAndUpdate(
      { userId, sessionId },
      { isRevoked: true }
    ),
    DeviceSession.findOneAndUpdate(
      { sessionId },
      { isActive: false }
    ),
  ]);

  logActivity({
    userId,
    action: "LOGOUT",
    description: `Logged out from session`,
    metadata: { sessionId },
  });

  logger.info(`👋 User ${userId} logged out from session ${sessionId}`);
};

/**
 * Initiate forgot password — generate OTP and send via email.
 */
export const forgotPassword = async (
  input: ForgotPasswordInput
): Promise<{ maskedEmail: string }> => {
  const user = await User.findOne({ email: input.email });

  // Always return success to prevent user enumeration
  if (!user) {
    logger.info(`Forgot password attempt for non-existent email: ${input.email}`);
    return { maskedEmail: input.email.replace(/(.{2}).*(@.*)/, "$1***$2") };
  }

  // Invalidate any existing OTPs for this email
  await OTPVerification.updateMany(
    { email: input.email, type: "forgot_password", isUsed: false },
    { isUsed: true }
  );

  // Generate OTP
  const otp = generateOTP(6);
  const otpHash = hashToken(otp);
  const expiresAt = addMinutes(env.OTP_EXPIRY_MINUTES);

  await OTPVerification.create({
    email: input.email,
    otpHash,
    type: "forgot_password",
    expiresAt,
  });

  // Send OTP email
  await sendOTPEmail(input.email, otp, user.name);

  const maskedEmail = input.email.replace(/(.{2}).*(@.*)/, "$1***$2");
  return { maskedEmail };
};

/**
 * Verify OTP and return a short-lived reset token.
 */
export const verifyOtp = async (
  input: VerifyOtpInput
): Promise<{ resetToken: string }> => {
  const otpHash = hashToken(input.otp);

  const otpRecord = await OTPVerification.findOne({
    email: input.email,
    type: "forgot_password",
    isUsed: false,
  }).sort({ createdAt: -1 });

  if (!otpRecord) {
    throw ApiError.badRequest("No active OTP found. Please request a new one.");
  }

  if (otpRecord.expiresAt < new Date()) {
    throw ApiError.badRequest("OTP has expired. Please request a new one.");
  }

  if (otpRecord.attempts >= 5) {
    throw ApiError.tooManyRequests("Maximum OTP attempts exceeded. Please request a new OTP.");
  }

  if (otpRecord.otpHash !== otpHash) {
    otpRecord.attempts += 1;
    await otpRecord.save();
    const remaining = 5 - otpRecord.attempts;
    throw ApiError.badRequest(
      `Invalid OTP. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`
    );
  }

  // OTP is valid — mark as used
  otpRecord.isUsed = true;
  await otpRecord.save();

  // Generate a short-lived (15 min) password reset token
  const resetToken = generateSecureToken(32);
  const resetTokenHash = hashToken(resetToken);

  // Store reset token temporarily (reuse OTP record pattern — same TTL)
  await OTPVerification.create({
    email: input.email,
    otpHash: resetTokenHash, // Reusing otpHash field to store reset token hash
    type: "forgot_password",
    expiresAt: addMinutes(15),
    isUsed: false,
    attempts: 99, // Prevents this from being used as OTP
  });

  return { resetToken };
};

/**
 * Reset password using the reset token from verifyOtp.
 */
export const resetPassword = async (
  input: ResetPasswordInput
): Promise<void> => {
  const resetTokenHash = hashToken(input.resetToken);

  // Find the reset token record (attempts = 99 distinguishes it from OTP records)
  const tokenRecord = await OTPVerification.findOne({
    otpHash: resetTokenHash,
    type: "forgot_password",
    isUsed: false,
    attempts: 99,
  });

  if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
    throw ApiError.badRequest("Invalid or expired reset token. Please restart the forgot password process.");
  }

  // Find and update user
  const user = await User.findOne({ email: tokenRecord.email }).select("+password");
  if (!user) {
    throw ApiError.notFound("User");
  }

  user.password = input.newPassword;
  await user.save(); // Pre-save hook hashes the new password

  // Mark reset token as used
  tokenRecord.isUsed = true;
  await tokenRecord.save();

  // Revoke all refresh tokens (force re-login on all devices)
  await RefreshToken.updateMany({ userId: user._id }, { isRevoked: true });
  await DeviceSession.updateMany({ userId: user._id }, { isActive: false });

  logActivity({
    userId: user._id,
    action: "PASSWORD_RESET",
    description: "Password reset via OTP flow — all sessions invalidated",
  });

  logger.info(`🔑 Password reset for user: ${user.email}`);
};

/**
 * Change password (authenticated user).
 */
export const changePassword = async (
  userId: string,
  input: ChangePasswordInput
): Promise<void> => {
  const user = await User.findById(userId).select("+password");
  if (!user) throw ApiError.notFound("User");

  const isCurrentPasswordValid = await user.comparePassword(input.currentPassword);
  if (!isCurrentPasswordValid) {
    throw ApiError.badRequest("Current password is incorrect");
  }

  user.password = input.newPassword;
  await user.save();

  logActivity({
    userId: user._id,
    action: "PASSWORD_CHANGED",
    description: "Password changed by user",
  });

  logger.info(`🔑 Password changed for user: ${user.email}`);
};

/**
 * Get all active device sessions for the current user.
 */
export const getSessions = async (userId: string) => {
  return DeviceSession.find({ userId, isActive: true })
    .sort({ lastActiveAt: -1 })
    .lean();
};

/**
 * Revoke a specific device session.
 */
export const revokeSession = async (
  userId: string,
  sessionId: string,
  currentSessionId: string
): Promise<void> => {
  if (sessionId === currentSessionId) {
    throw ApiError.badRequest(
      "Cannot revoke your current session. Use logout instead."
    );
  }

  const session = await DeviceSession.findOne({ sessionId, userId });
  if (!session) {
    throw ApiError.notFound("Session");
  }

  await Promise.all([
    DeviceSession.findOneAndUpdate({ sessionId, userId }, { isActive: false }),
    RefreshToken.findOneAndUpdate({ sessionId, userId }, { isRevoked: true }),
  ]);

  logger.info(`🚫 Session ${sessionId} revoked for user ${userId}`);
};

/**
 * Revoke all sessions except the current one.
 */
export const revokeAllOtherSessions = async (
  userId: string,
  currentSessionId: string
): Promise<{ revokedCount: number }> => {
  const [sessionsResult] = await Promise.all([
    DeviceSession.updateMany(
      { userId, sessionId: { $ne: currentSessionId }, isActive: true },
      { isActive: false }
    ),
    RefreshToken.updateMany(
      { userId, sessionId: { $ne: currentSessionId }, isRevoked: false },
      { isRevoked: true }
    ),
  ]);

  const revokedCount = sessionsResult.modifiedCount;
  logger.info(`🚫 ${revokedCount} sessions revoked for user ${userId}`);

  return { revokedCount };
};

/**
 * Get the current user's profile.
 */
export const getMe = async (userId: string): Promise<UserDocument> => {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound("User");
  return user;
};
