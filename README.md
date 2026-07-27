<div align="center">

<h1>🎥 CCTV Monitoring Platform — Backend API</h1>

<p>An enterprise-grade, real-time B2B2C CCTV-as-a-Service backend built with <strong>Express.js</strong>, <strong>TypeScript</strong>, <strong>MongoDB</strong>, and <strong>Socket.IO</strong>.</p>

<p>
  <img alt="Bun" src="https://img.shields.io/badge/Runtime-Bun%20v1.3.14-black?logo=bun&logoColor=white"/>
  <img alt="TypeScript" src="https://img.shields.io/badge/Language-TypeScript%205.5-3178C6?logo=typescript&logoColor=white"/>
  <img alt="Express" src="https://img.shields.io/badge/Framework-Express.js%204-000000?logo=express&logoColor=white"/>
  <img alt="MongoDB" src="https://img.shields.io/badge/Database-MongoDB%208-47A248?logo=mongodb&logoColor=white"/>
  <img alt="Socket.IO" src="https://img.shields.io/badge/Realtime-Socket.IO%204-010101?logo=socket.io&logoColor=white"/>
  <img alt="Version" src="https://img.shields.io/badge/API%20Version-v2.0%20Multi--Tenant-blue"/>
  <img alt="License" src="https://img.shields.io/badge/License-Proprietary-red"/>
