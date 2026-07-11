import { Permission } from "../models/Permission";
import { Role } from "../models/Role";
import { logger } from "../utils/logger";

// ─── System Permission Definitions ───────────────────────────────────────────
// Format: { name: "resource:action", description }
// These are seeded once and kept in sync on every server startup.

const SYSTEM_PERMISSIONS = [
  // Users
  { name: "users:read",         resource: "users",         action: "read",         description: "View user list and profiles" },
  { name: "users:write",        resource: "users",         action: "write",        description: "Create and update users" },
  { name: "users:delete",       resource: "users",         action: "delete",       description: "Soft-delete user accounts" },
  { name: "users:manage_roles", resource: "users",         action: "manage_roles", description: "Assign and remove roles from users" },

  // Cameras
  { name: "cameras:read",       resource: "cameras",       action: "read",         description: "View camera list and details" },
  { name: "cameras:write",      resource: "cameras",       action: "write",        description: "Add and update cameras" },
  { name: "cameras:delete",     resource: "cameras",       action: "delete",       description: "Decommission cameras" },
  { name: "cameras:assign",     resource: "cameras",       action: "assign",       description: "Assign cameras to customers or operators" },
  { name: "cameras:restart",    resource: "cameras",       action: "restart",      description: "Remotely restart cameras" },
  { name: "cameras:configure",  resource: "cameras",       action: "configure",    description: "Change camera recording/motion/AI settings" },

  // Streams
  { name: "streams:view",       resource: "streams",       action: "view",         description: "View live camera streams" },

  // Recordings
  { name: "recordings:read",    resource: "recordings",    action: "read",         description: "View recording list and metadata" },
  { name: "recordings:download",resource: "recordings",    action: "download",     description: "Generate recording download links" },
  { name: "recordings:delete",  resource: "recordings",    action: "delete",       description: "Delete recordings" },

  // Alerts
  { name: "alerts:read",        resource: "alerts",        action: "read",         description: "View alerts and alert history" },
  { name: "alerts:write",       resource: "alerts",        action: "write",        description: "Create and acknowledge alerts" },
  { name: "alerts:resolve",     resource: "alerts",        action: "resolve",      description: "Mark alerts as resolved" },

  // SOS
  { name: "sos:trigger",        resource: "sos",           action: "trigger",      description: "Trigger an SOS emergency request" },
  { name: "sos:read",           resource: "sos",           action: "read",         description: "View SOS requests" },

  // Incidents
  { name: "incidents:read",     resource: "incidents",     action: "read",         description: "View incident reports" },
  { name: "incidents:write",    resource: "incidents",     action: "write",        description: "Create and update incidents" },

  // Franchises
  { name: "franchises:read",    resource: "franchises",    action: "read",         description: "View franchise details" },
  { name: "franchises:write",   resource: "franchises",    action: "write",        description: "Create and update franchises" },

  // Installations
  { name: "installations:read", resource: "installations", action: "read",         description: "View installation jobs" },
  { name: "installations:write",resource: "installations", action: "write",        description: "Create and update installation jobs" },

  // Analytics
  { name: "analytics:read",     resource: "analytics",     action: "read",         description: "View analytics dashboards and reports" },

  // Audit
  { name: "audit:read",         resource: "audit",         action: "read",         description: "View audit logs" },

  // Settings
  { name: "settings:read",      resource: "settings",      action: "read",         description: "View system settings" },
  { name: "settings:write",     resource: "settings",      action: "write",        description: "Update system settings" },

  // Payments
  { name: "payments:read",      resource: "payments",      action: "read",         description: "View payment and invoice records" },
  { name: "payments:write",     resource: "payments",      action: "write",        description: "Create payment orders and process subscriptions" },

  // Notifications
  { name: "notifications:read", resource: "notifications", action: "read",         description: "View in-app notifications" },

  // Talkback
  { name: "talkback:use",       resource: "talkback",      action: "use",          description: "Use audio talkback feature" },
] as const;

export type PermissionName = (typeof SYSTEM_PERMISSIONS)[number]["name"];

// ─── All permission names for easy import in permit middleware ─────────────────
export const ALL_PERMISSION_NAMES = SYSTEM_PERMISSIONS.map((p) => p.name);

// ─── Default Role → Permission Mappings ──────────────────────────────────────

