/**
 * @file audit.service.ts
 * @description Business logic for Audit Logs and Activity Logs (Module 18).
 * Both map to the underlying ActivityLog collection, but Audit Logs typically 
 * filter for administrative or system-level actions.
 */
import { ActivityLog } from "../models/ActivityLog";
import { ApiError } from "../utils/ApiError";
import { JwtAccessPayload } from "../types";

const ensureAdmin = (user: JwtAccessPayload) => {
  if (user.role !== "admin" && user.role !== "super_admin") {
    throw ApiError.forbidden("Access restricted to administrators");
  }
};

/**
 * List Audit Logs
 * Typically lists system configuration, role, or destructive actions.
 */
export const listAuditLogs = async (query: any, user: JwtAccessPayload) => {
  ensureAdmin(user);

  const { page = 1, limit = 20, action } = query;
  const skip = (Number(page) - 1) * Number(limit);

  // Define what we consider "Audit" level actions
  const auditActions = [
    "SYSTEM_CONFIG_UPDATED",
    "ROLE_CREATED",
    "PAYMENT_REFUNDED",
    "USER_DELETED",
    "FRANCHISE_SUSPENDED",
    "USER_DEACTIVATED",
    "ALL_SESSIONS_REVOKED"
  ];

  const filter: any = { action: { $in: auditActions } };
  if (action) {
    // If they filter by a specific action, ensure it's in the audit list
    if (!auditActions.includes(action)) {
      throw ApiError.badRequest(`Action ${action} is not an audit action`);
    }
    filter.action = action;
  }

  const [logs, total] = await Promise.all([
    ActivityLog.find(filter)
      .skip(skip)
      .limit(Number(limit))
      .sort({ createdAt: -1 })
      .populate("userId", "name email role")
      .lean(),
    ActivityLog.countDocuments(filter)
  ]);

  return { logs, total, page: Number(page), limit: Number(limit) };
};

/**
 * Get Audit Log Details
 */
export const getAuditLogDetail = async (id: string, user: JwtAccessPayload) => {
  ensureAdmin(user);
  const log = await ActivityLog.findById(id).populate("userId", "name email role").lean();
  if (!log) throw ApiError.notFound("Log not found");
  return log;
};

/**
 * List Activity Logs (General user activity)
 */
export const listActivityLogs = async (query: any, user: JwtAccessPayload) => {
  ensureAdmin(user);

  const { page = 1, limit = 20, action } = query;
  const skip = (Number(page) - 1) * Number(limit);

  const filter: any = {};
  if (action) filter.action = action;

  const [logs, total] = await Promise.all([
    ActivityLog.find(filter)
      .skip(skip)
      .limit(Number(limit))
      .sort({ createdAt: -1 })
      .populate("userId", "name email role")
      .lean(),
    ActivityLog.countDocuments(filter)
  ]);

  return { logs, total, page: Number(page), limit: Number(limit) };
};

/**
 * List Activity Logs for a specific user
 */
export const getUserActivityLogs = async (userId: string, query: any, user: JwtAccessPayload) => {
  ensureAdmin(user);

  const { page = 1, limit = 20, action } = query;
  const skip = (Number(page) - 1) * Number(limit);

  const filter: any = { userId };
  if (action) filter.action = action;

  const [logs, total] = await Promise.all([
    ActivityLog.find(filter)
      .skip(skip)
      .limit(Number(limit))
      .sort({ createdAt: -1 })
      .lean(),
    ActivityLog.countDocuments(filter)
  ]);

  return { logs, total, page: Number(page), limit: Number(limit) };
};