</p>

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [v2.0 Multi-Tenant Architecture](#-v20-multi-tenant-architecture-shift)
- [Business Architecture](#-business-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [API Modules](#-api-modules)
- [Authentication & Security](#-authentication--security)
- [Multi-Tenant Middleware Stack](#-multi-tenant-middleware-stack)
- [RBAC Matrix](#-rbac-matrix)
- [Real-time Events (Socket.IO)](#-real-time-events-socketio)
- [Background Jobs (Cron)](#-background-jobs-cron)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Running the Server](#-running-the-server)
- [Testing with Postman](#-testing-with-postman)
- [Deployment](#-deployment)

---

## 🔍 Overview

The CCTV Monitoring Platform is a **B2B2C CaaS (CCTV-as-a-Service)** system. A parent security company sells monitoring subscriptions through regional Franchise partners. Franchises register Customers, Technicians install cameras at customer premises, and Operators watch live feeds 24/7 from a centralised control room.

```
Company (Super Admin / Admin)  ← Global platform access, no tenant boundary
  └── Franchise Partners (Tenants)  ← Completely isolated islands of data
        ├── Franchise Admins  ← Manage the Franchise, its staff, and customers
        ├── Operators  ← Watch cameras and respond to alerts (tenant-scoped)
        ├── Technicians  ← Install and maintain cameras (tenant-scoped)
        └── Customers  ← End-users paying subscriptions (walled garden)
              └── Cameras (RTSP → MediaMTX → WebRTC → Operator / Customer)
                    └── Alerts → Operators → Incidents → Resolved
```

This backend serves **five distinct client applications**: Customer Mobile App, Operator Web Panel, Franchise Portal, Technician Mobile App, and the React Admin Dashboard — all from a single versioned REST API at `/api/v1`.

> **Total Coverage:** ~204 endpoints across 20 modules.

---

## 🏢 v2.0 Multi-Tenant Architecture Shift

> **This is the most significant architectural change in the platform's history.**

### What Changed

The API migrated from a **flat, role-based hierarchy** (v1.0) to a strict **Multi-Tenant, Franchise-Scoped** architecture (v2.0).

| Concern | v1.0 (Old) | v2.0 (Current) |
|---|---|---|
| Data Isolation | Per-user role checks | Strict `franchiseId` scoping |
| Franchise Data | Shared tables | Completely isolated tenant island |
| Middleware | `Auth → Role Check` | `Auth → TenantScope → Role → Permission` |
| JWT Payload | `userId`, `role` | `userId`, `role`, **`franchiseId`** |
| DB Queries | Unscoped or manual | Auto-filtered via `tenantScope` middleware |
| Franchise Admin Role | Did not exist | `franchise_admin` role added |

### The Core Tenant Isolation Pattern

Every resource query for Franchise-scoped users is now automatically filtered by `franchiseId`. Services spread `req.franchiseScope` into their MongoDB filter:

```typescript
// tenantScope middleware injects this into req object
// req.franchiseScope === null       → Super Admin / Admin (global, no filter)
// req.franchiseScope === "abc123"   → Franchise-scoped (filtered by franchiseId)

const filter = {
  isDeleted: false,
  ...(req.franchiseScope ? { franchiseId: req.franchiseScope } : {})
};
const cameras = await Camera.find(filter);
```

This means a Franchise Admin **physically cannot** access another franchise's data — not via ID guessing or any other method — because the database query itself has the tenant filter baked in.

### JWT Payload & Auth Response (v2.0)

When any user logs in, their JWT embeds their `franchiseId` directly:

```json
{
  "userId": "668abc123def456789012345",
  "role": "franchise_admin",
  "franchiseId": "669xyz456abc789012345678",
  "iat": 1752345600,
  "exp": 1752346500
}
```

You do **not** need to pass `franchiseId` manually in API query parameters. The middleware reads it from the token automatically.

> **Note on `/auth/me`**: The `GET /auth/me` endpoint returns the full `User` document (including `role` and `franchiseId`), but does **not** return a `permissions[]` array. Permissions are defined at the `Role` level (seeded via `src/config/permissions.seed.ts`) and checked via the `permit` middleware.

### Customer Walled Garden

Customer routes (`/customer/*`) are treated as a special "walled garden" scoped strictly to the authenticated `userId`. Customers can **only** access their own cameras, notifications, payments, and profile — never another customer's data.

---

## 🏗 Business Architecture

| Layer | Technology |
|---|---|
| REST API | Express.js 4 + TypeScript |
| Real-time | Socket.IO 4 (JWT-authenticated rooms) |
| Video Relay | MediaMTX (RTSP → WebRTC) |
| Push Notifications | Firebase FCM (Admin SDK) |
| File Storage | Cloudinary (recordings, photos, signatures) |
| Payments | Razorpay (one-time orders + webhooks) |
| Email | Nodemailer + SMTP (OTP, invoices, alerts) |
| Database | MongoDB 8 + Mongoose 8 |
| Scheduling | Node-cron (health checks, cleanups, expiry) |

---

## 🛠 Tech Stack

| Category | Package | Version |
|---|---|---|
| Runtime | Bun | 1.3.14 |
| Language | TypeScript | 5.5 |
| Framework | Express.js | 4.19 |
| ODM | Mongoose | 8.4 |
| WebSockets | Socket.IO | 4.8 |
| Validation | Zod | 3.23 |
| Auth | jsonwebtoken + bcryptjs | — |
| File Uploads | Multer | 2.2 |
| Media Storage | Cloudinary SDK | 2.3 |
| Push | Firebase Admin | 14.1 |
| Email | Nodemailer | 6.9 |
| Logging | Winston + DailyRotateFile | 3.13 |
| Security | Helmet + express-rate-limit | — |

---

## 📁 Project Structure

```
cctv-monitoring-backend/
├── index.ts                           # Bun entry point
├── package.json
├── tsconfig.json
├── env.example                        # Environment variable template
├── .gitignore
│
├── scripts/
│   └── merge_collections.js           # Merges modular Postman JSONs into one file
│
└── src/
    ├── app.ts                         # Express app setup (middleware, routes, error handler)
    ├── server.ts                      # HTTP server init + Socket.IO bootstrap + graceful shutdown
    │
    ├── config/
    │   ├── database.ts                # MongoDB connection
    │   ├── env.ts                     # Zod-validated environment variable exports
    │   ├── cloudinary.ts              # Cloudinary SDK initialiser
    │   ├── mediamtx.service.ts        # MediaMTX API client (path CRUD, stream tokens)
    │   └── permissions.seed.ts        # Auto-seeds roles & permissions on server boot
    │
    ├── controllers/                   # Thin handlers — all logic delegated to services
    │   ├── alert.controller.ts
    │   ├── analytics.controller.ts
    │   ├── audit.controller.ts
    │   ├── auth.controller.ts
    │   ├── billing.controller.ts
    │   ├── camera.controller.ts
    │   ├── customer.controller.ts
    │   ├── franchise.controller.ts
    │   ├── incident.controller.ts
    │   ├── job.controller.ts
    │   ├── notification.controller.ts
    │   ├── operator.controller.ts
    │   ├── recording.controller.ts
    │   ├── role.controller.ts
    │   ├── setting.controller.ts
    │   ├── sos.controller.ts
    │   ├── stream.controller.ts
    │   ├── talkback.controller.ts
    │   ├── ticket.controller.ts
    │   └── user.controller.ts
    │
    ├── middleware/
    │   ├── auth.ts                    # Verifies JWT → attaches req.user; also accepts X-System-Key
    │   ├── tenantScope.ts             # [NEW v2.0] Extracts franchiseId → attaches req.franchiseScope
    │   ├── authorize.ts               # Role guard: authorize('admin', 'super_admin')
    │   ├── permit.ts                  # Permission guard: permit('cameras:write')
    │   ├── validate.ts                # Zod schema validation (body / params / query)
    │   ├── upload.ts                  # Multer config for multipart file uploads
    │   ├── rateLimiter.ts             # 100/15min general; 10/15min on auth routes
    │   └── errorHandler.ts            # Global error handler: ApiError → JSON response
    │
    ├── models/                        # 26 Mongoose schemas
    │   ├── User.ts                    # Core user document (shared by all roles, has franchiseId)
    │   ├── Role.ts
    │   ├── Permission.ts              # Granular permission keys (e.g. cameras:write)
    │   ├── RefreshToken.ts            # Rotatable refresh token store
    │   ├── OTPVerification.ts         # Time-limited OTP codes
    │   ├── DeviceSession.ts           # Active login sessions per device
    │   ├── DeviceToken.ts             # FCM push notification tokens
    │   ├── Camera.ts                  # franchiseId field added for tenant isolation
    │   ├── StreamSession.ts           # Active WebRTC/RTSP stream sessions
    │   ├── Recording.ts               # Video recording metadata + Cloudinary refs
    │   ├── RecordingSchedule.ts       # Scheduled recording rules per camera
    │   ├── Alert.ts                   # Motion/sensor alert events (franchiseId scoped)
    │   ├── SosAlert.ts                # Panic/SOS events
    │   ├── TalkbackSession.ts         # Two-way audio call records
    │   ├── Incident.ts                # Incident reports with media attachments
    │   ├── Notification.ts            # In-app notification inbox items
    │   ├── Franchise.ts               # Franchise records + lead CRM
    │   ├── InstallationJob.ts         # Technician dispatch & checklist jobs
    │   ├── OperatorShift.ts           # Operator clock-in/out shift records
    │   ├── Plan.ts                    # Subscription plan tiers
    │   ├── Subscription.ts            # Customer subscription state
    │   ├── Payment.ts                 # Razorpay payment records
    │   ├── BillingInvoice.ts          # Generated invoice documents
    │   ├── Ticket.ts                  # Support ticket threads
    │   ├── SystemSetting.ts           # Global platform configuration
    │   └── ActivityLog.ts             # Audit trail for all write operations
    │
    ├── routes/
    │   ├── index.ts                   # Top-level router mounting /api/v1
    │   └── v1/
    │       ├── index.ts               # Aggregates all 20+ module sub-routers
    │       ├── auth.routes.ts
    │       ├── user.routes.ts
    │       ├── admin.routes.ts        # POST /admins (super_admin only)
    │       ├── roleUser.routes.ts     # /operators, /technicians, /customers
    │       ├── role.routes.ts
    │       ├── camera.routes.ts
    │       ├── stream.routes.ts       # WebRTC offer relay & session management
    │       ├── recording.routes.ts
    │       ├── alert.routes.ts
    │       ├── talkback.routes.ts
    │       ├── notification.routes.ts # Notification center & unread status
    │       ├── sos.routes.ts          # Emergency SOS panic module
    │       ├── incident.routes.ts
    │       ├── franchise.routes.ts
    │       ├── job.routes.ts
    │       ├── operator.routes.ts
    │       ├── operatorPanel.routes.ts
    │       ├── customer.routes.ts
    │       ├── billing.routes.ts      # Exports: planRouter, subscriptionRouter, paymentRouter, invoiceRouter
    │       ├── analytics.routes.ts
    │       ├── audit.routes.ts        # Exports: auditRouter, activityRouter
    │       ├── ticket.routes.ts
    │       └── setting.routes.ts
    │
    ├── services/                      # All business logic + external API calls
    │   ├── auth.service.ts            # Register, login, OTP, token rotation, device sessions
    │   ├── user.service.ts
    │   ├── role.service.ts
    │   ├── camera.service.ts          # CRUD, assignment, health, AI toggles (tenant-scoped)
    │   ├── stream.service.ts          # MediaMTX path management, WebRTC WHEP offer relay
    │   ├── recording.service.ts       # Segment tracking, Cloudinary upload, retention
    │   ├── alert.service.ts           # Alert lifecycle, triage rules, escalation (tenant-scoped)
    │   ├── sos.service.ts             # Panic dispatch, operator broadcast
    │   ├── talkback.service.ts        # WHIP session management
    │   ├── incident.service.ts        # Report creation, media, PDF export (tenant-scoped)
    │   ├── notification.service.ts    # FCM push, in-app inbox, preferences
    │   ├── billing.service.ts         # Plans, subscriptions, Razorpay, invoices
    │   ├── franchise.service.ts       # Franchise CRUD, leads CRM, commission reports
    │   ├── job.service.ts             # Installation dispatch, checklist, GPS (tenant-scoped)
    │   ├── operator.service.ts        # Shift management, camera assignment, performance
    │   ├── customer.service.ts        # Self-service panel, family sharing, subscription
    │   ├── analytics.service.ts       # Dashboard KPIs, revenue aggregations (tenant-aware)
    │   ├── audit.service.ts           # Write-op log queries
    │   ├── ticket.service.ts          # Support thread management
    │   ├── setting.service.ts         # System config read/write
    │   ├── socket.service.ts          # Socket.IO emit helpers (rooms, targeted broadcasts)
    │   └── email.service.ts           # Nodemailer: OTP, invoices, critical alert emails
    │
    ├── types/
    │   ├── index.ts                   # Shared interfaces, enums, JWT payload types
    │   └── express.d.ts               # Augments Express Request with req.user, req.franchiseScope
    │
    ├── utils/
    │   ├── ApiError.ts                # Custom error class with HTTP status factory methods
    │   ├── ApiResponse.ts             # Consistent success JSON response wrapper
    │   ├── catchAsync.ts              # Wraps async controllers → forwards errors to next()
    │   ├── helpers.ts                 # Shared utility functions
    │   ├── logger.ts                  # Winston logger (daily-rotating files)
    │   └── pagination.ts              # Reusable paginated DB query helper
    │
    ├── validators/                    # Zod request schemas (one file per module)
    │   ├── auth.validator.ts
    │   ├── user.validator.ts
    │   ├── role.validator.ts
    │   ├── camera.validator.ts
    │   ├── stream.validator.ts
    │   ├── recording.validator.ts
    │   ├── alert.validator.ts
    │   ├── sos.validator.ts
    │   ├── talkback.validator.ts
    │   ├── incident.validator.ts
    │   ├── notification.validator.ts
    │   ├── franchise.validator.ts
    │   ├── job.validator.ts
    │   ├── operator.validator.ts
    │   ├── customer.validator.ts
    │   ├── billing.validator.ts
    │   ├── audit.validator.ts
    │   └── ticket.validator.ts
    │
    └── logs/                          # Auto-generated by Winston (git-ignored)
        ├── cctv-YYYY-MM-DD.log        # Combined application logs
        └── error-YYYY-MM-DD.log       # Error-only logs
```

---

## 📡 API Modules

All routes are versioned under `/api/v1`. Total coverage: **~204 endpoints across 20 modules**.

| # | Module | Base Path | Key Capabilities |
|---|---|---|---|
| 01 | **Authentication** | `/auth` | Register, Login, OTP, Refresh Token (JSON Body), Active Session Revocation |
| 02 | **User Management** | `/users`, `/admins` | CRUD, role creation (super_admin vs admin bounds), status toggle |
| 03 | **Roles & Permissions** | `/roles`, `/permissions` | RBAC matrix CRUD, permission seeding |
| 04 | **Camera Management** | `/cameras` | Add, assign, transfer, restart, health check, AI/motion toggles |
| 05 | **Live Streaming** | `/streams` | WHEP offer relay (`POST /streams/:id/webrtc/offer`), session start/stop |
| 06 | **Recordings** | `/recordings` | List, playback (`/playback`), download, retention policy, schedule |
| 07 | **Alert Engine** | `/alerts` | Create, triage, acknowledge, escalate, resolve, alert rules |
| 08 | **Audio Talkback** | `/talkback` | Session tracking, WHIP URL, active call board |
| 09 | **Notifications** | `/notifications` | FCM push, in-app inbox (`GET`, `PATCH /read`, `PATCH /read-all`) |
| 10 | **SOS / Panic** | `/sos` | Trigger, broadcast, acknowledge, resolve, timeline (`GET /sos?status=active`) |
| 11 | **Incident Management** | `/incidents` | Report (multipart), assign, notes, media upload, `window.print()` PDF report JSON |
| 12 | **Franchise Management** | `/franchises` | CRUD, territory update, leads CRM, commission/royalty/sales reports |
| 13 | **Installations** | `/installations` | Job dispatch, checklist, photo/signature upload, GPS tracking |
| 14 | **Operator Panel** | `/operator` | Shift clock-in/out, assigned cameras, pending alerts, timeline |
| 15 | **Customer Panel** | `/customer` | Own cameras, live view, playback, subscription, family sharing |
| 16 | **Billing & Payments** | `/plans`, `/subscriptions`, `/payments`, `/invoices` | Razorpay orders, subscription lifecycle, refunds, PDF invoices |
| 17 | **Analytics** | `/analytics` | Dashboard KPIs, revenue, camera stats, operator performance (server-side date filtering) |
| 18 | **Audit Logs** | `/audit-logs`, `/activity-logs` | Write operation history, user activity timeline |
| 19 | **Support Tickets** | `/tickets` | Create, assign, comment thread, status management |
| 20 | **System Settings** | `/settings` | Platform config, recording defaults, notification thresholds, territory preferences |

---

## 🔐 Authentication & Security

### Token Lifecycle & Refresh Mechanism

```
POST /auth/login
  → accessToken  (15 min)  — returned in JSON response body (Authorization: Bearer header)
  → refreshToken (30 days) — returned in JSON response body ({ refreshToken: string })

POST /auth/refresh-token
  → Requires JSON request body: { refreshToken: string }
  → New accessToken & refreshToken pair issued
  → Old refreshToken rotated (reuse detected → full session invalidated)
```

### System / Hardware Authentication

Camera hardware and internal system services can bypass JWT by sending:

```
X-System-Key: <SYSTEM_API_KEY from .env>
```

This is used for camera heartbeat pings and automated webhook callbacks.

---

## 🛡 Multi-Tenant Middleware Stack

> **v2.0 Critical Change:** The middleware stack order has changed. `tenantScope` was inserted after `authenticate` and before `authorize`/`permit`.

### Full Stack Per Request

```
Rate Limiter → Helmet → CORS → authenticate → tenantScope → authorize/permit → validate → Controller
```

### Middleware Reference

| Middleware | File | Purpose |
|---|---|---|
| `helmet()` | built-in | XSS protection, HSTS, Content-Security-Policy headers |
| `express-rate-limit` | `rateLimiter.ts` | 100 req/15 min general; 10 req/15 min on auth routes |
| `authenticate` | `auth.ts` | Verifies JWT (`Authorization: Bearer`), attaches `req.user`; also accepts `X-System-Key` |
| `tenantScope` | `tenantScope.ts` | **[NEW v2.0]** Reads `franchiseId` from `req.user` → attaches `req.franchiseScope` (`null` for global, `string` for tenant) |
| `authorize(...roles)` | `authorize.ts` | Blocks if `req.user.role` is not in the allowed list |
| `permit(...permissions)` | `permit.ts` | Checks granular permission keys against the user's role (e.g. `cameras:write`) |
| `validate(schema)` | `validate.ts` | Zod schema — strips unknown fields, rejects malformed input |
| `errorHandler` | `errorHandler.ts` | Global Express error handler — converts `ApiError` instances to structured JSON |

### Role Aliases (authorize.ts convenience exports)

```typescript
isSuperAdmin      → authorize('super_admin')
isAdmin           → authorize('super_admin', 'admin')
isFranchiseOwner  → authorize('super_admin', 'franchise')
isFranchiseAdmin  → authorize('super_admin', 'admin', 'franchise', 'franchise_admin')
isOperator        → authorize('super_admin', 'admin', 'franchise_admin', 'operator')
isTechnician      → authorize('super_admin', 'admin', 'technician')
isCustomer        → authorize('customer')
```

---

## 🔑 RBAC Matrix & User Creation Boundaries

### Role Creation Rules

- `super_admin`: Can create `admin`, `franchise_admin`, `operator`, `technician`, `customer`.
- `admin`: Can create `franchise_admin`, `operator`, `technician`, `customer` (cannot create another `admin`).
- `franchise_admin`: Can create `operator`, `technician`, `customer` (cannot create `franchise_admin` or `admin`).

### Permissions Matrix

| Capability | Super Admin | Admin | Franchise | Franchise Admin | Operator | Technician | Customer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Global Platform Settings | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage All Franchises | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage Own Franchise | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage Franchise Staff | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage Cameras | ✅ | ✅ | ✅ | ✅ | ❌ | ✅† | ❌ |
| View Live Stream | ✅ | ✅ | ❌ | ❌ | ✅‡ | ❌ | ✅§ |
| Manage Alerts | ✅ | ✅ | ❌ | ✅ | ✅‡ | ❌ | ❌ |
| Audio Talkback | ❌ | ❌ | ❌ | ❌ | ✅‡ | ❌ | ❌ |
| View Analytics | ✅ | ✅ | ✅¶ | ✅¶ | ❌ | ❌ | ❌ |
| Billing & Plans | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅§ |
| Audit Logs | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

> `†` Technicians: camera access only during an active installation job
> `‡` Operators: only cameras/alerts explicitly assigned to them within their franchise
> `§` Customers: strictly their own cameras, subscriptions, and invoices (walled garden)
> `¶` Franchise / Franchise Admin: only their own franchise's territory data

---

## 🔌 Real-time Events (Socket.IO)

WebSocket connections require a valid JWT passed in the handshake `auth` object (`{ auth: { token: accessToken } }`). The server validates it using `socketAuth` middleware before allowing any room joins.

### Room Strategy

| Room Pattern | Subscribers / Membership | Join Mechanism | Events Delivered |
|---|---|---|---|
| `admin` | Super Admins, Admins | Client emits `join_room` with `{ room: 'admin' }` | All global system & telemetry events |
| `franchise_${franchiseId}` | Franchise Admins, Operators, Technicians | **Automatic** — server joins socket on connection via JWT `franchiseId` | Franchise-scoped alerts, SOS triggers |
| `camera_${cameraId}` | Assigned Operators, Camera Viewers | Client emits `join_camera` with `cameraId` (string) | `camera_online`, `camera_offline`, `camera_health`, `new_alert` |
| `notification:${userId}` | Target User | Global event name per user ID | User-targeted notifications |

### Event Reference

**Server → Client**

| Event | Payload | Triggered By |
|---|---|---|
| `camera_online` | `{ cameraId, timestamp }` | Heartbeat received after offline period |
| `camera_offline` | `{ cameraId, reason }` | Missed heartbeat timeout (cron) |
| `camera_health` | `{ cameraId, cpu, memory, temp }` | Health check cron |
| `new_alert` | Alert object | Camera sensor webhook / manual trigger |
| `alert_acknowledged` | `{ alertId, operatorId }` | Operator action |
| `alert_resolved` | `{ alertId, resolution }` | Operator action |
| `sos_triggered` | SOS object | Customer panic button |
| `sos_acknowledged` | `{ sosId, operatorId }` | Operator acknowledgement |
| `sos_resolved` | `{ sosId, timestamp }` | SOS resolution |
| `notification` | Notification object | User-targeted notification |

**Client → Server**

| Event | Payload | Purpose |
|---|---|---|
| `join_room` | `{ room: "admin" }` | Join admin room (Super Admin / Admin only) |
| `leave_room` | `{ room }` | Cleanly depart a room |
| `join_camera` | `cameraId` (string) | Join a specific camera's event room |
| `leave_camera` | `cameraId` (string) | Depart a specific camera's event room |

---

## ⏰ Background Jobs (Cron)

> Background jobs are implemented as scheduled tasks within the services layer, invoked by camera heartbeat webhooks, Razorpay payment webhooks, and time-based triggers on the server process.

| Job | Trigger | Effect |
|---|---|---|
| **Heartbeat Monitor** | Camera ping webhook | Marks cameras offline if no ping received in >3 min; emits `camera_offline` via Socket.IO |
| **Camera Health Check** | Periodic poll | Queries camera health metrics; emits `camera_health` to the `admin` room |
| **Recording Segment Upload** | Periodic | Bundles on-disk RTSP segments and uploads to Cloudinary; updates `Recording` timeline |
| **Subscription Expiry** | Daily | Scans subscriptions nearing expiry; sends push + email reminders |
| **Storage Retention Cleanup** | Daily | Deletes `Recording` documents older than the plan's retention period |
| **Token Cleanup** | Daily | Purges expired `RefreshToken` and `OTPVerification` documents from the database |
| **Stream Token Cleanup** | Periodic | Removes expired `StreamSession` tokens from the database |

---

## 🚀 Getting Started

### Prerequisites

| Requirement | Version |
|---|---|
| [Bun](https://bun.sh) | ≥ 1.3.14 |
| MongoDB | ≥ 7.0 (local or Atlas) |
| [MediaMTX](https://github.com/bluenviron/mediamtx) | Latest (for live streaming) |
| Firebase project | For FCM push notifications |
| Cloudinary account | For media/recording storage |
| Razorpay account | For payment processing |

### Installation

```bash
# 1. Obtain the source code from the project maintainer
cd cctv-monitoring-backend

# 2. Install dependencies
bun install

# 3. Configure environment variables
cp env.example .env
# → Edit .env with your credentials (see Environment Variables section)
```

### Seed Roles & Permissions

> **No manual step needed.** When the server starts for the first time, it automatically seeds all roles and permissions defined in `src/config/permissions.seed.ts`.

---

## 🔧 Environment Variables

Copy `env.example` to `.env` and fill in the values:

```env
# Server
NODE_ENV=development
PORT=5000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/cctv_monitoring

# JWT
ACCESS_TOKEN_SECRET=your_super_secret_access_token_key_min_32_chars
REFRESH_TOKEN_SECRET=your_super_secret_refresh_token_key_min_32_chars
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=30d

# OTP
OTP_EXPIRY_MINUTES=10

# SMTP (for OTP + transactional emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
EMAIL_FROM=CCTV Monitor <noreply@cctvmonitor.com>

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Firebase FCM
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your_project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"

# MediaMTX
MEDIAMTX_URL=http://localhost:9997
MEDIAMTX_API_URL=http://localhost:9997/v3
MEDIAMTX_STREAM_SECRET=your_mediamtx_stream_secret

# Razorpay
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_secret

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
AUTH_RATE_LIMIT_MAX=10

# CORS (comma-separated origins)
CORS_ORIGIN=http://localhost:3000,http://localhost:5173

# Internal System API Key (for camera hardware / webhook bypass)
SYSTEM_API_KEY=your_internal_system_api_key
```

---

## ▶️ Running the Server

```bash
# Development (hot reload via bun --watch)
bun run dev

# Production
bun run start

# Build to /dist
bun run build
```

**Health check:**
```bash
curl http://localhost:5000/api/health
```

---

## 🧪 Testing with Postman

A comprehensive **automated Postman collection** covering all 204 endpoints is available.

### Files

The Postman files are generated by scripts in the project. To generate:

```bash
# Generate the automated + merged Postman collection
node scripts/automate_tests.js
```

This produces `Complete_Postman_Collection_Automated.json`.

### Importing

1. Open **Postman** → Click **Import**.
2. Select `Complete_Postman_Collection_Automated.json`.
3. Also import `CCTV_Monitoring_Environment.json`.
4. From the top-right environment dropdown, select **"CCTV Monitoring Environment"**.

### How Automation Works

The Postman collection includes **auto-capture test scripts** on all `POST` creation endpoints. When you create a resource (e.g. `POST /cameras`), the test script automatically saves the returned `_id` to the environment (e.g. `{{cameraId}}`). All subsequent requests use these auto-populated variables — **no manual copy-pasting required**.

**Pre-configured auto-captures:**

| Endpoint | Variable Saved |
|---|---|
| `POST /auth/login` | `accessToken`, `refreshToken` |
| `POST /cameras` | `cameraId` |
| `POST /franchises` | `franchiseId` |
| `POST /users` | `userId` |
| `POST /incidents` | `incidentId` |
| `POST /alerts` | `alertId` |
| `POST /sos` | `sosId` |
| `POST /tickets` | `ticketId` |
| `POST /plans` | `planId` |
| `POST /subscriptions` | `subscriptionId` |

### Running the Full Suite

1. Click the **"CCTV Monitoring Backend - AUTOMATED"** collection.
2. Click **Run Collection**.
3. Postman will run all ~200+ requests sequentially, automatically using the tokens and IDs generated in earlier steps.

---

## 🚢 Deployment

The platform is designed to run on a **single Linux VPS** (Ubuntu 22.04 recommended):

```
VPS
├── Node.js / Bun  — Express API + Socket.IO (managed by PM2)
├── MediaMTX       — RTSP-to-WebRTC relay (systemd service)
├── Nginx          — Reverse proxy + SSL termination (Certbot)
└── MongoDB        — Local instance or Atlas connection string
```

**PM2 quick start:**
```bash
pm2 start "bun run start" --name cctv-api
pm2 save
pm2 startup
```

**Nginx proxy config snippet:**
```nginx
location /api/ {
    proxy_pass http://localhost:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}

# Socket.IO WebSocket upgrade
location /socket.io/ {
    proxy_pass http://localhost:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
}
```

---

## ⚖️ License

**This is proprietary software. All rights reserved.**

This codebase and all associated files are the exclusive intellectual property of the project owner. Unauthorized copying, distribution, modification, sublicensing, or use of this software — in whole or in part — without prior written permission from the owner is strictly prohibited.

© 2025–2026 CCTV Monitoring Platform. All rights reserved.
