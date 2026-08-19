import { Types } from "mongoose";

// ─── User & Roles ─────────────────────────────────────────────────────────────

export type UserRole =
  | "super_admin"
  | "admin"
  | "franchise"       // franchise owner — top of the franchise hierarchy
  | "franchise_admin" // manager appointed by the franchise owner
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

  notificationPreferences?: INotificationPreference;

  // Soft delete
  isDeleted: boolean;
  deletedAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  generateAccessToken(sessionId: string, franchiseId?: string): string;
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
  franchiseRef?: Types.ObjectId; // direct ref to the Franchise document (for owners & admins)
  territory?: {
    city: string;
    state: string;
    zone: string;
  };
  commissionRate?: number; // percentage
  royaltyRate?: number; // percentage
  franchiseCode?: string;
}

export interface IOperatorDetails {
  shiftStart?: string; // "09:00"
  shiftEnd?: string; // "21:00"
  isOnShift?: boolean;
  assignedCameras?: Types.ObjectId[];
  assignedFranchise?: Types.ObjectId;
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
  franchiseId?: string; // null for super_admin; set for franchise-scoped roles
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
  | "CAMERA_RESTARTED"
  | "INCIDENT_REPORTED"
  | "INCIDENT_STATUS_UPDATED"
  | "INCIDENT_ASSIGNED"
  | "SOS_TRIGGERED"
  | "SOS_ACKNOWLEDGED"
  | "SOS_RESOLVED"
  | "ROLE_CREATED"
  | "FRANCHISE_CREATED"
  | "FRANCHISE_UPDATED"
  | "FRANCHISE_SUSPENDED"
  | "JOB_CREATED"
  | "JOB_UPDATED"
  | "JOB_COMPLETED"
  | "OPERATOR_CLOCKED_IN"
  | "OPERATOR_CLOCKED_OUT"
  | "OPERATOR_CAMERAS_ASSIGNED"
  | "SUBSCRIPTION_CREATED"
  | "SUBSCRIPTION_CANCELED"
  | "INVOICE_GENERATED"
  | "STREAM_STARTED"
  | "STREAM_STOPPED"
  | "RECORDING_DELETED"
  | "SCHEDULE_UPDATED"
  | "RETENTION_UPDATED"
  | "ALERT_CREATED"
  | "ALERT_ACKNOWLEDGED"
  | "ALERT_RESOLVED"
  | "ALERT_ESCALATED"
  | "TALKBACK_STARTED"
  | "TALKBACK_STOPPED"
  | "INCIDENT_NOTE_ADDED"
  | "INCIDENT_MEDIA_UPLOADED"
  | "INCIDENT_CLOSED"
  | "INCIDENT_VERIFIED"
  | "SOS_NOTE_ADDED"
  | "SYSTEM_CONFIG_UPDATED"
  | "PAYMENT_REFUNDED"
  | "TICKET_CREATED"
  | "TICKET_UPDATED"
  | "TICKET_COMMENTED"
  | "TICKET_ASSIGNED"
  | "TICKET_CLOSED";

export interface IActivityLog {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  action: ActivityAction;
  description: string; // human-readable summary
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
  sharedWith: Types.ObjectId[];
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
  talkbackEnabled: boolean;
  alertRules?: any; // Generic rules configuration
}

// ─── Stream Session Types ─────────────────────────────────────────────────────

export interface IStreamSession {
  _id: Types.ObjectId;
  sessionId: string; // UUID — matches stream token payload
  cameraId: Types.ObjectId; // ref: Camera
  userId: Types.ObjectId; // ref: User — who is watching
  role: UserRole;
  startedAt: Date;
  endedAt?: Date | null;
  isActive: boolean;
  tokenHash: string; // SHA-256 of the issued stream token (for revocation)
  ipAddress?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── MediaMTX Types ─────────────────────────────────────────────────────────

export interface IMediaMTXPathConfig {
  source: string; // RTSP URL of the camera
  sourceProtocol?: "automatic" | "udp" | "tcp" | "multicast" | "tls";
  sourceOnDemand?: boolean; // Only pull RTSP when a client actually connects
  maxReaders?: number;
}

export interface IMediaMTXPath {
  name: string;
  ready: boolean;
  readyTime?: string;
  tracks: string[];
  bytesReceived: number;
  bytesSent: number;
  readers: number;
}

export interface IMediaMTXPathListResponse {
  pageCount: number;
  items: IMediaMTXPath[];
}

// ─── Recording Types ──────────────────────────────────────────────────────────

export type RecordingType = "continuous" | "motion" | "scheduled";
export type RecordingStatus = "recording" | "completed" | "failed" | "deleted";

export interface IRecording {
  _id: Types.ObjectId;
  cameraId: Types.ObjectId;
  franchiseId?: Types.ObjectId;
  startTime: Date;
  endTime?: Date;
  type: RecordingType;
  status: RecordingStatus;
  url: string;
  publicId?: string;
  sizeBytes: number;
  durationSeconds: number;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRecordingScheduleRule {
  daysOfWeek: number[]; // 0=Sunday, 6=Saturday
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  type: RecordingType;
}

export interface IRecordingSchedule {
  _id: Types.ObjectId;
  cameraId: Types.ObjectId;
  rules: IRecordingScheduleRule[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── System Settings Types ────────────────────────────────────────────────────

export interface ISystemSetting {
  _id: Types.ObjectId;
  key: string;
  value: any;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationPreference {
  alerts: { push: boolean; inApp: boolean; email: boolean };
  system: { push: boolean; inApp: boolean; email: boolean };
}

// ─── Alert Engine Types ───────────────────────────────────────────────────────

export type AlertType = "motion" | "fire" | "hazard" | "tampering" | "other";
export type AlertPriority = "low" | "medium" | "high" | "critical";
export type AlertStatus = "new" | "acknowledged" | "resolved" | "escalated";

export interface IAlert {
  _id: Types.ObjectId;
  cameraId: Types.ObjectId;
  franchiseId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  type: AlertType;
  priority: AlertPriority;
  status: AlertStatus;
  description?: string;
  assignedTo?: Types.ObjectId;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  resolutionNotes?: string;
  isVerified?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Audio Talkback Types ─────────────────────────────────────────────────────

export type TalkbackStatus = "active" | "completed" | "failed";

export interface ITalkbackSession {
  _id: Types.ObjectId;
  cameraId: Types.ObjectId;
  franchiseId?: Types.ObjectId;
  operatorId: Types.ObjectId;
  startedAt: Date;
  endedAt?: Date;
  durationSeconds?: number;
  status: TalkbackStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Notification & Device Types ──────────────────────────────────────────────

export type NotificationType = "alert" | "system" | "message";

export interface INotification {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  body: string;
  type: NotificationType;
  referenceId?: Types.ObjectId;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDeviceToken {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  token: string;
  deviceType: "android" | "ios" | "web";
  lastUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── SOS Module ───────────────────────────────────────────────────────────────

export type SosStatus = "active" | "acknowledged" | "resolved";

export interface ISosAlert {
  _id: Types.ObjectId;
  triggeredBy: Types.ObjectId;
  franchiseId?: Types.ObjectId;
  cameraId?: Types.ObjectId;
  location?: string;
  status: SosStatus;
  acknowledgedBy?: Types.ObjectId;
  acknowledgedAt?: Date;
  resolvedBy?: Types.ObjectId;
  resolvedAt?: Date;
  resolutionNotes?: string;
  notes?: {
    text: string;
    addedBy: Types.ObjectId;
    addedAt: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Incident Management Module ───────────────────────────────────────────────

export type IncidentType = "theft" | "vandalism" | "technical_issue" | "other";
export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "open" | "investigating" | "resolved" | "closed";

export interface IIncident {
  _id: Types.ObjectId;
  title: string;
  description: string;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  franchiseId?: Types.ObjectId;
  cameraId?: Types.ObjectId;
  reportedBy: Types.ObjectId;
  assignedTo?: Types.ObjectId;
  attachments: string[]; // URLs or local file paths
  resolutionNotes?: string;
  isVerified?: boolean;
  closedAt?: Date;
  notes?: {
    text: string;
    addedBy: Types.ObjectId;
    addedAt: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Franchise Management Module ──────────────────────────────────────────────

export type FranchiseStatus = "active" | "suspended";

export interface IFranchise {
  _id: Types.ObjectId;
  name: string;
  franchiseCode: string;
  ownerId: Types.ObjectId;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  status: FranchiseStatus;
  territory?: {
    city?: string;
    state?: string;
    zone?: string;
    description?: string;
  };
  leads?: {
    _id?: Types.ObjectId;
    name: string;
    phone?: string;
    email?: string;
    status: "new" | "contacted" | "qualified" | "converted" | "lost";
    notes?: string;
    createdAt?: Date;
    updatedAt?: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Technician / Installation Module ──────────────────────────────────────────

export type JobType = "installation" | "repair" | "maintenance";
export type JobStatus = "scheduled" | "in-progress" | "completed" | "cancelled";

export interface IInstallationJob {
  _id: Types.ObjectId;
  title: string;
  description: string;
  type: JobType;
  status: JobStatus;
  assignedTechnician: Types.ObjectId;
  franchiseId?: Types.ObjectId;
  cameraId?: Types.ObjectId;
  scheduledAt: Date;
  completedAt?: Date;
  notes?: string;
  attachments: string[];
  customerSignature?: string;
  checklist?: { item: string; checked: boolean; checkedAt?: Date }[];
  gpsLocation?: { lat: number; lng: number; updatedAt: Date };
  updatedAt: Date;
}

// ─── Operator Module ──────────────────────────────────────────────────────────

export interface IOperatorShift {
  _id: Types.ObjectId;
  operatorId: Types.ObjectId;
  startTime: Date;
  endTime?: Date;
  handoverNotes?: string;
  metrics: {
    incidentsResolved: number;
    sosAcknowledged: number;
  };
  updatedAt: Date;
}

// ─── Customer / Subscription Module ───────────────────────────────────────────

export type SubscriptionStatus = "active" | "past_due" | "canceled";

export interface ISubscription {
  _id: Types.ObjectId;
  customerId: Types.ObjectId;
  franchiseId?: Types.ObjectId;
  planId: Types.ObjectId;
  planName: string;
  status: SubscriptionStatus;
  startDate: Date;
  endDate: Date;
  price: number;
  createdAt: Date;
  updatedAt: Date;
}

export type InvoiceStatus = "paid" | "pending" | "failed";

export interface IBillingInvoice {
  _id: Types.ObjectId;
  customerId: Types.ObjectId;
  franchiseId?: Types.ObjectId;
  subscriptionId: Types.ObjectId;
  amount: number;
  status: InvoiceStatus;
  invoiceUrl?: string;
  billingDate: Date;
  createdAt: Date;
  updatedAt: Date;
}
