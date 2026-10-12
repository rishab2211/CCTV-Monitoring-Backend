# 📹 Standardized Camera Onboarding & Streaming Architecture

## Executive Summary

Previously, individual camera paths (`phone_cam`, `phone_cam_1`) were hardcoded inside `mediamtx.yml` with specific FFmpeg transcoding commands. Every time a new camera was onboarded, an engineer had to manually edit `mediamtx.yml` and restart the MediaMTX container.

**The system has now been standardized:**
1. **Zero Manual Edits**: MediaMTX uses dynamic regular expression templates (`~^raw_([a-zA-Z0-9_-]+)$` and `~^([a-zA-Z0-9_-]+)_raw$`). Any new camera stream published with the standardized naming is instantly recognized without touching `mediamtx.yml` or restarting services.
2. **Seamless Audio + Video**: Incoming camera feeds (which send AAC or PCM audio) are automatically transcoded to **Opus audio** while keeping **H.264 video copied untouched** (`-c:v copy`). This allows web browsers (Chrome, Safari, Firefox, Edge) to play both live video and crystal-clear audio with sub-second WebRTC latency.
3. **Smart Backend Resolution**: The backend API (`stream.service.ts` and `mediamtx.service.ts`) automatically resolves between raw ingests and live playback feeds. Whether a user registers `raw_camera_01`, `live_camera_01`, or simply `camera_01`, the system routes clients to the live Opus stream seamlessly.

---

## Technical Architecture

```
                                      ┌─────────────────────────────────────────────────────────────┐
                                      │                   MediaMTX Gateway (Port 8554/8889)         │
                                      │                                                             │
[Camera / Phone]                      │  1. Ingestion:                                              │
AAC Audio + H.264 Video ─────────────┼─► rtsp://<host>:8554/raw_<stream_id>                       │
(Larix / IP Cam / Relay)              │        │                                                    │
                                      │        ▼                                                    │
                                      │  2. Dynamic Hook (~^raw_([a-zA-Z0-9_-]+)$):                 │
                                      │     FFmpeg: -c:v copy -c:a libopus -b:a 64k -async 50       │
                                      │        │                                                    │
                                      │        ▼                                                    │
                                      │  3. Playback:                                               │
                                      │     rtsp://127.0.0.1:8554/live_<stream_id>                 │
                                      │        │                                                    │
                                      │        ▼ (WHEP / WebRTC on Port 8889)                       │
                                      └────────┼────────────────────────────────────────────────────┘
                                               │
                                               ▼
                                      [Web Browser / Dashboard]
                                      • Video: H.264 (0ms lag, ~0% server CPU)
                                      • Audio: Opus (native browser WebRTC playback)
```

### Why Opus Audio is Essential
* WebRTC standards in modern web browsers **do not support AAC audio**.
* Most CCTV IP cameras and mobile broadcasting apps send audio encoded in **AAC** or **G.711 PCM**.
* If a raw AAC stream is routed directly to a browser via WebRTC, the browser cannot negotiate or decode the audio track, resulting in complete silence.
* The standardized pipeline intercepts incoming audio on MediaMTX, transcodes it to **Opus** at 64 kbps, and copies the H.264 video track untouched (`-c:v copy`). Video remains zero-lag with minimal CPU footprint, and audio plays instantly in the browser.

---

## Standardized Camera Onboarding Procedure

### Naming Convention
* **Ingest Path (Push from Camera/App):** `raw_<STREAM_ID>` *(e.g. `raw_gate_cam`, `raw_phone_02`)*
* **Playback Path (Dashboard / WebRTC):** `live_<STREAM_ID>` *(e.g. `live_gate_cam`, `live_phone_02`)*

---

### Method 1: Smartphone as CCTV Camera (iOS & Android)

Turn any iPhone or Android smartphone into an enterprise CCTV camera with sub-second latency and two-way audio.

1. **Install Streaming App:**
   * **Android / iOS:** Install **Larix Broadcaster** (free on App Store & Google Play).
   * Alternative (Android): **IP Webcam** or **RTSP Camera**.

2. **Configure Connection in Larix Broadcaster:**
   * Open Larix Broadcaster → **Settings** (gear icon) → **Connections** → **Add Connection**.
   * **Name:** `CCTV Platform`
   * **URL:** `rtsp://<VPS_DOMAIN_OR_IP>:8554/raw_<CAMERA_NAME>`
     * *Example:* `rtsp://200.141.12.143:8554/raw_office_cam`
     * *(Or duckdns domain:* `rtsp://api-cctv-backend.duckdns.org:8554/raw_office_cam`*)*
   * **Target Type:** `RTSP`
   * **Video:** `H.264`, `1280x720` or `1920x1080` @ `25 fps`.
   * **Audio:** `AAC` (Enabled).
   * Tap **Save**.

