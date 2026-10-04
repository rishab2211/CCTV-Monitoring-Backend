# 🎯 CCTV Monitoring Platform — Master Live Testing Guide
**Deployment Host:** `http://200.141.12.143`  
**API Endpoint:** `http://200.141.12.143/api/v1`  
**WebSocket Engine:** `ws://200.141.12.143`  
**Admin Panel Web UI:** `http://200.141.12.143`  

---

## 📋 Table of Contents
1. [Test Environment & Pre-Seeded Pitch Accounts](#1-test-environment--pre-seeded-pitch-accounts)
2. [Phase 01: Authentication, Sessions & RBAC Security](#phase-01-authentication-sessions--rbac-security)
3. [Phase 02: Live CCTV Surveillance & Video Streams](#phase-02-live-cctv-surveillance--video-streams)
4. [Phase 03: Two-Way Audio Talkback & PTZ Hardware Controls](#phase-03-two-way-audio-talkback--ptz-hardware-controls)
5. [Phase 04: Real-Time Alerts, AI Detection & Emergency SOS](#phase-04-real-time-alerts-ai-detection--emergency-sos)
6. [Phase 05: Incident Management & Digital Forensic Evidence](#phase-05-incident-management--digital-forensic-evidence)
7. [Phase 06: Cloud Video Recordings & Timeline Playback](#phase-06-cloud-video-recordings--timeline-playback)
8. [Phase 07: Multi-Tenant Franchise Scoping & Territory Isolation](#phase-07-multi-tenant-franchise-scoping--territory-isolation)
9. [Phase 08: Operator Command Shifts & Control Room Operations](#phase-08-operator-command-shifts--control-room-operations)
10. [Phase 09: Field Technician Jobs & Camera Installations](#phase-09-field-technician-jobs--camera-installations)
11. [Phase 10: Billing, Subscription Plans, Razorpay & Invoices](#phase-10-billing-subscription-plans-razorpay--invoices)
12. [Phase 11: Support Helpdesk & Audit Logging Trail](#phase-11-support-helpdesk--audit-logging-trail)
13. [Phase 12: Exhaustive Edge Cases, Failure Modes & Penetration Matrix](#phase-12-exhaustive-edge-cases-failure-modes--penetration-matrix)
14. [Master Verification Scorecard](#master-verification-scorecard)

---

## 1. Test Environment & Pre-Seeded Pitch Accounts

The backend automatically verified and seeded four production-ready role accounts and three live synthetic CCTV camera feeds. Use these credentials for testing:

### 🔑 User Role Accounts
| Role | Email | Password | Scope / Permissions |
|---|---|---|---|
| **Super Admin** | `admin@cctv.com` | `Admin@123` | Full platform access, all franchises, system settings, audit logs |
| **Franchise Admin** | `franchise@cctv.com` | `Franchise@123` | Scoped to **Metro Security (FR-METRO-01)**, its operators, customers & cameras |
| **Command Operator** | `operator@cctv.com` | `Operator@123` | Control room monitoring, shift check-in, alert triage, incident raising |
| **Customer** | `customer@cctv.com` | `Customer@123` | Property Owner (Vikram Malhotra), views own cameras & active subscription |

### 📹 Live Synthetic Demo Cameras (Streaming via MediaMTX)
| Camera Name | Serial Number | RTSP URL | HLS Stream URL |
|---|---|---|---|
| **Main Entrance & Reception** | `CAM-ENTRANCE-01` | `rtsp://localhost:8554/cam_entrance` | `http://200.141.12.143/hls/cam_entrance/index.m3u8` |
| **Warehouse Loading Bay** | `CAM-WAREHOUSE-02` | `rtsp://localhost:8554/cam_warehouse` | `http://200.141.12.143/hls/cam_warehouse/index.m3u8` |
| **Perimeter Parking Area** | `CAM-PARKING-03` | `rtsp://localhost:8554/cam_parking` | `http://200.141.12.143/hls/cam_parking/index.m3u8` |

---

## Phase 01: Authentication, Sessions & RBAC Security

### Test Case 1.1: Super Admin Login & Dashboard Access
* **Step 1:** Open `http://200.141.12.143/login` in your browser.
* **Step 2:** Enter `admin@cctv.com` and `Admin@123`. Click **Sign In**.
* **Expected Result:**
  * Redirects to the Dashboard (`/`).
  * Top navigation displays `Alex Vance (Super Admin)`.
  * Dashboard metrics render: Active Cameras (3), Open Incidents, Active Franchises (1), System Status (`Operational`).
  * JWT access token and refresh token saved in session storage.

### Test Case 1.2: Incorrect Password & Account Lockout Guard
* **Step 1:** Log out (`/login`).
* **Step 2:** Enter `admin@cctv.com` and wrong password `WrongPassword!`.
* **Expected Result:**
  * UI shows toast alert: `Invalid email or password`.
  * Form remains active; no crash.
* **Edge Case (Rate Limiter):** Rapidly submit wrong credentials 10 times in 30 seconds.
  * **Expected:** HTTP `429 Too Many Requests` triggered by `authRateLimiter`, blocking brute-force attacks.

### Test Case 1.3: Token Rotation & Session Refresh
* **Step 1:** Log in as `admin@cctv.com`.
* **Step 2:** Open Chrome DevTools (`F12`) → **Application** → **Session Storage**.
* **Step 3:** Note the value of `accessToken`.
* **Step 4:** Wait 15 minutes OR execute manual refresh in Console:
  ```javascript
  fetch('/api/v1/auth/refresh-token', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ refreshToken: sessionStorage.getItem('refreshToken') })
  }).then(r => r.json()).then(console.log);
  ```
* **Expected Result:** Returns a fresh `accessToken`. If refresh token is tampered, logs user out immediately to `/login`.

### Test Case 1.4: Forgot Password & OTP Flow
* **Step 1:** Click **Forgot Password?** on the login page.
* **Step 2:** Enter `admin@cctv.com` and click **Send OTP**.
* **Expected Result:**
  * Backend logs: `Mail sent via SMTP (smtp.mailtrap.io)` with a 6-digit OTP code.
  * UI transitions to 6-digit OTP input view.
* **Edge Case:**
  * Enter wrong 6 digits → Shows `Invalid or expired OTP`.
  * Wait 10 minutes (expiry window) → Shows `OTP has expired. Request a new one`.

---

## Phase 02: Live CCTV Surveillance & Video Streams

### Test Case 2.1: Multi-Camera Live Grid
* **Step 1:** Navigate to **Live Grid** (`/live` or `/live-grid`) in the sidebar.
* **Step 2:** Inspect the video player grid:
  * Camera 1: `Main Entrance & Reception`
  * Camera 2: `Warehouse Loading Bay`
  * Camera 3: `Perimeter Parking Area`
* **Expected Result:**
  * Video elements load using HLS/WebRTC with green **LIVE** badges.
  * Timecode and synthetic video overlay display timestamp and camera metadata.
  * Grid selector (1x1, 2x2, 3x3) resizes player tiles smoothly.

### Test Case 2.2: Low-Latency Playback & Stream Health Check
* **Step 1:** In a terminal on your computer, test raw HLS manifest delivery:
  ```bash
  curl -s http://200.141.12.143/hls/cam_entrance/index.m3u8
  ```
* **Expected Result:**
  * Returns `#EXTM3U` playlist with sub-second segments (`#EXTINF:1.000...`).
  * Audio/Video codecs: `H.264 / AAC`.

### Test Case 2.3: Single Camera Focus & Fullscreen
* **Step 1:** Click the expand/fullscreen icon on `Warehouse Loading Bay`.
* **Step 2:** Verify browser enters native fullscreen mode without aspect ratio distortion.
* **Step 3:** Press `Esc` to return to the grid view.

### Test Case 2.4: Camera Disconnect & Offline Reconnection Grace
* **Step 1:** Simulate a camera feed going down on the VPS:
  ```bash
  # Run on VPS as deploy:
  pkill -f "cam_parking"
  ```
* **Step 2:** Watch the **Perimeter Parking Area** video tile on the Admin Panel.
* **Expected Result:**
  * Player detects stream interruption, switches badge to **Reconnecting...** / **Offline**, and begins exponential retry without crashing the page.
* **Step 3:** Restart synthetic feed on VPS:
  ```bash
  /app/scripts/stream-synthetic-feeds.sh > /dev/null 2>&1 &
  ```
* **Expected Result:** Live stream resumes automatically within 5 seconds.

---

## Phase 03: Two-Way Audio Talkback & PTZ Hardware Controls

### Test Case 3.1: Two-Way Audio Talkback (Voice Dispatch to Camera)
* **Step 1:** Click on any camera card (e.g., `Main Entrance & Reception`).
* **Step 2:** Locate the **Talkback** microphone button (e.g. `Hold to Speak` or `Start Audio`).
* **Step 3:** Click and hold the button.
* **Expected Result:**
  * Browser prompts for microphone permission (`navigator.mediaDevices.getUserMedia`).
  * Pulsing red animation indicates live audio transmission.
  * Audio packets stream over WebRTC/WebSocket to the backend gateway.
* **Edge Case (Permission Denied):**
  * Deny microphone permission in browser settings.
  * **Expected:** Graceful error toast: `Microphone access denied. Please grant permission in browser settings.`

### Test Case 3.2: PTZ (Pan-Tilt-Zoom) Camera Control
* **Step 1:** Open the PTZ control pad on `Main Entrance & Reception`.
* **Step 2:** Click **Pan Left**, **Pan Right**, **Tilt Up**, **Tilt Down**, and **Zoom In (+)**.
* **Expected Result:**
  * UI dispatches API call: `POST /api/v1/cameras/:id/ptz` with `{ action: "pan_left", speed: 5 }`.
  * Request returns HTTP `200 OK`.
  * Visual feedback highlights the active direction arrow.

---

## Phase 04: Real-Time Alerts, AI Detection & Emergency SOS

### Test Case 4.1: Instant Emergency SOS Panic Button
* **Step 1:** On the top bar or sidebar, click **Emergency SOS** (`/sos`).
* **Step 2:** Click **TRIGGER EMERGENCY SOS**. Select:
  * Location: `Main Entrance & Reception`
  * Reason: `Intruder Alert / Unauthorized Entry`
* **Expected Result:**
  * Red emergency flashing header banner appears across the dashboard.
  * Real-time audio alert chime sounds via browser audio.
  * System creates high-priority alert with status `active` and priority `critical`.
  * WebSocket emits `sos:triggered` to all active operators.

### Test Case 4.2: Automated AI Motion & Intrusion Alert Generation
* **Step 1:** Trigger an AI detection alert via API command:
  ```bash
  curl -X POST http://200.141.12.143/api/v1/alerts \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer <SUPER_ADMIN_ACCESS_TOKEN>" \
    -d '{
      "camera": "<CAMERA_ID_FROM_CAM_ENTRANCE>",
      "type": "human_detection",
      "severity": "high",
      "description": "Unidentified person detected in restricted warehouse zone after hours",
      "snapshotUrl": "https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&w=600&q=80"
    }'
  ```
* **Expected Result:**
  * Alert appears instantly on the **Alerts** page (`/alerts`) without page refresh (powered by Socket.IO).
  * Toast notification pops up in bottom-right corner.

### Test Case 4.3: Alert Triage & Acknowledgment
* **Step 1:** As an Operator or Admin, click on the new alert in `/alerts`.
* **Step 2:** Click **Acknowledge**.
* **Expected Result:**
  * Status updates from `New` → `Acknowledged`.
  * Operator name and timestamp recorded in alert metadata.
* **Step 3:** Click **Escalate to Incident**.
* **Expected Result:**
  * Incident creation modal opens pre-filled with camera ID, snapshot, and alert details.

---

## Phase 05: Incident Management & Digital Forensic Evidence

### Test Case 5.1: Create Incident with Photographic Evidence
* **Step 1:** Navigate to **Incidents** (`/incidents`) and click **New Incident**.
* **Step 2:** Fill in:
  * Title: `Suspicious Perimeter Activity`
  * Priority: `High`
  * Category: `Security Breach`
  * Description: `Suspicious individual attempting to bypass loading dock gate.`
  * Attach file: Upload an image or MP4 file (tests Cloudinary / `/uploads` static file pipeline).
* **Expected Result:**
  * Incident saved with unique reference (e.g. `INC-2026-XXXX`).
  * Image thumbnail renders in incident detail view (`/incidents/:id`).

### Test Case 5.2: Incident Investigation Timeline & Audit Notes
* **Step 1:** Open the created incident.
* **Step 2:** In the **Timeline** tab, post an operator comment:
  `"Security guard dispatched to Loading Dock 2. Perimeter checked."`
* **Step 3:** Change status from `Investigating` → `Resolved`.
* **Expected Result:**
  * Timeline displays audit card with user avatar, exact timestamp, and message.
  * Status badge updates to green `Resolved`.

---

## Phase 06: Cloud Video Recordings & Timeline Playback

### Test Case 6.1: Recording Archive Browsing
* **Step 1:** Navigate to **Recordings** (`/recordings`).
* **Step 2:** Select camera: `Main Entrance & Reception`.
* **Step 3:** Choose today's date from the date range calendar.
* **Expected Result:**
  * Timeline scrubber populates with recorded segments (colored bars for continuous vs motion events).
  * Video player loads the selected clip.

### Test Case 6.2: Clip Download & Evidence Export
* **Step 1:** Select a recorded 1-minute clip from the list.
* **Step 2:** Click **Download Clip**.
* **Expected Result:**
  * Browser downloads file (`.mp4` format).
  * System records an entry in the Audit Log: `User Alex Vance exported video clip from CAM-ENTRANCE-01`.

---

## Phase 07: Multi-Tenant Franchise Scoping & Territory Isolation

### Test Case 7.1: Super Admin Multi-Franchise View
* **Step 1:** Log in as `admin@cctv.com`.
* **Step 2:** Navigate to **Franchises** (`/franchises`).
* **Expected Result:**
  * Displays list of all franchises across India/global (including `Metro Security FR-METRO-01`).
  * Shows total revenue, total cameras across all franchises, and commission rate sliders.

### Test Case 7.2: Franchise Admin Tenant Isolation (Wall Test)
* **Step 1:** Log out and log in as `franchise@cctv.com` (`Franchise@123`).
* **Step 2:** Navigate to **Cameras** (`/cameras`) and **Users** (`/users`).
* **Expected Result (CRITICAL):**
  * Franchise Admin ONLY sees cameras and customers belonging to `FR-METRO-01`.
  * Cannot view or edit cameras from other franchises.
* **Step 3 (Penetration Test):**
  * Open browser console and attempt to query an unauthorized franchise:
    ```javascript
    fetch('/api/v1/franchises/660000000000000000000099', {
      headers: { 'Authorization': `Bearer ${sessionStorage.getItem('accessToken')}` }
    }).then(r => console.log('Status:', r.status));
    ```
  * **Expected Result:** Returns `403 Forbidden` or `404 Not Found`. Tenant boundary cannot be breached.

---

## Phase 08: Operator Command Shifts & Control Room Operations

### Test Case 8.1: Shift Check-In & Duty Handoff
* **Step 1:** Log in as `operator@cctv.com` (`Operator@123`).
* **Step 2:** Navigate to **Operator Shifts** (`/operator-shifts` or `/operators`).
* **Step 3:** Click **Check In for Shift**.
  * Shift Type: `Night Shift (20:00 - 08:00)`
* **Expected Result:**
  * Active shift timer starts on operator's screen.
  * Status badge flips to `ON SHIFT`.
  * Assigned cameras (3 demo feeds) populate the operator's workspace.
* **Step 4:** Click **Check Out / End Shift**.
  * Add Handoff Note: `"All perimeter zones quiet. No incidents reported."`
* **Expected Result:**
  * Shift logged with start time, end time, duration, and notes.

---

## Phase 09: Field Technician Jobs & Camera Installations

### Test Case 9.1: Create Installation Job
* **Step 1:** As Admin, navigate to **Jobs / Installations** (`/jobs`).
* **Step 2:** Click **Create Job**:
  * Title: `Install 4K Dome Camera at Gate 4`
  * Type: `Installation`
  * Priority: `Normal`
  * Customer: `Vikram Malhotra`
  * Scheduled Date: Tomorrow at 10:00 AM
* **Expected Result:** Job created with status `Pending`.

### Test Case 9.2: Job Lifecycle (Pending → Scheduled → Completed)
* **Step 1:** Assign job to field technician.
* **Step 2:** Update status: `In Progress` → `Completed`.
* **Step 3:** Upload completion photo & customer signature note.
* **Expected Result:**
  * Status advances to `Completed`.
  * Notification dispatched to customer: `"Installation job has been completed."`

---

## Phase 10: Billing, Subscription Plans, Razorpay & Invoices

### Test Case 10.1: View Subscription Plans & Pricing Tiers
* **Step 1:** Navigate to **Plans** (`/plans`).
* **Expected Result:**
  * Card view displays:
    * `Commercial Ultra 24/7 Guardian`: ₹4,999/year, 8 camera limit, sub-second latency.
* **Step 2:** As Admin, click **Edit Plan** and update price to `₹5,499`.
* **Expected Result:** Price updates immediately in UI and database.

### Test Case 10.2: Razorpay Test Checkout
* **Step 1:** Log in as Customer (`customer@cctv.com`).
* **Step 2:** Navigate to **Subscription** (`/subscriptions`) and click **Renew / Upgrade Plan**.
* **Step 3:** Click **Proceed to Payment**.
* **Expected Result:**
  * Razorpay Checkout modal opens with test key `rzp_test_TDyIUfTZ34ASeA`.
  * Allows selecting Netbanking / Card / UPI in test mode.
* **Step 4:** Complete simulated payment.
* **Expected Result:**
  * Webhook/API verifies payment signature.
  * Subscription expiration extended by 365 days.
  * PDF invoice generated and listed under `/invoices`.

---

## Phase 11: Support Helpdesk & Audit Logging Trail

### Test Case 11.1: Customer Support Ticket Lifecycle
* **Step 1:** As Customer (`customer@cctv.com`), go to **Tickets** (`/tickets`) and click **New Ticket**.
  * Subject: `Camera 2 loading bay intermittent stream`
  * Priority: `Medium`
* **Step 2:** Switch to Admin account (`admin@cctv.com`). Open the ticket and post a reply:
  `"Technician dispatched to inspect cable connections."`
* **Step 3:** Mark ticket as `Resolved`.
* **Expected Result:** Both customer and admin see full chat thread and status badge updates in real time.

### Test Case 11.2: Immutable Audit Log Verification
* **Step 1:** As Super Admin, navigate to **Audit Logs** (`/audit-logs`).
* **Expected Result:**
  * Chronological ledger of all system actions:
    * `USER_LOGIN` by `admin@cctv.com` (IP: `200.141.12.143`)
    * `CAMERA_PTZ_COMMAND`
    * `ALERT_ACKNOWLEDGED`
    * `PLAN_UPDATED`
  * Logs cannot be edited or deleted through UI.

---

## Phase 12: Exhaustive Edge Cases, Failure Modes & Penetration Matrix

| # | Edge Case / Scenario | Action / Injection | Expected System Behavior |
|---|---|---|---|
| **E1** | **XSS Injection in Camera Name** | Create camera with name `<script>alert(1)</script>` | Backend sanitizes payload; frontend escapes HTML tags. No script execution. |
| **E2** | **SQL/NoSQL Query Injection** | Login with email `{"$gt": ""}` | Zod schema validation blocks request with HTTP `400 Bad Request`. |
| **E3** | **Expired JWT Access Token** | Wait for token to expire or alter payload | Axios interceptor intercepts `401`, uses `refreshToken` to get fresh key silently. |
| **E4** | **Tampered Refresh Token** | Corrupt token in Session Storage | Refresh endpoint returns `401`; clears storage and redirects to `/login`. |
| **E5** | **File Upload Oversize Limit** | Upload 65MB video file | Nginx returns HTTP `413 Request Entity Too Large` (`client_max_body_size 50M`). |
| **E6** | **Camera RTSP Source Offline** | Network drops on RTSP camera | MediaMTX returns HTTP 404/503 for HLS; UI displays retry animation without crashing. |
| **E7** | **Simultaneous Multi-Tab Sessions** | Open 3 browser tabs with same user | WebSockets synchronize alerts across all 3 tabs simultaneously. |
| **E8** | **Cross-Franchise ID Manipulation** | Operator from Franchise A requests camera from Franchise B | Returns HTTP `403 Forbidden` (`Tenant access violation`). |
| **E9** | **Unauthenticated Route Direct Access** | Type `http://200.141.12.143/settings` while logged out | React Router `ProtectedRoute` redirects to `/login` immediately. |
| **E10**| **Server Reboot Auto-Recovery** | Run `sudo reboot` on the VPS | Docker and systemd automatically restore all services within 45s. |

---

## Master Verification Scorecard

Use this scorecard to track your test run:

| Module | Feature Tested | Status | Notes |
|---|---|---|---|
| 01 | Super Admin Login & JWT Session | [ ] Pass / [ ] Fail | |
| 02 | Live Video Grid (3 Synthetic Cameras) | [ ] Pass / [ ] Fail | |
| 03 | Low-Latency HLS Manifest Playback | [ ] Pass / [ ] Fail | |
| 04 | Two-Way Audio Talkback Mic Button | [ ] Pass / [ ] Fail | |
| 05 | PTZ Pan/Tilt/Zoom Controls | [ ] Pass / [ ] Fail | |
| 06 | Emergency SOS Panic Trigger & Chime | [ ] Pass / [ ] Fail | |
| 07 | Real-time WebSocket Alert Delivery | [ ] Pass / [ ] Fail | |
| 08 | Alert Triage & Incident Escalation | [ ] Pass / [ ] Fail | |
| 09 | Incident Evidence Photo/Video Upload | [ ] Pass / [ ] Fail | |
| 10 | Cloud Recording Archive Playback | [ ] Pass / [ ] Fail | |
| 11 | Multi-Tenant Franchise Isolation | [ ] Pass / [ ] Fail | |
| 12 | Operator Shift Check-In & Handoff | [ ] Pass / [ ] Fail | |
| 13 | Field Technician Job Lifecycle | [ ] Pass / [ ] Fail | |
| 14 | Razorpay Subscription Checkout | [ ] Pass / [ ] Fail | |
| 15 | Support Ticket Thread & Resolution | [ ] Pass / [ ] Fail | |
| 16 | System Audit Log Trail | [ ] Pass / [ ] Fail | |
| 17 | Edge Case: Brute-Force Rate Limiting | [ ] Pass / [ ] Fail | |
| 18 | Edge Case: Stream Drop & Reconnect | [ ] Pass / [ ] Fail | |