const SYSTEM_ROLES = [
  {
    name: "super_admin",
    displayName: "Super Administrator",
    description: "Full system access — unrestricted",
    // Super admin gets ALL permissions
    permissions: SYSTEM_PERMISSIONS.map((p) => p.name),
  },
  {
    name: "admin",
    displayName: "System Administrator",
    description: "Manages users, cameras, alerts, and franchises within their scope",
    permissions: [
      "users:read", "users:write", "users:delete", "users:manage_roles",
      "cameras:read", "cameras:write", "cameras:delete", "cameras:assign",
      "cameras:restart", "cameras:configure",
      "streams:view",
      "recordings:read", "recordings:download", "recordings:delete",
      "alerts:read", "alerts:write", "alerts:resolve",
      "sos:read",
      "incidents:read", "incidents:write",
      "franchises:read", "franchises:write",
      "installations:read", "installations:write",
      "analytics:read",
      "audit:read",
      "settings:read",
      "payments:read",
      "notifications:read",
    ],
  },
  {
    name: "franchise",
    displayName: "Franchise Partner",
    description: "Manages customers and technicians in their territory",
    permissions: [
      "users:read", "users:write",
      "cameras:read",
      "streams:view",
      "recordings:read",
      "alerts:read",
      "franchises:read",
      "installations:read", "installations:write",
      "analytics:read",
      "payments:read",
      "notifications:read",
    ],
  },
  {
    name: "operator",
    displayName: "Monitoring Operator",
    description: "Monitors assigned cameras, manages alerts, handles incidents",
    permissions: [
      "cameras:read",
      "streams:view",
      "recordings:read",
      "alerts:read", "alerts:write", "alerts:resolve",
      "sos:read",
      "incidents:read", "incidents:write",
      "talkback:use",
      "notifications:read",
    ],
  },
  {
    name: "technician",
    displayName: "Field Technician",
    description: "Installs and maintains cameras on-site",
    permissions: [
      "cameras:read", "cameras:write",
      "installations:read", "installations:write",
      "notifications:read",
    ],
  },
  {
    name: "customer",
    displayName: "Customer",
    description: "Views their own cameras, recordings, and subscription",
    permissions: [
      "cameras:read",
      "streams:view",
      "recordings:read", "recordings:download",
      "sos:trigger",
      "payments:read",
      "notifications:read",
    ],
  },
] as const;

// ─── Seeder Function ──────────────────────────────────────────────────────────

/**
 * Idempotent seeder — runs on every server startup.
 * - Upserts all system permissions (adds new ones, never deletes old ones)
 * - Upserts all system roles with their permission sets
 *
 * Safe to run multiple times. Will not overwrite admin-customized role permissions
 * for system roles (uses $setOnInsert for permissions so they only set on first insert).
 */
export const seedPermissionsAndRoles = async (): Promise<void> => {
  try {
    logger.info("🌱 Seeding permissions and roles...");

    // ── Upsert all system permissions ──────────────────────────────────────
    const permissionOps = SYSTEM_PERMISSIONS.map((p) => ({
      updateOne: {
        filter: { name: p.name },
        update: {
          $set: {
            resource: p.resource,
            action: p.action,
            description: p.description,
            isSystem: true,
          },
        },
        upsert: true,
      },
    }));

    const permResult = await Permission.bulkWrite(permissionOps, { ordered: false });
    const permUpserted = permResult.upsertedCount;
    const permModified = permResult.modifiedCount;

    // ── Upsert system roles ────────────────────────────────────────────────
    // For system roles:
    //   - On INSERT: set name, displayName, description, isSystem, and permissions
    //   - On UPDATE: only update displayName and description (NOT permissions —
    //     so admins can customize a role's permissions and it won't be overwritten)
    const roleOps = SYSTEM_ROLES.map((r) => ({
      updateOne: {
        filter: { name: r.name },
        update: {
          $set: {
            displayName: r.displayName,
            description: r.description,
            isSystem: true,
          },
          // $setOnInsert only runs when a new document is being created
          $setOnInsert: {
            permissions: [...r.permissions],
          },
        },
        upsert: true,
      },
    }));

    const roleResult = await Role.bulkWrite(roleOps, { ordered: false });
    const roleUpserted = roleResult.upsertedCount;

    logger.info(
      `✅ Seed complete — ${permUpserted} permissions inserted, ${permModified} updated, ${roleUpserted} roles inserted`
    );
  } catch (error) {
    // Non-fatal — server continues even if seed fails
    logger.error("⚠️  Permission/role seed failed (non-fatal):", error);
  }
};
