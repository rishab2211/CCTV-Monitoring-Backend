# 📱 Field Technician App & Camera Setup Architecture Guide

## Executive Summary

The CCTV Monitoring Platform is a **B2B2C CaaS (CCTV-as-a-Service)** ecosystem where regional franchises deploy Field Technicians to install, wire, calibrate, and commission IP cameras at customer premises. 

The **Technician Mobile App** empowers field engineers to execute the complete on-site camera installation lifecycle:
- Reviewing assigned jobs and dispatch schedules
- Streaming live GPS telemetry while en-route
- Deterministically resolving brand-specific RTSP URLs
- Atomically provisioning cameras with multi-tier ingestion (GB28181 SIP, On-Prem RTSP Relays, and ONVIF PTZ Bridges)
- QR-code hardware pairing
- Verifying sub-second live WebRTC video feeds on-site
- Submitting standardized installation checklists, proof-of-work photos, and digital customer sign-off signatures
- Triggering automated camera activation and job completion notifications

---

## High-Level Architecture & Interaction Flow

```mermaid
sequenceDiagram
    autonumber
    actor Tech as Technician (Mobile App)
    participant API as CCTV Backend API (/api/v1)
    participant Cam as Physical Camera (LAN)
    participant MTX as MediaMTX & SIP Ingest Gateway
    actor Cust as Customer Premise

    Note over Tech,API: Phase 1: Authentication & Schedule
    Tech->>API: POST /auth/login (JWT with role: technician)
    Tech->>API: GET /installations/assigned (or /technicians/:id/schedule)
    Tech->>API: POST /installations/technicians/:id/gps (Live GPS tracking)
    Tech->>API: PUT /installations/:id (Status: "in-progress")

    Note over Tech,Cam: Phase 2: Physical Mounting & Ingest Configuration
    Tech->>Cam: Mount hardware, wire PoE / Wi-Fi, inspect IP & Serial
    Tech->>API: POST /cameras/build-rtsp-url (Auto-resolve brand RTSP path)
    Tech->>API: POST /cameras/provision (Register Camera, link Job, get Ingest Config)
    API->>MTX: Register dynamic ingest slug (live_<slug>)
    
    alt Ingest Option A: Direct GB28181 SIP (Zero NAT / Port Forwarding)
        Cam->>MTX: Push SIP Keepalives & RTP Video (UDP 5060)
    else Ingest Option B: On-Premises RTSP Relay
        Tech->>Cam: Deploy relay-ip-camera.sh / Docker cctv-relay
        Cam-->>MTX: ffmpeg -c copy push to rtsp://<VPS>:8554/live_<slug>
    end

    Note over Tech,Cam: Phase 3: Quick Pairing & Calibration
    Tech->>API: POST /cameras/:id/qr-scan (Mark online, generate QR identifier)
    Tech->>API: GET /cameras/:id/stream-status (Check live bitrate & readers)
    Tech->>API: POST /streams/:id/webrtc/offer (Inspect live stream in mobile app)
    Tech->>API: POST /cameras/:id/ptz (Verify Pan-Tilt-Zoom motor)
    Tech->>API: PATCH /cameras/:id/recording & /motion (Configure parameters)

    Note over Tech,Cust: Phase 4: Sign-Off & Commissioning
    Tech->>API: POST /installations/:id/checklist (Check off mounting & cabling)
    Tech->>API: POST /installations/:id/photos (Upload proof-of-work pictures)
    Cust->>Tech: Signs digital handover on mobile screen
    Tech->>API: POST /installations/:id/signature (Upload signature PNG)
    Tech->>API: PATCH /installations/:id/complete (Mark completed)
    API-->>Cust: Dispatches completion SMS/Push notification
```

---

## Detailed Step-by-Step Flow

### Phase 1: Authentication, Queue Fetch & Travel Tracking