3. **Start Streaming:**
   * Tap the red **Broadcast** button in Larix. The phone is now streaming raw H.264 + AAC to the VPS.
   * MediaMTX instantly triggers FFmpeg, producing `live_office_cam` with Opus audio.

4. **Register in CCTV Admin Dashboard:**
   * Go to **Cameras** → **Add Camera**:
     * **Camera Name:** `Office Camera`
     * **Serial Number:** `CAM-OFFICE-01`
     * **RTSP URL:** `rtsp://localhost:8554/live_office_cam` *(or simply `rtsp://localhost:8554/raw_office_cam` — the backend automatically resolves both!)*
     * **Location:** Select customer / franchise site.
     * **Features:** Enable Talkback, Motion Detection, Continuous Recording.
   * Click **Save Camera**. The feed appears live in the surveillance grid!

---

### Method 2: Physical IP Camera on Local LAN / Wi-Fi (Hikvision, Dahua, CP Plus, Tapo, Reolink)

To bridge an on-premise IP camera behind a home/office router to your cloud VPS:

1. **Run the Relay Bridge Script:**
   ```bash
   cd "/home/rishab/Personal/WebDev/CCTV Monitoring Backend"

   # Usage: ./scripts/relay-ip-camera.sh "<LOCAL_CAMERA_RTSP_URL>" <STREAM_ID>
   ./scripts/relay-ip-camera.sh "rtsp://admin:password@192.168.1.100:554/stream1" entrance_cam
   ```

2. **Register in the Admin Dashboard:**
   * **RTSP URL:** `rtsp://localhost:8554/live_entrance_cam`
   * Click **Save Camera**.

---

### Method 3: External Direct RTSP Camera (Public IP / Domain Pull)

When an IP camera or NVR has a publicly routable RTSP address or VPN:

1. **Register Directly in Admin Dashboard / API:**
   * **RTSP URL:** `rtsp://admin:password@public-cam.myfacility.com:554/live`
2. **Automatic Provisioning:**
   * When created, the backend calls MediaMTX's API to register `raw_<slug>` pulling from the camera URL.
   * MediaMTX's dynamic regex automatically converts audio to Opus on `live_<slug>`.
   * WebRTC clients stream audio and video seamlessly.

---

### Method 4: USB Webcam / Laptop Camera

To test with a laptop or USB webcam:

```bash
cd "/home/rishab/Personal/WebDev/CCTV Monitoring Backend"

# Streams /dev/video0 to rtsp://${RTSP_HOST}/raw_webcam_01
./scripts/stream-webcam.sh
```

Register in Dashboard with RTSP URL: `rtsp://localhost:8554/live_webcam_01`.

---

## API & Backend Endpoints Reference

### Registering Camera via REST API
```bash
POST /api/v1/cameras
Authorization: Bearer <ADMIN_OR_FRANCHISE_TOKEN>
Content-Type: application/json

{
  "name": "Warehouse North Gate",
  "serialNumber": "CAM-WH-02",
  "rtspUrl": "rtsp://localhost:8554/live_warehouse_north"
}
```

**Response includes auto-generated stream endpoints:**
```json
{
  "statusCode": 201,
  "data": {
    "camera": {
      "_id": "6708b1a4e23a4b001a123456",
      "name": "Warehouse North Gate",
      "serialNumber": "CAM-WH-02",
      "status": "offline"
    },
    "streamEndpoints": {
      "slug": "cam-wh-02",
      "ingestPath": "raw_cam-wh-02",
      "playbackPath": "live_cam-wh-02",
      "ingestRtspUrl": "rtsp://api-cctv-backend.duckdns.org:8554/raw_cam-wh-02",
      "playbackRtspUrl": "rtsp://localhost:8554/live_cam-wh-02",
      "webrtcUrl": "http://api-cctv-backend.duckdns.org/webrtc/live_cam-wh-02",
      "whepUrl": "http://api-cctv-backend.duckdns.org/webrtc/live_cam-wh-02/whep",
      "hlsUrl": "http://api-cctv-backend.duckdns.org/hls/live_cam-wh-02/index.m3u8"
    }
  },
  "message": "Camera registered successfully"
}
```

---

## Backward Compatibility Summary

| Legacy Configuration | Standardized Dynamic Equivalent | Status |
| :--- | :--- | :--- |
| `phone_cam` hardcoded in `mediamtx.yml` | `phone_cam` preserved for legacy tests; new feeds use `raw_<id>` | Fully Compatible |
| `phone_cam_1` hardcoded in `mediamtx.yml` | `phone_cam_1` preserved; any `phone_cam_N` uses `raw_phone_cam_N` | Fully Compatible |
| `phone_cam_live` output | `live_<name>` generated dynamically via regex | Fully Compatible |
| Talkback WHIP publishers (`camera_<id>_talkback`) | Regex `~^camera_[a-z0-9]+_talkback$` | Fully Preserved |
