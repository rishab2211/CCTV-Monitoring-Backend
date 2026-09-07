# 🧪 CCTV Monitoring Platform — Master API Testing Guide (v2.0)

**Base URL:** `http://localhost:5000/api/v1`  
**Server Start:** `bun run dev` (or `npm run dev`)  
**Health Check:** `curl http://localhost:5000/api/health`  
**WebSocket URL:** `ws://localhost:5000`

> 💾 Store the `accessToken`, `refreshToken`, and entity IDs (`cameraId`, `franchiseId`, `incidentId`, etc.) from responses — you'll need them for subsequent and protected routes.

---

## 🏢 Multi-Tenant JWT Scoping (v2.0)

When any user (`franchise`, `franchise_admin`, `operator`, `technician`, etc.) logs in or registers, their JWT token automatically embeds their `userId`, `role`, and `franchiseId`. This token payload is the trusted source of truth used by all downstream services (Cameras, Alerts, Incidents, Jobs, CRM Leads) to enforce strict tenant isolation boundaries.

- **Global Admins (`super_admin`, `admin`)**: `franchiseId` is `null` (global platform access, no tenant filter).
- **Tenant Staff (`franchise_admin`, `operator`, `technician`)**: Database queries automatically filter by `franchiseId`.
- **Customer Walled Garden (`customer`)**: Routes under `/customer/*` are strictly scoped to `req.user.userId`.

---

## 📑 Table of Contents

