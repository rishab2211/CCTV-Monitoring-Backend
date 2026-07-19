<div align="center">

<h1>🎥 CCTV Monitoring Platform — Backend API</h1>

<p>An enterprise-grade, real-time B2B2C CCTV-as-a-Service backend built with <strong>Express.js</strong>, <strong>TypeScript</strong>, <strong>MongoDB</strong>, and <strong>Socket.IO</strong>.</p>

<p>
  <img alt="Node.js" src="https://img.shields.io/badge/Runtime-Bun%20v1.3.14-black?logo=bun&logoColor=white"/>
  <img alt="TypeScript" src="https://img.shields.io/badge/Language-TypeScript%205.5-3178C6?logo=typescript&logoColor=white"/>
  <img alt="Express" src="https://img.shields.io/badge/Framework-Express.js%204-000000?logo=express&logoColor=white"/>
  <img alt="MongoDB" src="https://img.shields.io/badge/Database-MongoDB%208-47A248?logo=mongodb&logoColor=white"/>
  <img alt="Socket.IO" src="https://img.shields.io/badge/Realtime-Socket.IO%204-010101?logo=socket.io&logoColor=white"/>
  <img alt="License" src="https://img.shields.io/badge/License-Proprietary-red"/>
</p>

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Business Architecture](#-business-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [API Modules](#-api-modules)
- [Authentication & Security](#-authentication--security)
- [Real-time Events (Socket.IO)](#-real-time-events-socketio)
- [Background Jobs (Cron)](#-background-jobs-cron)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Running the Server](#-running-the-server)
- [Deployment](#-deployment)

---

## 🔍 Overview

The CCTV Monitoring Platform is a **B2B2C CaaS (CCTV-as-a-Service)** system. A parent security company sells monitoring subscriptions through regional Franchise partners. Franchises register Customers, Technicians install cameras at customer premises, and Operators watch live feeds 24/7 from a centralised control room.

```
Company (Super Admin / Admin)
  └── Franchise Partners
        └── Customers
              └── Cameras (RTSP → MediaMTX → WebRTC → Operator / Customer)
                    └── Alerts → Operators → Incidents → Resolved
```

This backend serves **five distinct client applications**: Customer Mobile App, Operator Web Panel, Franchise Portal, Technician Mobile App, and the React Admin Dashboard — all from a single versioned REST API at `/api/v1`.

---

## 🏗 Business Architecture

![Architecture Overview](https://mermaid.ink/svg/pako:eNptUt1u2jAUfhXLFxOVAKUkISEXkyDQqVMhiESjW7MLh5wFr42NbKeCIm73AHvEPclOYC3NWl_5fPp-zjn2nq5kDjSghWKbNUlGqSB4dJWdgJSO2OoeRE5iUI98BTqlJ0p9hvPru5ROthsFWnd_arKYxEmNpvT7mbWMkRRLtDHd6-hoBKrBCBfRDDkzbIWESgryWWb6hYHpqXjT12RrQAn28G5j0-QW_aaQc4bXf5GktUjiOfnz6zdZQrZIwotGE1fhFDVXXEHGNNQlac0rvSYzafgPvmKGS6GbmvBmjJrwQVY5F0ztSGuoNRjygXzhOUgMLkoQhsRGKlZAUzwffkXxgj1JtWEojasMhZGAjuElkEjloF7lvb-GMTOM3LBdvdFX80ezT9FdaypFIccjUpPqoS7eWuFjYegyJp3Ox5PsjB-h5LYJ4F6aAO6gCeBcJ6B-1v99XzD0oW38djyngVEVtGkJqmR1Sfc1N6VmDSWkNMBrztR9PeABNRsmvklZPsuUrIr1c1FtcmZgzBnu58zAeUGFshKGBu7RgAZ7uqXBpWV3Hd_3erZl9W3f7_fadEcD23K7vuPantNzB5bjeYc2fTpGWl3fcpyB1fddp98buJfe4S9O1PPZ)

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
│   ├── generate-postman.js            # Auto-compiles Postman collection from MD guides
│   └── CCTV_API_Collection.json       # Generated Postman collection (do not edit manually)
│
├── docs/
│   ├── architecture_overview.png      # Architecture diagram
│   └── alert_sequence_flow.png        # Real-time alert pipeline sequence diagram
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
    │   ├── auth.ts                    # Verifies JWT, attaches req.user
    │   ├── authorize.ts               # Role guard: authorize('admin', 'super_admin')
    │   ├── permit.ts                  # Permission guard: permit('cameras:write')
    │   ├── validate.ts                # Zod schema validation (body / params / query)
    │   ├── upload.ts                  # Multer config for multipart file uploads
    │   ├── rateLimiter.ts             # 100/15min general; 10/15min on auth routes
    │   └── errorHandler.ts            # Global error handler: ApiError → JSON response
    │
    ├── models/                        # 26 Mongoose schemas
    │   ├── User.ts                    # Core user document (shared by all roles)
    │   ├── Role.ts
    │   ├── Permission.ts              # Granular permission keys (e.g. cameras:write)
    │   ├── RefreshToken.ts            # Rotatable refresh token store
    │   ├── OTPVerification.ts         # Time-limited OTP codes
    │   ├── DeviceSession.ts           # Active login sessions per device
    │   ├── DeviceToken.ts             # FCM push notification tokens
    │   ├── Camera.ts
    │   ├── StreamSession.ts           # Active WebRTC/RTSP stream sessions
    │   ├── Recording.ts               # Video recording metadata + Cloudinary refs
    │   ├── RecordingSchedule.ts       # Scheduled recording rules per camera
    │   ├── Alert.ts                   # Motion/sensor alert events
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
    │       ├── admin.routes.ts
    │       ├── roleUser.routes.ts     # /operators, /technicians, /customers
    │       ├── role.routes.ts
    │       ├── camera.routes.ts
    │       ├── stream.routes.ts
    │       ├── recording.routes.ts
    │       ├── alert.routes.ts
    │       ├── talkback.routes.ts
    │       ├── notification.routes.ts
    │       ├── sos.routes.ts
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
    │   ├── camera.service.ts          # CRUD, assignment, health, AI toggles
    │   ├── stream.service.ts          # MediaMTX path management, WebRTC tokens
    │   ├── recording.service.ts       # Segment tracking, Cloudinary upload, retention
    │   ├── alert.service.ts           # Alert lifecycle, triage rules, escalation
    │   ├── sos.service.ts             # Panic dispatch, operator broadcast
    │   ├── talkback.service.ts        # WHIP session management
    │   ├── incident.service.ts        # Report creation, media, PDF export
    │   ├── notification.service.ts    # FCM push, in-app inbox, preferences
    │   ├── billing.service.ts         # Plans, subscriptions, Razorpay, invoices
    │   ├── franchise.service.ts       # Franchise CRUD, leads CRM, commission reports
    │   ├── job.service.ts             # Installation dispatch, checklist, GPS
    │   ├── operator.service.ts        # Shift management, camera assignment, performance
    │   ├── customer.service.ts        # Self-service panel, family sharing, subscription
    │   ├── analytics.service.ts       # Dashboard KPIs, revenue aggregations
    │   ├── audit.service.ts           # Write-op log queries
    │   ├── ticket.service.ts          # Support thread management
    │   ├── setting.service.ts         # System config read/write
    │   ├── socket.service.ts          # Socket.IO emit helpers (rooms, targeted broadcasts)
    │   └── email.service.ts           # Nodemailer: OTP, invoices, critical alert emails
    │
    ├── types/
    │   ├── index.ts                   # Shared interfaces, enums, JWT payload types
    │   └── express.d.ts               # Augments Express Request with req.user
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
| 01 | **Authentication** | `/auth` | Register, Login, OTP, Refresh Token, Session Management |
| 02 | **User Management** | `/users`, `/admins` | CRUD, role assignment, status toggle, activity logs |
| 03 | **Roles & Permissions** | `/roles`, `/permissions` | RBAC matrix CRUD, permission seeding |
| 04 | **Camera Management** | `/cameras` | Add, assign, transfer, restart, health check, AI/motion toggles |
| 05 | **Live Streaming** | `/streams` | MediaMTX path management, WebRTC token generation, signalling |
| 06 | **Recordings** | `/recordings` | List, playback, download, retention policy, schedule |
| 07 | **Alert Engine** | `/alerts` | Create, triage, acknowledge, escalate, resolve, alert rules |
| 08 | **Audio Talkback** | `/talkback` | Session tracking, WHIP URL, active call board |
| 09 | **Notifications** | `/notifications` | FCM push, in-app list, preferences, device token registration |
| 10 | **SOS / Panic** | `/sos` | Trigger, broadcast, acknowledge, resolve, timeline |
| 11 | **Incident Management** | `/incidents` | Report (multipart), assign, notes, media upload, PDF report |
| 12 | **Franchise Management** | `/franchises` | CRUD, territory, leads CRM, commission/royalty/sales reports |
| 13 | **Installations** | `/installations` | Job dispatch, checklist, photo/signature upload, GPS tracking |
| 14 | **Operator Panel** | `/operator` | Shift clock-in/out, assigned cameras, pending alerts, timeline |
| 15 | **Customer Panel** | `/customer` | Own cameras, live view, playback, subscription, family sharing |
| 16 | **Billing & Payments** | `/plans`, `/subscriptions`, `/payments`, `/invoices` | Razorpay orders, subscription lifecycle, refunds, PDF invoices |
| 17 | **Analytics** | `/analytics` | Dashboard KPIs, revenue, camera stats, operator performance |
| 18 | **Audit Logs** | `/audit-logs`, `/activity-logs` | Write operation history, user activity timeline |
| 19 | **Support Tickets** | `/tickets` | Create, assign, comment thread, status management |
| 20 | **System Settings** | `/settings` | Platform config, recording defaults, notification thresholds |

---

## 🔐 Authentication & Security

### Token Lifecycle

```
POST /auth/login
  → accessToken  (15 min)   — sent in Authorization: Bearer header
  → refreshToken (30 days)  — stored in HttpOnly cookie

POST /auth/refresh-token
  → New accessToken issued
  → Old refreshToken rotated (reuse detected → full session invalidated)
```

### Middleware Stack (Applied per request)

```
Rate Limiter → Helmet → CORS → JWT Verify → Role Check → Permission Check → Zod Validate → Controller
```

| Middleware | Purpose |
|---|---|
| `helmet()` | XSS protection, HSTS, Content-Security-Policy headers |
| `express-rate-limit` | 100 req/15 min general; 10 req/15 min on auth routes |
| `authenticate` | Verifies JWT (`Authorization: Bearer`), attaches `req.user`; also accepts `X-System-Key` for internal hardware requests |
| `authorize(...roles)` | Blocks if `req.user.role` is not in the allowed list |
| `permit(...permissions)` | Checks granular permission keys against the user's role (e.g. `cameras:write`) |
| `validate(schema)` | Zod schema — strips unknown fields, rejects malformed input |
| `errorHandler` | Global Express error handler — converts `ApiError` instances to structured JSON |

### RBAC Matrix

| Capability | Super Admin | Admin | Franchise | Operator | Technician | Customer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Manage Admins | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage Franchises | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage Cameras | ✅ | ✅ | ❌ | ❌ | ✅* | ❌ |
| View Live Stream | ✅ | ✅ | ❌ | ✅** | ❌ | ✅*** |
| Manage Alerts | ✅ | ✅ | ❌ | ✅** | ❌ | ❌ |
| Audio Talkback | ❌ | ❌ | ❌ | ✅** | ❌ | ❌ |
| View Analytics | ✅ | ✅ | ✅**** | ❌ | ❌ | ❌ |
| System Settings | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

> `*` Technicians: only during active installation job  
> `**` Operators: only cameras assigned to them  
> `***` Customers: only their own cameras  
> `****` Franchise: only their territory data  

---

## 🔌 Real-time Events (Socket.IO)

WebSocket connections require a valid JWT passed in the handshake `auth` object. The server validates it using `socketAuth` middleware before allowing any room joins.

### Room Strategy

| Room | Subscribers | Events Received |
|---|---|---|
| `admin` | Super Admins, Admins | All global events |
| `operator` | All Operators | SOS triggers, shift changes |
| `camera_<id>` | Assigned Operators, Owner Customer | `new_alert`, stream start/stop |
| `customer_<id>` | Individual Customer | `alert_resolved`, `notification` |

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
| `recording_started` | `{ cameraId }` | Cron segment upload started |
| `notification` | Notification object | Any system event targeting the user |

**Client → Server**

| Event | Payload | Purpose |
|---|---|---|
| `join_room` | `{ room }` | Join `admin`, `operator`, or `camera_<id>` |
| `leave_room` | `{ room }` | Cleanly depart a room |
| `subscribe_camera` | `{ cameraId }` | Join a specific camera's event room |

![Alert Sequence Flow](docs/alert_sequence_flow.png)

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
```

---

## ⚖️ License

**This is proprietary software. All rights reserved.**

This codebase and all associated files are the exclusive intellectual property of the project owner. Unauthorized copying, distribution, modification, sublicensing, or use of this software — in whole or in part — without prior written permission from the owner is strictly prohibited.

© 2025 CCTV Monitoring Platform. All rights reserved.