#### 1. Technician Authentication
Technicians authenticate against `POST /api/v1/auth/login`. The resulting JWT token encapsulates:
```json
{
  "userId": "67b8d1a10000000000000055",
  "email": "technician@cctv.com",
  "role": "technician",
  "franchiseId": "67b8d1a10000000000000020",
  "permissions": [
    "cameras:read", "cameras:write", "cameras:configure",
    "installations:read", "installations:write",
    "notifications:read"
  ]
}
```
*Code References:* [permissions.seed.ts](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/config/permissions.seed.ts#L164-L172), [auth.service.ts](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/services/auth.service.ts).

#### 2. Retrieving Assigned Dispatch Queue
The Technician App fetches the list of active/scheduled jobs:
- **Assigned Jobs:** `GET /api/v1/installations/assigned`
- **Technician Schedule:** `GET /api/v1/installations/technicians/:id/schedule`
- **Job Details:** `GET /api/v1/installations/:id`

The returned job includes the site address, client contact info, target camera serial/model, and checklist templates.
*Code References:* [getAssignedJobs](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/services/job.service.ts#L267-L275), [getTechnicianSchedule](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/services/job.service.ts#L482-L498).

#### 3. Live En-Route GPS Telemetry & Status Update
While traveling to the site, the mobile app pushes background coordinates every 30–60 seconds:
```http
POST /api/v1/installations/technicians/67b8d1a10000000000000055/gps
Content-Type: application/json

{
  "lat": 12.971598,
  "lng": 77.594566
}
```
Upon arrival, the technician advances the job state:
```http
PUT /api/v1/installations/67b8d1a10000000000000099
Content-Type: application/json

{
  "status": "in-progress",
  "notes": "Arrived at customer site. Commencing cable routing and mounting."
}
```
*Code References:* [updateGpsLocation](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/services/job.service.ts#L512-L537), [updateJobStatus](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/services/job.service.ts#L162-L213).

---

### Phase 2: Hardware Installation & RTSP Generation

1. **Mounting & Local LAN Connection**:
   - The technician physically fixes the camera mount, runs weather-sealed Ethernet (PoE) or connects to the premises Wi-Fi.
   - The technician identifies the camera's local IP address (e.g., `192.168.1.120`).

2. **Automated Brand RTSP Resolution**:
   If the technician does not know the exact RTSP syntax for the brand, the app invokes:
   ```http
   POST /api/v1/cameras/build-rtsp-url
   Content-Type: application/json

   {
     "brand": "hikvision",
     "ip": "192.168.1.120",
     "port": 554,
     "username": "admin",
     "password": "CameraSecurePassword!1",
     "channel": 1,
     "stream": "main"
   }
   ```
   **Response:**
   ```json
   {
     "success": true,
     "data": {
       "rtspUrl": "rtsp://admin:CameraSecurePassword!1@192.168.1.120:554/Streaming/Channels/101"
     }
   }
   ```
   *Supported Brands:* Hikvision, Dahua, CP Plus, Tapo (TP-Link), Reolink, Xiongmai/ICSee, and Generic ONVIF.
   *Code Reference:* [buildBrandRtspUrl](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/services/camera.service.ts).

---

### Phase 3: Atomic Camera Provisioning & Ingest Setup

The technician submits the camera configuration directly to the backend setup wizard:
```http
POST /api/v1/cameras/provision
Content-Type: application/json

{
  "name": "Gate 1 North Entrance",
  "serialNumber": "DS-2CD2143G0-I-9847123",
  "brand": "hikvision",
  "ip": "192.168.1.120",
  "rtspUrl": "rtsp://admin:CameraSecurePassword!1@192.168.1.120:554/Streaming/Channels/101",
  "customerId": "67b8d1a10000000000000010",
  "franchiseId": "67b8d1a10000000000000020",
  "jobId": "67b8d1a10000000000000099",
  "streamMode": "gb28181",
  "probeRtsp": true,
  "location": {
    "street": "14 Industrial Estate",
    "city": "Bengaluru",
    "state": "Karnataka",
    "pincode": "560001",
    "latitude": 12.9716,
    "longitude": 77.5946
  },
  "settings": {
    "recordingEnabled": true,
    "motionDetectionEnabled": true,
    "aiFeaturesEnabled": false,
    "recordingRetentionDays": 30
  }
}
```

#### What the Backend Does Under the Hood:
1. **Creates [Camera](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/models/Camera.ts) record** with sanitized parameters and tenant franchise isolation.
2. **Associates Camera to the [InstallationJob](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/models/InstallationJob.ts)** so the job record links directly to the camera document.
3. **Generates GB28181 SIP Identity**: Generates unique `deviceId` (e.g. `34020000001320000005`) and SIP password.
4. **Probes RTSP (optional)**: Uses `ffprobe` to verify local stream reachability, video codec (`h264`), and resolution (`1920x1080`).
5. **Returns Multi-Tier Bridge Commands**:
   ```json
   {
     "success": true,
     "data": {
       "camera": { "_id": "67c000000000000000000001", "name": "Gate 1 North Entrance", "status": "online" },
       "streamConfig": {
         "streamSlug": "ds_2cd2143g0_i_9847123",
         "ingestPath": "live_ds_2cd2143g0_i_9847123",
         "vpsIngestUrl": "rtsp://api-cctv-backend.duckdns.org:8554/live_ds_2cd2143g0_i_9847123",
         "webrtcPlaybackUrl": "https://api-cctv-backend.duckdns.org/webrtc/live_ds_2cd2143g0_i_9847123/whep"
       },
       "gb28181Config": {
         "sipServer": "api-cctv-backend.duckdns.org",
         "sipPort": 5060,
         "serverId": "34020000002000000001",
         "deviceId": "34020000001320000005",
         "password": "..."
       },
       "setupGuide": {
         "tier1_direct_sip": { ... },
         "tier2_nat_relay": {
           "bashCommand": "./scripts/relay-ip-camera.sh \"rtsp://...\" \"ds_2cd2143g0_i_9847123\"",
           "dockerCommand": "docker run -d --restart=always --name cctv_relay_... cctv-relay"
         },
         "tier3_ptz_bridge": { ... }
       }
     }
   }
   ```
*Code Reference:* [provisionCamera](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/services/camera.service.ts#L1054-L1230).

---

### Phase 4: Ingest Execution & In-App Testing

Depending on the camera hardware and local router configuration, the technician configures stream ingestion using one of three tiers:

#### Tier 1: Direct GB28181 SIP Push (Recommended for Enterprise/Standard Hardware)
- The technician logs into the camera web configuration page.
- Under **Platform Access / GB28181**, enters the `sipServer`, `sipPort (5060)`, `serverId`, `deviceId`, and `password` returned by the API.
- The camera registers directly with the cloud SIP server across residential NAT with **zero port forwarding required**.

#### Tier 2: On-Premises RTSP Relay Bridge (For Residential / NAT-Locked Cameras)
- If the camera only supports standard RTSP, an on-premises bridge (Raspberry Pi, NVR box, or local mini-PC) executes [relay-ip-camera.sh](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/scripts/relay-ip-camera.sh):
  ```bash
  ./scripts/relay-ip-camera.sh "rtsp://admin:pass@192.168.1.120:554/Streaming/Channels/101" "ds_2cd2143g0_i_9847123"
  ```
- Uses FFmpeg `-c copy` with zero transcoding latency and negligible CPU usage.

#### Tier 3: Local ONVIF PTZ Relay Bridge
- If PTZ motorized control is needed for a camera behind NAT, the technician initializes [onvif-ptz-bridge.js](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/scripts/onvif-ptz-bridge.js) on the local network. It connects via WebSocket to the cloud backend and translates incoming cloud commands into local ONVIF SOAP calls.

#### Rapid Pairing via QR Scan
To finalize registration, the technician scans the physical QR code on the camera chassis:
```http
POST /api/v1/cameras/67c000000000000000000001/qr-scan
```
This flips status to `online`, updates `health.lastPing`, and assigns a permanent QR badge identifier (`CAM-67c000...`).
*Code Reference:* [qrScanCamera](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/services/camera.service.ts#L802-L826).

#### Stream Verification & Calibration on Mobile
1. **Live Stream Telemetry**:
   - `GET /api/v1/cameras/:id/stream-status` returns publisher status and live reader count directly from MediaMTX.
2. **Sub-second WebRTC Playback**:
   - The app negotiates an SDP handshake using `POST /api/v1/streams/:cameraId/webrtc/offer` ([webrtcOffer](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/routes/v1/stream.routes.ts#L97-L103)) to display live video on the technician's screen.
3. **PTZ Motor Direction Check**:
   - If PTZ is supported, the technician tests motors using `POST /api/v1/cameras/:id/ptz` with `{ "direction": "left" | "right" | "zoomin" }`.
4. **Parameter Toggles**:
   - Recording toggle: `PATCH /api/v1/cameras/:id/recording`
   - Motion sensitivity: `PATCH /api/v1/cameras/:id/motion`
   - AI person/vehicle analytics: `PATCH /api/v1/cameras/:id/ai`

---

### Phase 5: Checklist, Proof of Work & Customer Handover

Once the feed is verified, the technician completes quality assurance:

#### 1. Submit Installation Checklist
```http
POST /api/v1/installations/67b8d1a10000000000000099/checklist
Content-Type: application/json

{
  "checklist": [
    { "item": "Camera securely mounted with anti-vibration fixtures", "checked": true },
    { "item": "Cat6 cabling routed through weatherproof conduit", "checked": true },
    { "item": "RJ45 connector crimped and tested with cable certifier", "checked": true },
    { "item": "Lens cleaned and protective film removed", "checked": true },
    { "item": "Live WebRTC stream validated in technician app", "checked": true },
    { "item": "Motion detection alert boundaries configured", "checked": true },
    { "item": "Night-vision IR illumination tested", "checked": true }
  ]
}
```
*Code Reference:* [submitChecklist](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/services/job.service.ts#L288-L314).

#### 2. Upload Proof-of-Work Site Photos
The technician takes site photos (camera mount, wiring conduit, view angle) and uploads up to 10 images:
```http
POST /api/v1/installations/67b8d1a10000000000000099/photos
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="photos"; filename="mount_front.jpg"
Content-Type: image/jpeg
...
------WebKitFormBoundary
Content-Disposition: form-data; name="photos"; filename="cabling_conduit.jpg"
Content-Type: image/jpeg
...
```
*Code Reference:* [uploadJobPhotos](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/services/job.service.ts#L327-L347).

#### 3. Capture Customer Digital Signature
The customer inspects the live feed on the technician's app and signs their name on the touch screen:
```http
POST /api/v1/installations/67b8d1a10000000000000099/signature
Content-Type: multipart/form-data

(Field 'signature' containing customer_sign.png)
```
*Code Reference:* [uploadCustomerSignature](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/services/job.service.ts#L359-L378).

---

### Phase 6: Job Completion & Automated Commissioning

#### 1. Finalize Job
```http
PATCH /api/v1/installations/67b8d1a10000000000000099/complete
Content-Type: application/json

{
  "notes": "Installation fully verified. Customer trained on mobile app navigation."
}
```

#### What Happens Automatically:
- Status changes to `completed`.
- Timestamp `completedAt` is recorded.
- System creates an audit entry in [ActivityLog](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/models/ActivityLog.ts): `JOB_COMPLETED`.
- Real-time notification dispatched to Franchise Admin and Customer: `"The installation job 'Gate 1 North Entrance' has been marked as completed."`
- The camera feed is released into active rotation for 24/7 Control Room Operator monitoring.

#### 2. Completion Report Retrieval
Admins and Technicians can fetch an aggregated report at any time:
```http
GET /api/v1/installations/67b8d1a10000000000000099/report
```
Returns technician details, camera specs, checklist items with timestamps, photos, and customer signature URL.
*Code Reference:* [getJobReport](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/services/job.service.ts#L441-L469).

---

## Complete API Matrix for Technician Operations

| HTTP Method | Route Path | Permission | Purpose / Description |
|:---:|---|:---:|---|
| `POST` | `/api/v1/auth/login` | Public | Authenticate technician and receive scoped JWT |
| `GET` | `/api/v1/installations/assigned` | `installations:read` | Retrieve active jobs assigned to the current technician |
| `GET` | `/api/v1/installations/technicians/:id/schedule` | Authenticated | View upcoming dispatch calendar |
| `POST` | `/api/v1/installations/technicians/:id/gps` | `installations:write` | Push live GPS tracking coordinates while en route |
| `PUT` | `/api/v1/installations/:id` | `installations:write` | Update job status (`scheduled` → `in-progress`) |
| `POST` | `/api/v1/cameras/build-rtsp-url` | `cameras:write` | Auto-format brand-specific RTSP stream URLs |
| `POST` | `/api/v1/cameras/provision` | `cameras:write` | Atomically register camera, link job, and generate streaming configs |
| `POST` | `/api/v1/cameras/:id/qr-scan` | `cameras:configure` | Scan hardware QR badge to activate and pair camera |
| `GET` | `/api/v1/cameras/:id/stream-status` | `cameras:read` | Inspect live MediaMTX publisher status and active readers |
| `POST` | `/api/v1/streams/:cameraId/webrtc/offer` | `streams:view` | Negotiate WebRTC WHEP offer for live stream viewing |
| `POST` | `/api/v1/cameras/:id/ptz` | `cameras:configure` | Send PTZ directional control commands |
| `PATCH` | `/api/v1/cameras/:id/recording` | `cameras:configure` | Toggle 24/7 or schedule recording |
| `PATCH` | `/api/v1/cameras/:id/motion` | `cameras:configure` | Configure motion detection sensitivity |
| `PATCH` | `/api/v1/cameras/:id/ai` | `cameras:configure` | Toggle AI person/vehicle detection |
| `POST` | `/api/v1/installations/:id/checklist` | `installations:write` | Submit completed on-site installation checklist items |
| `POST` | `/api/v1/installations/:id/photos` | `installations:write` | Upload up to 10 proof-of-work installation photos |
| `POST` | `/api/v1/installations/:id/signature` | `installations:write` | Upload customer digital handover signature |
| `PATCH` | `/api/v1/installations/:id/complete` | `installations:write` | Mark installation complete and commission camera |
| `GET` | `/api/v1/installations/:id/report` | `installations:read` | Fetch full installation summary report |

---

## File and Component Cross-Reference

- **Routes**:
  - [job.routes.ts](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/routes/v1/job.routes.ts) — `/api/v1/installations` & `/api/v1/jobs`
  - [camera.routes.ts](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/routes/v1/camera.routes.ts) — `/api/v1/cameras`
  - [stream.routes.ts](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/routes/v1/stream.routes.ts) — `/api/v1/streams`
- **Controllers & Services**:
  - [job.controller.ts](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/controllers/job.controller.ts) & [job.service.ts](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/services/job.service.ts)
  - [camera.controller.ts](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/controllers/camera.controller.ts) & [camera.service.ts](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/services/camera.service.ts)
- **Database Models**:
  - [InstallationJob.ts](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/models/InstallationJob.ts)
  - [Camera.ts](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/models/Camera.ts)
  - [User.ts (ITechnicianDetails)](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/src/models/User.ts#L75-L82)
- **Field Scripts & Bridges**:
  - [relay-ip-camera.sh](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/scripts/relay-ip-camera.sh) — On-premises RTSP relay
  - [onvif-ptz-bridge.js](file:///home/rishab/Personal/WebDev/CCTV%20Monitoring%20Backend/scripts/onvif-ptz-bridge.js) — Cloud-to-local ONVIF PTZ bridge