1. [Global Request Headers & Conventions](#1-global-request-headers--conventions)
2. [Standard Response & Error Schemas](#2-standard-response--error-schemas)
3. [Module 01: Authentication & Session Lifecycle (`/auth`)](#module-01-authentication--session-lifecycle)
4. [Module 02: User Management & Directory (`/users`, `/admins`, `/franchise-admins`, `/operators`, `/technicians`, `/customers`)](#module-02-user-management--directory)
5. [Module 03: Roles & Permissions Matrix (`/roles`, `/permissions`)](#module-03-roles--permissions-matrix)
6. [Module 04: Camera Management & Controls (`/cameras`)](#module-04-camera-management--controls)
7. [Module 05: Live Streaming & WebRTC Relay (`/streams`)](#module-05-live-streaming--webrtc-relay)
8. [Module 06: Video Recordings, Retention & Schedules (`/recordings`)](#module-06-video-recordings-retention--schedules)
9. [Module 07: Alert Engine & Automated Triage (`/alerts`)](#module-07-alert-engine--automated-triage)
10. [Module 08: Two-Way Audio Talkback (`/talkback`)](#module-08-two-way-audio-talkback)
11. [Module 09: Notifications & FCM Push Tokens (`/notifications`)](#module-09-notifications--fcm-push-tokens)
12. [Module 10: Emergency SOS & Panic Dispatch (`/sos`)](#module-10-emergency-sos--panic-dispatch)
13. [Module 11: Incident Management & Evidence (`/incidents`)](#module-11-incident-management--evidence)
14. [Module 12: Franchise Management, CRM & Territory (`/franchises`)](#module-12-franchise-management-crm--territory)
15. [Module 13: Field Installations & Technician Dispatch (`/installations`, `/jobs`)](#module-13-field-installations--technician-dispatch)
16. [Module 14: Operator Shifts & Control Room Panel (`/operators`, `/operator`)](#module-14-operator-shifts--control-room-panel)
17. [Module 15: Customer Self-Service Panel (`/customer`, `/customers`)](#module-15-customer-self-service-panel)
18. [Module 16: Billing, Subscriptions, Payments & Invoices (`/plans`, `/subscriptions`, `/payments`, `/invoices`)](#module-16-billing-subscriptions-payments--invoices)
19. [Module 17: Analytics & Reporting Aggregations (`/analytics`)](#module-17-analytics--reporting-aggregations)
20. [Module 18: System Audit & Activity Trails (`/audit-logs`, `/activity-logs`)](#module-18-system-audit--activity-trails)
21. [Module 19: Support Tickets & Helpdesk (`/tickets`)](#module-19-support-tickets--helpdesk)
22. [Module 20: System Settings (`/settings`)](#module-20-system-settings)
23. [Real-time WebSocket Testing (Socket.IO v4)](#23-real-time-websocket-testing-socketio-v4)
24. [Global Edge Cases & Failure Modes](#24-global-edge-cases--failure-modes)
25. [Multi-Tenant Boundary Penetration Checklist](#25-multi-tenant-boundary-penetration-checklist)
26. [End-to-End Quick Test Shell Script](#26-end-to-end-quick-test-shell-script)

---

## 1. Global Request Headers & Conventions

| Request Type | Required Headers | Description |
|---|---|---|
| **Public Requests** | `Content-Type: application/json` | Registration, login, OTP endpoints |
| **Authenticated Requests** | `Authorization: Bearer <accessToken>` | Injects `req.user` (`userId`, `role`, `franchiseId`) |
| **Hardware / System Key** | `X-System-Key: <SYSTEM_API_KEY>` | Camera heartbeat, webhook ingestion |
| **Multipart Uploads** | `Authorization: Bearer <accessToken>` | Do not set `Content-Type` manually (boundary auto-set) |

---

## 2. Standard Response & Error Schemas

### Standard Success Response (`ApiResponse`)
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation completed successfully",
  "data": { ... }
}
```

### Standard Error Response (`ApiError`)
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "Invalid email address format" }
  ]
}
```

---

## Module 01: Authentication & Session Lifecycle

**Base Path:** `/api/v1/auth`

### Testing Flow
```
1. Register (/auth/register)           → Get access & refresh tokens
2. Login (/auth/login)                 → Get JWT with embedded franchiseId
3. Get Profile (/auth/me)              → Verify token payload & profile
4. Refresh Token (/auth/refresh-token) → Verify token rotation
5. Change Password (/auth/change-password) → Update credentials
6. Active Sessions (/auth/sessions)    → View connected devices
7. Forgot Password (/auth/forgot-password) → Trigger OTP email
8. Verify OTP (/auth/verify-otp)       → Verify 6-digit code
9. Reset Password (/auth/reset-password) → Set new password with resetToken
10. Revoke Session (/auth/sessions/:id)→ Invalidate specific device
11. Logout (/auth/logout)              → Terminate active session
```

---

### 1.1 Health Check
```bash
curl -X GET http://localhost:5000/api/health
```
**Response `200`:**
```json
{
  "success": true,
  "message": "CCTV Monitoring API is running",
  "version": "1.0.0",
  "timestamp": "2026-08-20T00:00:00.000Z",
  "environment": "development"
}
```

---

### 1.2 POST `/auth/register`
**Rate limit:** 10 requests / 15 min per IP

#### ✅ Happy Path
```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Super Admin",
    "email": "admin@cctvmonitor.com",
    "phone": "9876543210",
    "password": "Admin@1234Password",
    "role": "super_admin"
  }'
```
**Response `201`:**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "User registered successfully",
  "data": {
    "user": {
      "_id": "668abc123def456789012345",
      "name": "Super Admin",
      "email": "admin@cctvmonitor.com",
      "phone": "9876543210",
      "role": "super_admin",
      "isActive": true,
      "createdAt": "2026-08-20T00:00:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "d8f3a9e1..."
    }
  }
}
```
> 💾 **Save:** `accessToken`, `refreshToken`

#### ❌ Edge Cases
- **Duplicate Email:** Resend same registration -> `409 Conflict` (`"Email or phone number already in use"`).
- **Weak Password:** Password `< 8` chars or no number -> `400 Bad Request` (`"Password must contain at least 8 characters, one uppercase letter, and one number"`).
- **Invalid Role:** Role set to `"hacker"` -> `400 Bad Request` (`"Invalid role"`).

---

### 1.3 POST `/auth/login`
**Rate limit:** 10 requests / 15 min per IP

#### ✅ Login with Email
```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@cctvmonitor.com",
    "password": "Admin@1234Password"
  }'
```
**Response `200`:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Login successful",
  "data": {
    "user": {
      "_id": "668abc123def456789012345",
      "name": "Super Admin",
      "email": "admin@cctvmonitor.com",
      "role": "super_admin",
      "franchiseId": null
    },
    "tokens": {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "f7a1b2c3..."
    }
  }
}
```

#### ❌ Edge Cases
- **Wrong Password:** `401 Unauthorized` (`"Invalid credentials"`).
- **Non-existent Email:** `401 Unauthorized` (`"Invalid credentials"` — generic message prevents user enumeration).
- **Suspended Franchise Account:** User whose assigned franchise is `"suspended"` -> `403 Forbidden` (`"Your franchise has been suspended. Please contact platform support."`).
- **Deactivated User:** User with `isActive: false` -> `403 Forbidden` (`"Your account has been deactivated. Please contact support."`).

---

### 1.4 POST `/auth/refresh-token` (Token Rotation)

```bash
curl -X POST http://localhost:5000/api/v1/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "f7a1b2c3..."
  }'
```
**Response `200`:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOi...(new)",
    "refreshToken": "e3b9c4d5...(new)"
  }
}
```
> 💾 **Always update:** `accessToken` and `refreshToken`. Old refresh token is now revoked.

#### ❌ Edge Cases
- **Token Reuse Attack:** Resending old already-rotated refresh token -> `401 Unauthorized` (`"Session has been invalidated. Please log in again."`).
- **Side Effect:** **All** active sessions and refresh tokens for that user are immediately purged in MongoDB.

---

### 1.5 POST `/auth/logout`
**Requires:** `Authorization: Bearer <accessToken>`

```bash
curl -X POST http://localhost:5000/api/v1/auth/logout \
  -H "Authorization: Bearer <accessToken>"
```
**Response `200`:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Logged out successfully",
  "data": null
}
```
- **Side Effects:** Invalidation of `RefreshToken` and `DeviceSession` marked `isActive: false`.

---

### 1.6 Password Reset Flow (OTP)

#### A. Request OTP: `POST /auth/forgot-password`
```bash
curl -X POST http://localhost:5000/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{ "email": "admin@cctvmonitor.com" }'
```
**Response `200`:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Password reset OTP sent to email",
  "data": null
}
```

#### B. Verify OTP: `POST /auth/verify-otp`
```bash
curl -X POST http://localhost:5000/api/v1/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@cctvmonitor.com",
    "otp": "123456"
  }'
```
**Response `200`:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "OTP verified successfully. Use the reset token to set a new password.",
  "data": {
    "resetToken": "460a941e2b057d16c1670b40802ce2fb5caa3f4e4a95da536c13ad7d78380ad7"
  }
}
```

#### C. Reset Password: `POST /auth/reset-password`
```bash
curl -X POST http://localhost:5000/api/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "resetToken": "460a941e2b057d16c1670b40802ce2fb5caa3f4e4a95da536c13ad7d78380ad7",
    "newPassword": "NewAdmin@9999Password",
    "confirmPassword": "NewAdmin@9999Password"
  }'
```
**Response `200`:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Password reset successfully. Please log in with your new password.",
  "data": null
}
```
- **Side Effects:** Revokes all active user sessions across all devices.

---

### 1.7 PUT `/auth/change-password`
**Requires:** `Authorization: Bearer <accessToken>`

```bash
curl -X PUT http://localhost:5000/api/v1/auth/change-password \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "Admin@1234Password",
    "newPassword": "UpdatedAdmin@8888Password"
  }'
```
**Response `200`:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Password changed successfully",
  "data": null
}
```

---

### 1.8 Sessions & Profile (`GET /auth/sessions`, `DELETE /auth/sessions`, `GET /auth/me`)

- **List Sessions:** `GET /auth/sessions` -> `200 OK` with device info, IP, and `lastActiveAt`.
- **Revoke Specific Session:** `DELETE /auth/sessions/:sessionId` -> `200 OK`.
- **Revoke All Other Sessions:** `DELETE /auth/sessions` -> `200 OK` with `{ "revokedCount": 3 }`.
- **Get Profile:** `GET /auth/me` -> `200 OK` with user document (`password` field excluded).

---

## Module 02: User Management & Directory

**Base Paths:** `/api/v1/users`, `/api/v1/admins`, `/api/v1/franchise-admins`, `/api/v1/operators`, `/api/v1/technicians`, `/api/v1/customers`

### Endpoints Matrix
| Method | Route Path | Access / Role Required | Description |
|:---:|---|:---:|---|
| `PUT` | `/users/profile` | All Authenticated | Update personal profile details |
| `PUT` | `/users/profile/avatar` | All Authenticated | Update user profile avatar |
| `GET` | `/users` | `super_admin`, `admin` | List all users (tenant-scoped) |
| `POST` | `/users` | `super_admin`, `admin` | Create user with explicit role |
| `GET` | `/users/:id` | `super_admin`, `admin`, `franchise`, `franchise_admin` | Get user by ID |
| `PUT` | `/users/:id` | `super_admin`, `admin`, `franchise`, `franchise_admin` | Update user details & role subdocuments |
| `DELETE` | `/users/:id` | `super_admin` | Soft delete user |
| `PATCH` | `/users/:id/status` | `super_admin`, `admin`, `franchise`, `franchise_admin` | Toggle user active/inactive status |
| `GET` | `/users/:id/activity` | `super_admin`, `admin` | Get user audit activity history |
| `GET` | `/admins` | `super_admin` | List admin users |
| `POST` | `/admins` | `super_admin` | Create admin user |
| `GET` | `/franchise-admins` | `super_admin`, `admin`, `franchise` | List franchise admins |
| `POST` | `/franchise-admins` | `super_admin`, `admin`, `franchise` | Create franchise admin |
| `GET` | `/operators` | `isFranchiseAdmin` | List operators (tenant-scoped) |
| `POST` | `/operators` | `isFranchiseAdmin` | Create operator |
| `GET` | `/technicians` | `isFranchiseAdmin` | List technicians (tenant-scoped) |
| `POST` | `/technicians` | `isFranchiseAdmin` | Create technician |
| `GET` | `/customers` | `isFranchiseAdmin` | List customers (tenant-scoped) |
| `POST` | `/customers` | `isFranchiseAdmin` | Create customer |
| `GET` | `/customers/:id` | `isFranchiseAdmin`, `operator` | Get customer details |

---

### Key Test Cases

#### Create Operator: `POST /api/v1/operators`
```bash
curl -X POST http://localhost:5000/api/v1/operators \
  -H "Authorization: Bearer <franchiseAdminToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Operator Jack",
    "email": "jack.operator@franchise1.com",
    "phone": "9876500002",
    "password": "Operator@1234Password",
    "operatorDetails": {
      "deskNumber": "DESK-04",
      "shiftPreference": "morning"
    }
  }'
```
**Response `201`:**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Operator created successfully",
  "data": {
    "_id": "668op123def456789012345",
    "name": "Operator Jack",
    "email": "jack.operator@franchise1.com",
    "role": "operator",
    "franchiseId": "668def987abc123456789012"
  }
}
```

#### Upload Avatar: `PUT /api/v1/users/profile/avatar`
```bash
curl -X PUT http://localhost:5000/api/v1/users/profile/avatar \
  -H "Authorization: Bearer <accessToken>" \
  -F "avatar=@/path/to/profile.png"
```
**Response `200`:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Avatar updated successfully",
  "data": {
    "user": {
      "_id": "668abc123def456789012345",
      "name": "Operator Jack",
      "email": "jack.operator@franchise1.com",
      "avatar": "https://res.cloudinary.com/cctv/image/upload/v123456/avatars/avatar_668abc123def456789012345.png"
    }
  }
}
```

---

## Module 03: Roles & Permissions Matrix

**Base Paths:** `/api/v1/roles`, `/api/v1/permissions`, `/api/v1/users/:id/roles`

### Endpoints Matrix
| Method | Route Path | Access Level | Description |
|:---:|---|:---:|---|
| `GET` | `/permissions` | `super_admin`, `admin` | List all system & custom permissions |
| `POST` | `/permissions` | `super_admin` | Create new custom permission (`resource:action`) |
| `GET` | `/roles` | `super_admin`, `admin` | List all roles |
| `POST` | `/roles` | `super_admin` | Create custom role |
| `GET` | `/roles/:id` | `super_admin`, `admin` | Get role details |
| `PUT` | `/roles/:id` | `super_admin` | Update custom role metadata |
| `DELETE` | `/roles/:id` | `super_admin` | Delete custom role |
| `GET` | `/roles/:id/permissions` | `super_admin`, `admin` | Get permissions assigned to role |
| `PUT` | `/roles/:id/permissions` | `super_admin` | Merge or replace role permissions |
| `POST` | `/users/:id/roles` | `super_admin`, `admin` | Assign role to user |
| `DELETE` | `/users/:id/roles/:roleId` | `super_admin`, `admin` | Revert user role to `customer` |

---

### Key Test Case: Update Role Permissions (`PUT /roles/:id/permissions`)
```bash
curl -X PUT http://localhost:5000/api/v1/roles/668role123/permissions \
  -H "Authorization: Bearer <superAdminToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "permissions": ["cameras:read", "cameras:write", "alerts:read"],
    "replace": true
  }'
```
- **Side Effects:** Updates permissions array; invokes `invalidateRoleCache(role.name)` to instantly apply changes in the `permit()` middleware.

---

## Module 04: Camera Management & Controls

**Base Path:** `/api/v1/cameras`

### Endpoints Matrix
| Method | Route Path | Required Permission | Description |
|:---:|---|:---:|---|
| `GET` | `/cameras/customer/:customerId` | `cameras:read` | List cameras owned by a customer |
| `GET` | `/cameras/operator/:operatorId` | `cameras:read` | List cameras assigned to an operator |
| `GET` | `/cameras` | `cameras:read` | List cameras (tenant-scoped) |
| `POST` | `/cameras` | `cameras:write` | Register camera & sync MediaMTX path |
| `GET` | `/cameras/:id` | `cameras:read` | Get camera details |
| `PUT` | `/cameras/:id` | `cameras:write` | Update camera configuration |
| `DELETE` | `/cameras/:id` | `cameras:delete` | Soft delete camera & drop MediaMTX path |
| `POST` | `/cameras/:id/assign` | `cameras:assign` | Assign customer, franchise, and operators |
| `POST` | `/cameras/:id/transfer` | `cameras:assign` | Transfer camera to new customer |
| `PATCH` | `/cameras/:id/status` | `cameras:configure` | Update camera connection status |
| `POST` | `/cameras/:id/heartbeat` | Authenticated / `X-System-Key` | Hardware heartbeat ping |
| `GET` | `/cameras/:id/health` | `cameras:read` | Poll camera health metrics |
| `POST` | `/cameras/:id/restart` | `cameras:restart` | Remote reboot trigger |
| `PATCH` | `/cameras/:id/recording` | `cameras:configure` | Toggle 24/7 or schedule recording |
| `PATCH` | `/cameras/:id/motion` | `cameras:configure` | Toggle motion detection sensitivity |
| `PATCH` | `/cameras/:id/ai` | `cameras:configure` | Toggle AI person/vehicle detection |
| `POST` | `/cameras/:id/qr-scan` | `cameras:configure` | Technician QR scan configuration |
| `GET` | `/cameras/:id/config` | `cameras:read` | Read camera configuration properties |

---

### Key Test Case: Register Camera (`POST /cameras`)
```bash
curl -X POST http://localhost:5000/api/v1/cameras \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Main Entrance 4K",
    "serialNumber": "CAM-ME-4K-01",
    "rtspUrl": "rtsp://admin:12345@192.168.1.150:554/h264Preview_01_main",
    "model": "Hikvision 4K Ultra",
    "location": "Main Lobby Entrance",
    "resolution": "4K",
    "fps": 30
  }'
```
**Response `201`:**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Camera created successfully",
  "data": {
    "_id": "668cam123def456789012345",
    "name": "Main Entrance 4K",
    "serialNumber": "CAM-ME-4K-01",
    "status": "offline",
    "isRecording": true
  }
}
```
- **Side Effects:** Auto-calls `addMediaMTXPath("cam_CAM-ME-4K-01", rtspUrl)` on MediaMTX API.

---

## Module 05: Live Streaming & WebRTC Relay

**Base Path:** `/api/v1/streams`

### Endpoints Matrix
| Method | Route Path | Required Permission | Description |
|:---:|---|:---:|---|
| `POST` | `/streams/auth` | Internal / MediaMTX | MediaMTX authentication webhook hook |
| `POST` | `/streams/start` | `streams:view` | Start live stream session & get WHEP URLs |
| `POST` | `/streams/stop` | `streams:view` | Stop live stream session |
| `GET` | `/streams/active` | `streams:view` | List all active stream sessions |
| `GET` | `/streams/:cameraId/token` | `streams:view` | Generate fresh stream token |
| `GET` | `/streams/:cameraId/status` | `streams:view` | Get live stream status & viewer count |
| `GET` | `/streams/:cameraId/ice-candidates` | `streams:view` | Get WebRTC ICE candidates |
| `POST` | `/streams/:cameraId/webrtc/offer` | `streams:view` | WebRTC WHEP offer/answer negotiation |
| `POST` | `/streams/:cameraId/webrtc/answer` | None | WebRTC answer relay |

---

### Key Test Case: Start Live Stream (`POST /streams/start`)
```bash
curl -X POST http://localhost:5000/api/v1/streams/start \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{ "cameraId": "668cam123def456789012345" }'
```
**Response `200`:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Stream session started",
  "data": {
    "sessionId": "sess_live_123456",
    "streamToken": "eyJhbGciOi...",
    "pathName": "cam_CAM-ME-4K-01",
    "webrtcUrl": "http://localhost:9997/cam_CAM-ME-4K-01",
    "hlsUrl": "http://localhost:9997/cam_CAM-ME-4K-01/index.m3u8",
    "tokenExpiresIn": "24h"
  }
}
```
- **Side Effects:** Stores active `StreamSession` with `tokenHash` in MongoDB for MediaMTX playback verification.

---

## Module 06: Video Recordings, Retention & Schedules

**Base Path:** `/api/v1/recordings`

### Endpoints Matrix
| Method | Route Path | Required Permission | Description |
|:---:|---|:---:|---|
| `POST` | `/recordings` | `recordings:manage` | Ingest new recording segment |
| `GET` | `/recordings/storage` | `recordings:view` | Get total storage GB and chunk statistics |
| `PUT` | `/recordings/retention` | `recordings:manage` | Update global storage retention policy (days) |
| `POST` | `/recordings/schedule` | `cameras:configure` | Upsert camera recording schedule (body-based) |
| `PUT` | `/recordings/:cameraId/schedule` | `cameras:configure` | Update camera recording schedule (param-based) |
| `GET` | `/recordings/:cameraId/schedule` | `recordings:view` | Get camera recording schedule |
| `DELETE` | `/recordings/:cameraId/schedule` | `cameras:configure` | Delete camera recording schedule |
| `GET` | `/recordings/:cameraId/playback` | `recordings:view` | Get playback segments (supports `?start=...&end=...` or `?startTime=...&endTime=...`) |
| `GET` | `/recordings/:cameraId/timeline` | `recordings:view` | Get recording activity timeline (`?date=YYYY-MM-DD`) |
| `GET` | `/recordings` | `recordings:view` | List recording chunks (paginated & filtered) |
| `GET` | `/recordings/:id` | `recordings:view` | Get recording segment metadata |
| `POST` | `/recordings/:id/download` | `recordings:export` | Generate signed download URL |
| `DELETE` | `/recordings/:id` | `recordings:manage` | Soft delete recording segment |

---

### Key Test Case: Upsert & Delete Recording Schedule

#### 1. Set Schedule: `PUT /recordings/:cameraId/schedule`
```bash
curl -X PUT http://localhost:5000/api/v1/recordings/668cam123def456789012345/schedule \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "rules": [
      {
        "daysOfWeek": [1, 2, 3, 4, 5],
        "startTime": "09:00",
        "endTime": "18:00",
        "type": "continuous"
      },
      {
        "daysOfWeek": [0, 6],
        "startTime": "00:00",
        "endTime": "23:59",
        "type": "motion"
      }
    ]
  }'
```
**Response `200`:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Schedule updated",
  "data": {
    "cameraId": "668cam123def456789012345",
    "rules": [
      { "daysOfWeek": [1, 2, 3, 4, 5], "startTime": "09:00", "endTime": "18:00", "type": "continuous" },
      { "daysOfWeek": [0, 6], "startTime": "00:00", "endTime": "23:59", "type": "motion" }
    ]
  }
}
```

#### 2. Delete Schedule: `DELETE /recordings/:cameraId/schedule`
```bash
curl -X DELETE http://localhost:5000/api/v1/recordings/668cam123def456789012345/schedule \
  -H "Authorization: Bearer <accessToken>"
```
**Response `200`:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Schedule deleted",
  "data": { "acknowledged": true }
}
```

---

## Module 07: Alert Engine & Automated Triage

**Base Path:** `/api/v1/alerts`

### Endpoints Matrix
| Method | Route Path | Required Permission | Description |
|:---:|---|:---:|---|
| `POST` | `/alerts` | `alerts:create` | Create alert (sensor/manual trigger) |
| `PATCH` | `/alerts/:id/acknowledge` | `alerts:update` | Acknowledge & claim alert |
| `PATCH` | `/alerts/:id/resolve` | `alerts:update` | Resolve alert with notes |
| `PATCH` | `/alerts/:id/escalate` | `alerts:update` | Escalate alert to incident report |
| `POST` | `/alerts/:id/verify` | `alerts:update` | Operator verification of alert veracity |
| `PUT` | `/alerts/rules` | `alerts:configure` | Update global/camera alert rules |
| `GET` | `/alerts/rules/:cameraId` | `alerts:configure` | Get alert rules for camera |
| `GET` | `/alerts/pending` | `alerts:read` | Get unacknowledged alerts (`status: "new"`) |
| `GET` | `/alerts/stats` | `alerts:read` | Get alert resolution statistics |
| `GET` | `/alerts/:cameraId/history` | `alerts:read` | Get alert history for a specific camera |
| `GET` | `/alerts` | `alerts:read` | List alerts (scoped & paginated) |
| `GET` | `/alerts/:id` | `alerts:read` | Get alert details |

---

### Key Test Case: Create & Acknowledge Alert

#### 1. Create Alert: `POST /alerts`
```bash
curl -X POST http://localhost:5000/api/v1/alerts \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "cameraId": "668cam123def456789012345",
    "alertType": "motion",
    "priority": "critical",
    "snapshotUrl": "https://res.cloudinary.com/cctv/snapshot.jpg",
    "description": "Perimeter breach detected after hours"
  }'
```
- **Side Effects:**
  - Emits `new_alert` Socket.IO event to `camera_<cameraId>` and `franchise_<franchiseId>`.
  - Dispatches FCM push notification to active operators.

#### 2. Acknowledge Alert: `PATCH /alerts/:id/acknowledge`
```bash
curl -X PATCH http://localhost:5000/api/v1/alerts/668alert123/acknowledge \
  -H "Authorization: Bearer <operatorToken>"
```
- **Side Effects:** Sets `status: "acknowledged"`, `operatorId: req.user.userId`; emits `alert_acknowledged`.

---

## Module 08: Two-Way Audio Talkback

**Base Path:** `/api/v1/talkback`

### Endpoints Matrix
| Method | Route Path | Required Permission | Description |
|:---:|---|:---:|---|
| `GET` | `/talkback/logs` | `talkback:use` | Get talkback session logs |
| `GET` | `/talkback/active` | `talkback:use` | List currently active talkback sessions |
| `GET` | `/talkback/:cameraId/capabilities` | `talkback:use` | Check if camera supports 2-way audio |
| `GET` | `/talkback/:cameraId/status` | `talkback:use` | Check if talkback is in use on camera |
| `POST` | `/talkback/:cameraId/start` | `talkback:use` | Start talkback & get WHIP URL |
| `POST` | `/talkback/:cameraId/stop` | `talkback:use` | Terminate talkback session |

---

## Module 09: Notifications & FCM Push Tokens

**Base Path:** `/api/v1/notifications`

### Endpoints Matrix
| Method | Route Path | Access Level | Description |
|:---:|---|:---:|---|
| `POST` | `/notifications/register-device` | Authenticated | Register or refresh FCM push token |
| `GET` | `/notifications/preferences` | Authenticated | Get user notification preferences |
| `PUT` | `/notifications/preferences` | Authenticated | Update user notification preferences |
| `GET` | `/notifications` | Authenticated | List notifications (paginated) |
| `PATCH` | `/notifications/read-all` | Authenticated | Mark all notifications as read |
| `GET` | `/notifications/:id` | Authenticated | Get notification details |
| `PATCH` | `/notifications/:id/read` | Authenticated | Mark single notification as read |
| `DELETE` | `/notifications/:id` | Authenticated | Delete notification from inbox |

---

## Module 10: Emergency SOS & Panic Dispatch

**Base Path:** `/api/v1/sos`

### Endpoints Matrix
| Method | Route Path | Allowed Roles | Description |
|:---:|---|:---:|---|
| `POST` | `/sos` | All Authenticated | Trigger emergency panic alert (global broadcast) |
| `GET` | `/sos` | Authenticated | List SOS events (scoped & paginated) |
| `POST` | `/sos/:id/acknowledge` | `isOperator`, `isAdmin` | Claim & acknowledge SOS |
| `POST` | `/sos/:id/resolve` | `isOperator`, `isAdmin` | Resolve SOS event |
| `GET` | `/sos/active` | `isOperator`, `isAdmin` | Get currently active SOS alerts |
| `GET` | `/sos/:id` | Authenticated | Get SOS alert details |
| `POST` | `/sos/:id/notes` | `isOperator`, `isAdmin` | Add note to SOS incident log |
| `GET` | `/sos/:id/timeline` | Authenticated | Get SOS timeline and dispatch history |

---

### Key Test Case: Trigger SOS Panic (`POST /sos`)
```bash
curl -X POST http://localhost:5000/api/v1/sos \
  -H "Authorization: Bearer <customerToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "cameraId": "668cam123def456789012345",
    "location": "Main Office Reception",
    "note": "Emergency assistance required immediately"
  }'
```
- **Side Effects:**
  - Creates `SosAlert` record with `status: "active"`.
  - Emits global `sos_triggered` event across all connected WebSocket clients.
  - Sends high-priority push notifications to all control room operators and admins.

---

## Module 11: Incident Management & Evidence

**Base Path:** `/api/v1/incidents`

### Endpoints Matrix
| Method | Route Path | Allowed Roles | Description |
|:---:|---|:---:|---|
| `POST` | `/incidents` | Authenticated (Multipart) | File new incident report with attachments |
| `GET` | `/incidents` | Authenticated | List incidents (tenant-scoped) |
| `GET` | `/incidents/:id` | Authenticated | Get incident details |
| `PATCH` | `/incidents/:id/status` | `isOperator`, `isAdmin` | Update status (`investigating`, etc.) |
| `PATCH` | `/incidents/:id/assign` | `isFranchiseAdmin` | Assign incident to investigator/operator |
| `PATCH` | `/incidents/:id/close` | `isFranchiseAdmin` | Close incident report |
| `POST` | `/incidents/:id/notes` | `isOperator`, `isAdmin` | Append note to incident |
| `POST` | `/incidents/:id/media` | Authenticated (Multipart) | Upload supplementary evidence media |
| `POST` | `/incidents/:id/verify` | `isFranchiseAdmin` | Formal verification of incident |
| `GET` | `/incidents/:id/timeline` | Authenticated | Get incident audit timeline |
| `GET` | `/incidents/:id/report` | `isOperator`, `isAdmin` | Generate printable incident report JSON |

---

## Module 12: Franchise Management, CRM & Territory

**Base Path:** `/api/v1/franchises`

### Endpoints Matrix
| Method | Route Path | Allowed Roles | Description |
|:---:|---|:---:|---|
| `POST` | `/franchises` | `super_admin`, `admin` | Provision new franchise territory |
| `GET` | `/franchises` | `super_admin`, `admin` | List franchises + aggregated KPIs |
| `GET` | `/franchises/:id` | `super_admin`, `admin`, `franchise`, `franchise_admin` | Get franchise details |
| `PUT` | `/franchises/:id` | `super_admin`, `admin` | Update franchise info or toggle suspend |
| `POST` | `/franchises/:id/users/:userId` | `super_admin`, `admin` | Assign user to franchise |
| `GET` | `/franchises/:id/customers` | `isFranchiseAdmin` | List franchise customers |
| `GET` | `/franchises/:id/leads` | `isFranchiseAdmin` | List CRM leads |
| `POST` | `/franchises/:id/leads` | `isFranchiseAdmin` | Add CRM lead |
| `PUT` | `/franchises/:id/leads/:leadId` | `isFranchiseAdmin` | Update CRM lead status |
| `GET` | `/franchises/:id/commission` | `isFranchiseAdmin` | Get commission revenue report |
| `GET` | `/franchises/:id/royalty` | `isFranchiseAdmin` | Get royalty dues report |
| `GET` | `/franchises/:id/sales` | `isFranchiseAdmin` | Get sales conversion report |
| `PUT` | `/franchises/:id/territory` | `super_admin`, `admin` | Update geographical territory bounds |
| `GET` | `/franchises/:id/territory` | `isFranchiseAdmin` | Get territory configuration |

---

## Module 13: Field Installations & Technician Dispatch

**Base Paths:** `/api/v1/installations`, `/api/v1/jobs`

### Endpoints Matrix
| Method | Route Path | Allowed Roles | Description |
|:---:|---|:---:|---|
| `POST` | `/installations` | `isFranchiseAdmin` | Dispatch new installation/repair job |
| `GET` | `/installations` | `isFranchiseAdmin`, `technician` | List jobs (scoped) |
| `GET` | `/installations/assigned` | `technician` | Get jobs assigned to current technician |
| `GET` | `/installations/:id` | Authenticated | Get job details |
| `PUT` | `/installations/:id` | `isFranchiseAdmin`, `technician` | Update job status/schedule |
| `PUT` | `/installations/:id/reassign` | `super_admin`, `admin`, `franchise`, `franchise_admin` | Reassign job to different technician |
| `POST` | `/installations/:id/checklist` | `technician`, `super_admin` | Submit completed installation checklist |
| `POST` | `/installations/:id/photos` | `technician`, `super_admin` (Multipart) | Upload site photos |
| `POST` | `/installations/:id/signature` | `technician`, `super_admin` (Multipart) | Upload customer sign-off signature |
| `PATCH` | `/installations/:id/complete` | `technician`, `super_admin`, `admin` | Mark job complete & activate cameras |
| `GET` | `/installations/:id/report` | `super_admin`, `admin`, `technician` | Get installation completion report |
| `GET` | `/installations/technicians/:id/schedule` | Authenticated | Get technician's upcoming schedule |
| `POST` | `/installations/technicians/:id/gps` | `technician` | Update live technician GPS coordinates |

---

## Module 14: Operator Shifts & Control Room Panel

**Base Paths:** `/api/v1/operators`, `/api/v1/operator`

### Endpoints Matrix
| Method | Route Path | Allowed Roles | Description |
|:---:|---|:---:|---|
| `POST` | `/operators/clock-in` | `operator`, `super_admin` | Shift clock-in (Admin endpoint) |
| `POST` | `/operators/clock-out` | `operator`, `super_admin` | Shift clock-out (Admin endpoint) |
| `GET` | `/operators/shifts` | `isFranchiseAdmin` | List operator shift history |
| `POST` | `/operators/:id/cameras` | `super_admin`, `admin`, `franchise_admin` | Batch assign cameras to operator |
| `GET` | `/operators/:id/performance` | `isFranchiseAdmin` | Get operator KPIs & response times |
| `GET` | `/operator/dashboard` | `operator` | Operator personal control panel dashboard |
| `GET` | `/operator/cameras` | `operator` | Get assigned live cameras for active shift |
| `GET` | `/operator/alerts/pending` | `operator` | Get unhandled alerts (`status: "new"`) |
| `GET` | `/operator/alerts/active` | `operator` | Get in-progress alerts (`status: "acknowledged"`) |
| `GET` | `/operator/calls` | `operator` | Get talkback calls history |
| `PATCH` | `/operator/shift/start` | `operator` | Operator shift clock-in |
| `PATCH` | `/operator/shift/end` | `operator` | Operator shift clock-out with auto-metrics |
| `GET` | `/operator/shift/status` | `operator` | Check current shift state & duration |
| `GET` | `/operator/timeline` | `operator` | Operator activity timeline |
| `GET` | `/operator/reports` | `operator` | Operator shift reports |

---

## Module 15: Customer Self-Service Panel

**Base Path:** `/api/v1/customer`

### Endpoints Matrix
| Method | Route Path | Allowed Roles | Description |
|:---:|---|:---:|---|
| `POST` | `/customer/subscribe` | `customer` | Subscribe customer to plan |
| `POST` | `/customer/cancel-subscription` | `customer` | Cancel customer active subscription |
| `GET` | `/customer/invoices` | `customer` | List customer billing invoices |
| `GET` | `/customer/dashboard` | `customer` | Aggregated customer home screen KPIs |
| `GET` | `/customer/cameras` | `customer` | List customer's owned cameras |
| `GET` | `/customer/cameras/:id/live` | `customer` | Live stream URL for customer camera |
| `GET` | `/customer/cameras/:id/playback` | `customer` | Playback VOD for customer camera (supports `?start=...&end=...` or `?startTime=...&endTime=...`) |
| `POST` | `/customer/cameras/:id/share` | `customer` | Share camera access with family/staff |
| `DELETE` | `/customer/cameras/:id/share/:userId` | `customer` | Revoke shared camera access |
| `GET` | `/customer/subscription` | `customer` | View active subscription details |
| `GET` | `/customer/payments` | `customer` | List payment transaction history |
| `GET` | `/customer/notifications` | `customer` | Get customer in-app notifications |
| `GET` | `/customer/reports` | `customer` | Get customer security summaries |
| `GET` | `/customer/profile` | `customer` | Get customer profile details |
| `PUT` | `/customer/profile` | `customer` | Update customer profile details |

---

## Module 16: Billing, Subscriptions, Payments & Invoices

**Base Paths:** `/api/v1/plans`, `/api/v1/subscriptions`, `/api/v1/payments`, `/api/v1/invoices`

### Endpoints Matrix
| Method | Route Path | Required Permission | Description |
|:---:|---|:---:|---|
| `GET` | `/plans` | Authenticated | List all active subscription plans |
| `POST` | `/plans` | `plans:write` | Create subscription plan |
| `PUT` | `/plans/:id` | `plans:write` | Update plan pricing / feature limits |
| `DELETE` | `/plans/:id` | `plans:delete` | Soft delete / deactivate plan |
| `GET` | `/subscriptions` | `subscriptions:read` | List subscriptions (tenant-scoped) |
| `POST` | `/subscriptions` | `subscriptions:write` | Create subscription for customer |
| `GET` | `/subscriptions/:id` | `subscriptions:read` | Get subscription details |
| `PATCH` | `/subscriptions/:id/renew` | `subscriptions:write` | Renew subscription |
| `PATCH` | `/subscriptions/:id/cancel` | `subscriptions:write` | Cancel subscription |
| `POST` | `/payments/verify` | Authenticated | Verify Razorpay payment signature |
| `POST` | `/payments/create-order` | Authenticated | Create Razorpay order for subscription |
| `GET` | `/payments` | `payments:read` | List payment transactions |
| `GET` | `/payments/:id` | `payments:read` | Get payment transaction details |
| `POST` | `/payments/:id/refund` | `payments:write` | Refund payment order |
| `GET` | `/invoices` | `invoices:read` | List generated billing invoices |
| `GET` | `/invoices/:id` | `invoices:read` | Get invoice metadata |
| `GET` | `/invoices/:id/download` | `invoices:read` | Download invoice PDF |

---

## Module 17: Analytics & Reporting Aggregations

**Base Path:** `/api/v1/analytics`

### Endpoints Matrix
| Method | Route Path | Required Permission | Description |
|:---:|---|:---:|---|
| `GET` | `/analytics/dashboard` | `analytics:read` | Aggregated dashboard overview metrics |
| `GET` | `/analytics/alerts` | `analytics:read` | Alert status & priority breakdown |
| `GET` | `/analytics/cameras` | `analytics:read` | Online / offline / degraded camera metrics |
| `GET` | `/analytics/operators` | `analytics:read` | Operator shift performance & response times |
| `GET` | `/analytics/revenue` | `analytics:read` | Monthly revenue aggregations (paid only) |
| `GET` | `/analytics/subscriptions` | `analytics:read` | Subscription growth trends |
| `GET` | `/analytics/incidents` | `analytics:read` | Incident severity & resolution metrics |
| `GET` | `/analytics/franchises` | `analytics:read` | Franchise performance comparisons |

---

## Module 18: System Audit & Activity Trails

**Base Paths:** `/api/v1/audit-logs`, `/api/v1/activity-logs`

### Endpoints Matrix
| Method | Route Path | Required Permission | Description |
|:---:|---|:---:|---|
| `GET` | `/audit-logs` | `audit:read` | List critical audit log records (security actions) |
| `GET` | `/audit-logs/:id` | `audit:read` | Get audit log entry details |
| `GET` | `/activity-logs` | `audit:read` | List general application write operations |
| `GET` | `/activity-logs/user/:userId` | `audit:read` | Get activity history for a specific user |

---

## Module 19: Support Tickets & Helpdesk

**Base Path:** `/api/v1/tickets`

### Endpoints Matrix
| Method | Route Path | Access Level | Description |
|:---:|---|:---:|---|
| `POST` | `/tickets` | Authenticated | Create support ticket |
| `GET` | `/tickets` | Authenticated | List support tickets (scoped) |
| `GET` | `/tickets/:id` | Authenticated | Get ticket thread & comments |
| `PUT` | `/tickets/:id` | `isFranchiseAdmin` | Update ticket metadata |
| `PATCH` | `/tickets/:id/status` | `isFranchiseAdmin` | Change ticket status |
| `POST` | `/tickets/:id/comments` | Authenticated | Add comment (auto-reopens closed ticket if user is customer) |
| `PATCH` | `/tickets/:id/assign` | `isAdmin` | Assign ticket to staff member |
| `PATCH` | `/tickets/:id/close` | `isAdmin` | Close ticket |

---

## Module 20: System Settings

**Base Path:** `/api/v1/settings`

### Endpoints Matrix
| Method | Route Path | Required Permission | Description |
|:---:|---|:---:|---|
| `GET` | `/settings` | `settings:read` | Get global platform settings |
| `PUT` | `/settings` | `settings:write` | Update global platform settings (`super_admin` only) |
| `GET` | `/settings/notifications` | `settings:read` | Get notification thresholds & settings |
| `PUT` | `/settings/notifications` | `settings:write` | Update notification settings |
| `GET` | `/settings/recording` | `settings:read` | Get default recording retention settings |
| `PUT` | `/settings/recording` | `settings:write` | Update default recording retention settings |

---

## 23. Real-time WebSocket Testing (Socket.IO v4)

### Connection Handshake
```javascript
const { io } = require("socket.io-client");

const socket = io("http://localhost:5000", {
  auth: {
    token: "<accessToken>"
  }
});

socket.on("connect", () => {
  console.log("[Socket.IO] Connected with socket ID:", socket.id);
});
```

### Room Subscriptions & Event Verification
1. **Franchise Room Auto-Join**:
   - Verify server automatically joins socket to `franchise_<franchiseId>` on connection if token has `franchiseId`.
2. **Camera Room Subscription**:
   - Emit: `socket.emit("join_camera", "<cameraId>");`
   - Server Broadcasts: `camera_online`, `camera_offline`, `camera_health`, `new_alert`.
   - Leave Room: `socket.emit("leave_camera", "<cameraId>");`
3. **Global Emergency Broadcast**:
   - `socket.on("sos_triggered", (data) => { console.log("SOS Alert:", data); });`
4. **User Targeted Notification**:
   - `socket.on("notification", (data) => { console.log("User Notification:", data); });`

---

## 24. Global Edge Cases & Failure Modes

| Scenario | HTTP Status | Expected Error Message | Root Cause / Remedy |
|---|:---:|---|---|
| **Missing Bearer Token** | `401` | `"No authentication token provided"` | Include `Authorization: Bearer <token>` |
| **Expired JWT Token** | `401` | `"Access token has expired"` | Call `/auth/refresh-token` |
| **Tampered / Forged Token** | `401` | `"Invalid access token"` | Token signature mismatch |
| **Token Reuse Attack** | `401` | `"Session has been invalidated. Please log in again."` | Re-used already rotated refresh token |
| **Cross-Tenant Data Breach** | `403` / `404` | `"Resource not found"` / `"Forbidden"` | Attempting to access data belonging to another franchise |
| **Privilege Escalation** | `403` | `"You don't have permission to perform this action"` | Role lacks required permission key |
| **Duplicate Unique Keys** | `409` | `"Resource already exists"` | Duplicate email, phone, or serialNumber |
| **Rate Limit Exceeded** | `429` | `"Too many requests. Please try again later."` | Exceeded 100 req/15m or 10 req/15m on auth |
| **Invalid ObjectId Format** | `400` | `"Invalid ID format"` | String is not a 24-char BSON hex ObjectId |

---

## 25. Multi-Tenant Boundary Penetration Checklist

Run these security test cases to ensure absolute tenant isolation:

- [ ] **Cross-Franchise Camera Access**: Log in as Franchise A Admin. Send `GET /api/v1/cameras/:cameraInFranchiseB`. Must return `403 Forbidden` or `404 Not Found`.
- [ ] **Cross-Franchise Operator Assignment**: Attempt to assign an operator from Franchise B to a camera in Franchise A. Must return `400 Bad Request`.
- [ ] **Cross-Franchise CRM Leads**: Attempt `GET /api/v1/franchises/:franchiseB/leads` as Franchise A Admin. Must return `403 Forbidden`.
- [ ] **Customer Walled Garden**: Customer A requests `GET /api/v1/customer/cameras/:cameraOwnedByCustomerB/live`. Must return `403 Forbidden`.
- [ ] **Suspended Franchise Access**: Suspend Franchise A. Attempt to log in with Franchise A users. Must reject with `403 Forbidden`.
- [ ] **Super Admin Elevation**: Attempt to call `POST /api/v1/users/:id/roles` with `role: "super_admin"`. Must return `403 Forbidden`.

---

## 26. End-to-End Quick Test Shell Script

Copy and run this bash script to test the core lifecycle from registration to stream start:

```bash
#!/usr/bin/env bash
BASE="http://localhost:5000/api/v1"

echo "=== 1. Health Check ==="
curl -s "$BASE/../health" | python3 -m json.tool

echo "=== 2. Register Super Admin ==="
REGISTER_RES=$(curl -s -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Platform Admin",
    "email": "platform.admin@cctvtest.com",
    "phone": "9811122233",
    "password": "Admin@1234Password",
    "role": "super_admin"
  }')
echo "$REGISTER_RES" | python3 -m json.tool

TOKEN=$(echo "$REGISTER_RES" | python3 -c "import sys, json; print(json.load(sys.stdin).get('data',{}).get('tokens',{}).get('accessToken',''))")

if [ -z "$TOKEN" ]; then
  echo "Login instead..."
  LOGIN_RES=$(curl -s -X POST "$BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "platform.admin@cctvtest.com",
      "password": "Admin@1234Password"
    }')
  TOKEN=$(echo "$LOGIN_RES" | python3 -c "import sys, json; print(json.load(sys.stdin).get('data',{}).get('tokens',{}).get('accessToken',''))")
fi

echo "Access Token: $TOKEN"

echo "=== 3. Get Me Profile ==="
curl -s -X GET "$BASE/auth/me" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo "=== 4. Register Camera ==="
CAM_RES=$(curl -s -X POST "$BASE/cameras" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Gate Camera 1",
    "serialNumber": "CAM-TEST-001",
    "rtspUrl": "rtsp://admin:12345@192.168.1.100:554/live",
    "model": "Hikvision 4K",
    "location": "Main Entrance"
  }')
echo "$CAM_RES" | python3 -m json.tool

CAM_ID=$(echo "$CAM_RES" | python3 -c "import sys, json; print(json.load(sys.stdin).get('data',{}).get('_id',''))")
echo "Camera ID: $CAM_ID"

if [ -n "$CAM_ID" ]; then
  echo "=== 5. Start Live Stream ==="
  curl -s -X POST "$BASE/streams/start" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"cameraId\": \"$CAM_ID\"}" | python3 -m json.tool
fi

echo "=== Verification Flow Complete ==="
```
