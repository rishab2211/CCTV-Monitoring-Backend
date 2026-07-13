import { Types } from "mongoose";

// ─── User & Roles ─────────────────────────────────────────────────────────────

export type UserRole =
  | "super_admin"
  | "admin"
  | "franchise"
  | "operator"
  | "technician"
  | "customer";

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
  isActive: boolean;
  avatar?: string;
  address?: IAddress;

  // Role-specific sub-documents
  franchiseDetails?: IFranchiseDetails;
  operatorDetails?: IOperatorDetails;
  technicianDetails?: ITechnicianDetails;
  customerDetails?: ICustomerDetails;

  // Soft delete
  isDeleted: boolean;
  deletedAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  generateAccessToken(sessionId: string): string;
  generateRefreshToken(): string;
}

export interface IAddress {
  street?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

export interface IFranchiseDetails {
  territory?: {
    city: string;
    state: string;
    zone: string;
  };
  commissionRate?: number; // percentage
  royaltyRate?: number;    // percentage
  franchiseCode?: string;
}

export interface IOperatorDetails {
  shiftStart?: string; // "09:00"
  shiftEnd?: string;   // "21:00"
  isOnShift?: boolean;
  assignedCameras?: Types.ObjectId[];
}

export interface ITechnicianDetails {
  skills?: string[];
  certifications?: string[];
  assignedFranchise?: Types.ObjectId;
}

export interface ICustomerDetails {
  billingAddress?: IAddress;
  assignedFranchise?: Types.ObjectId;
  emergencyContact?: {
    name: string;
    phone: string;
    relation: string;
  };
}

// ─── JWT ─────────────────────────────────────────────────────────────────────

export interface JwtAccessPayload {
  userId: string;
  role: UserRole;
  sessionId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface JwtRefreshPayload {
  userId: string;
  tokenId: string; // UUID stored in the DB
  iat?: number;
  exp?: number;
}

// ─── Device Session ──────────────────────────────────────────────────────────

export interface IDeviceInfo {
  deviceName?: string;
  deviceType?: string; // 'mobile' | 'tablet' | 'desktop'
  os?: string;
  browser?: string;
  ipAddress?: string;
  userAgent?: string;
}

// ─── Auth Tokens Response ────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresIn: number; // seconds until access token expires
}

// ─── OTP Types ───────────────────────────────────────────────────────────────

export type OTPType = "forgot_password" | "verify_email";

// ─── Activity Log ─────────────────────────────────────────────────────────────

export type ActivityAction =
  | "LOGIN"
  | "LOGOUT"
  | "REGISTER"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET"
  | "PROFILE_UPDATED"
  | "AVATAR_UPDATED"
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_DELETED"
  | "USER_ACTIVATED"
  | "USER_DEACTIVATED"
  | "SESSION_REVOKED"
  | "ALL_SESSIONS_REVOKED"
  | "CAMERA_CREATED"
  | "CAMERA_UPDATED"
  | "CAMERA_DELETED"
  | "CAMERA_ASSIGNED"
  | "CAMERA_TRANSFERRED"
  | "CAMERA_RESTARTED";

export interface IActivityLog {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  action: ActivityAction;
  description: string;   // human-readable summary
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// ─── Camera Types ─────────────────────────────────────────────────────────────

export type CameraStatus = "online" | "offline" | "maintenance";

export interface ICamera {
  _id: Types.ObjectId;
  name: string;
  serialNumber: string;
  rtspUrl: string;
  status: CameraStatus;
  customerId?: Types.ObjectId;
  operatorIds: Types.ObjectId[];
  franchiseId?: Types.ObjectId;
  location?: ICameraLocation;
  health: ICameraHealth;
  settings: ICameraSettings;
  qrCode?: string;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICameraLocation {
  street?: string;
  city?: string;
  state?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
}

export interface ICameraHealth {
  cpuUsage?: number;
  memoryUsage?: number;
  temperature?: number;
  storageUsage?: number;
  lastPing?: Date;
}

export interface ICameraSettings {
  recordingEnabled: boolean;
  motionDetectionEnabled: boolean;
  aiFeaturesEnabled: boolean;
  recordingRetentionDays: number;
}

