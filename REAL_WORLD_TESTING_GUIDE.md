# 🌍 CCTV Monitoring Platform — Real-World Live Testing Guide
**Target System:** `http://200.141.12.143`  
**API Gateway:** `http://200.141.12.143/api/v1`  
**RTSP Port:** `200.141.12.143:8554`  
**Admin Panel:** `http://200.141.12.143`  

---

## 🎯 Objective
This guide eliminates all mock or synthetic demo feeds. You will test the platform using **actual physical CCTV cameras** and **real video sources** (Physical IP Cameras, Smartphones, Laptop Webcams) under real-world operating conditions.

---

## 📑 Table of Contents
1. [One-Time VPS Step: Enable Real RTSP Ingestion](#1-one-time-vps-step-enable-real-rtsp-ingestion)
2. [Connecting Real Hardware Streams (3 Methods)](#2-connecting-real-hardware-streams-3-methods)
   * [Method A: Physical IP Camera (Hikvision, Dahua, CP Plus, Tapo, Reolink)](#method-a-physical-ip-camera-hikvision-dahua-cp-plus-tapo-reolink)
   * [Method B: Smartphone as a CCTV IP Camera (iOS / Android)](#method-b-smartphone-as-a-cctv-ip-camera-ios--android)
   * [Method C: Laptop / USB Webcam as a Real Room Camera](#method-c-laptop--usb-webcam-as-a-real-room-camera)
3. [Registering Your Real Cameras in the Admin Panel](#3-registering-your-real-cameras-in-the-admin-panel)
4. [Real-World Operational Test Cases](#4-real-world-operational-test-cases)
   * [Test 1: Live Multi-Camera Surveillance Grid](#test-1-live-multi-camera-surveillance-grid)
   * [Test 2: Two-Way Audio Talkback Dispatch](#test-2-two-way-audio-talkback-dispatch)
   * [Test 3: Real Physical Motion Event & Alert Triage](#test-3-real-physical-motion-event--alert-triage)
   * [Test 4: Emergency SOS Panic Broadcast](#test-4-emergency-sos-panic-broadcast)
   * [Test 5: Incident Investigation with Real Forensic Photo Evidence](#test-5-incident-investigation-with-real-forensic-photo-evidence)
   * [Test 6: Operator Command Shift Handoff](#test-6-operator-command-shift-handoff)
   * [Test 7: Multi-Tenant Franchise Isolation](#test-7-multi-tenant-franchise-isolation)
   * [Test 8: Real Customer Subscription & Razorpay Payment](#test-8-real-customer-subscription--razorpay-payment)
5. [Real-World Edge Cases & Hardware Failure Modes](#5-real-world-edge-cases--hardware-failure-modes)

---

## 1. One-Time VPS Step: Enable Real RTSP Ingestion

To allow your physical camera or smartphone to push RTSP video streams into your VPS, Docker must forward port **8554**.

Run this on your VPS as `deploy`:

```bash
# 1. Update the systemd service to publish port 8554
sudo sed -i 's|-p 127.0.0.1:8080:8080|-p 127.0.0.1:8080:8080 -p 8554:8554|' /etc/systemd/system/cctv-backend.service

# 2. Reload and restart backend service
sudo systemctl daemon-reload
sudo systemctl restart cctv-backend

# 3. Verify port 8554 is listening
sudo netstat -tlpn | grep 8554
# Expected: tcp 0 0 0.0.0.0:8554 LISTEN (docker-proxy)
```

---

## 2. Connecting Real Hardware Streams (3 Methods)

### Method A: Physical IP Camera (Hikvision, Dahua, CP Plus, Tapo, Reolink)

Physical CCTV cameras stream H.264 video over RTSP on port 554 of your local network.

#### Step 1: Find your camera's RTSP URL
Log into your camera's mobile app or web interface to check its IP address and RTSP credentials.

| Camera Brand | RTSP URL Format |
|---|---|
| **TP-Link Tapo** | `rtsp://<username>:<password>@<CAMERA_IP>:554/stream1` |
| **Hikvision** | `rtsp://<username>:<password>@<CAMERA_IP>:554/Streaming/Channels/101` |
| **Dahua / CP Plus** | `rtsp://<username>:<password>@<CAMERA_IP>:554/cam/realmonitor?channel=1&subtype=0` |
| **Reolink** | `rtsp://<username>:<password>@<CAMERA_IP>:554/h264Preview_01_main` |
| **Generic ONVIF** | `rtsp://<username>:<password>@<CAMERA_IP>:554/live/ch0` |

#### Step 2: Bridge the Camera to your VPS
From your computer on the same Wi-Fi network as the camera, run the relay bridge script:

```bash
cd "/home/rishab/Personal/WebDev/CCTV Monitoring Backend"

# Replace with your camera's actual credentials and IP:
./scripts/relay-ip-camera.sh "rtsp://admin:mypassword@192.168.1.100:554/stream1" physical_cam_01
```

> **Why this works:** The script reads raw H.264 packets directly from your physical camera and pushes them to your VPS at `rtsp://200.141.12.143:8554/physical_cam_01` with **zero re-encoding** (~0% CPU, 0ms transcode lag).

---

### Method B: Smartphone as a CCTV IP Camera (iOS / Android)

Turn any iPhone or Android phone into a high-definition real-time CCTV security camera.

1. **Install a free RTSP streaming app on your phone:**
   * **Android / iOS (Recommended):** **Larix Broadcaster** (free, professional, sub-second latency)
   * Alternative (Android): **IP Webcam** or **RTSP Camera**
2. **Configure Outgoing RTSP Connection in the App:**
   * Open **Larix Broadcaster** → Settings (gear icon) → **Connections** → **Add Connection**
   * **Name:** `CCTV Platform VPS`
   * **URL:** `rtsp://200.141.12.143:8554/phone_cam`
   * **Target Type:** `RTSP`
   * **Video Format:** `H.264`, `1280x720` or `1920x1080` @ `25 fps`
   * Click **Save**.
3. **Start Broadcasting:**
   * Tap the large red **Record / Broadcast** button on your phone.
   * Your phone's real camera lens is now transmitting live physical video to your VPS!

---

### Method C: Laptop / USB Webcam as a Real Room Camera

Use your laptop webcam (or connected USB webcam) to monitor your room.

Run this command in a terminal on your computer:

```bash
cd "/home/rishab/Personal/WebDev/CCTV Monitoring Backend"

# Starts streaming your real webcam to the VPS:
./scripts/stream-webcam.sh
```

> This captures `/dev/video0` and pushes real-time H.264 video to `rtsp://200.141.12.143:8554/webcam_01`.

---

## 3. Registering Your Real Cameras in the Admin Panel

Once you have one or more streams running (e.g., `physical_cam_01`, `phone_cam`, or `webcam_01`), register them in your live dashboard:

1. Open **`http://200.141.12.143`** in your browser and log in as `admin@cctv.com` (`Admin@123`).
2. Go to **Cameras** (`/cameras`) → click **Add Camera**:
   * **Camera Name:** `Physical Entrance Camera` (or `Mobile Patrol Unit`)
   * **Serial Number:** `REAL-CAM-001` (must be unique)
   * **RTSP URL:** `rtsp://localhost:8554/physical_cam_01` (or `rtsp://localhost:8554/phone_cam` / `webcam_01`)
   * **Location:** `Front Office / Living Room`
   * **Franchise:** `Metro Security & Surveillance Services`
   * **Customer:** `Vikram Malhotra`
   * **Enable Features:** Toggle `Talkback Enabled`, `Motion Detection`, `Continuous Recording`.
3. Click **Save Camera**.

---

## 4. Real-World Operational Test Cases

### Test 1: Live Multi-Camera Surveillance Grid
* **Action:**
  1. Have both your physical camera and your phone camera streaming simultaneously.
  2. Open **Live Grid** (`/live`).
  3. Select **2x2 Grid View**.
* **Real-World Verification:**
  * Wave your hand in front of your smartphone camera.
  * Wave your hand in front of your physical IP camera.
  * Watch both live video feeds update on your screen in real time with **sub-second latency** (< 1.5 seconds delay).

---

### Test 2: Two-Way Audio Talkback Dispatch
* **Action:**
  1. Click on your active camera in the Live Grid.
  2. Press and hold the **Talkback Microphone** button (`Hold to Speak`).
  3. Speak clearly into your laptop microphone:  
     `"Security warning: This area is under 24/7 active CCTV surveillance."`
  4. Release the button.
* **Real-World Verification:**
  * Microphone icon pulses red while active.
  * WebRTC audio packets are transmitted through the VPS streaming gateway.

---

### Test 3: Real Physical Motion Event & Alert Triage
* **Action:**
  1. Stand up and physically walk across the camera's field of view.
  2. Trigger an alert event via curl or the camera's AI detection webhook:
     ```bash
     curl -X POST http://200.141.12.143/api/v1/alerts \
       -H "Content-Type: application/json" \
       -H "Authorization: Bearer <ACCESS_TOKEN>" \
       -d '{
         "camera": "<CAMERA_ID>",
         "type": "motion",
         "severity": "high",
         "description": "Physical motion detected at entrance",
         "snapshotUrl": "https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&w=600&q=80"
       }'
     ```
* **Real-World Verification:**
  * Without refreshing your browser, a real-time alert card instantly pops up in the bottom-right corner.
  * An audible chime plays through your browser speakers.
  * Alert shows in `/alerts` with status `New`.
  * Click **Acknowledge** → Status changes to `Acknowledged` with your operator name and timestamp.

---

### Test 4: Emergency SOS Panic Broadcast
* **Action:**
  1. On the top navigation bar, click the red **Emergency SOS** button (`/sos`).
  2. Select your real camera (`Physical Entrance Camera`).
  3. Reason: `Intrusion in Progress / Unauthorized Entry`.
  4. Click **DISPATCH EMERGENCY**.
* **Real-World Verification:**
  * A full-width red emergency flashing banner covers the dashboard.
  * System alerts all connected operators across all browser tabs via WebSockets.
  * An emergency record is added to the command center timeline.

---

### Test 5: Incident Investigation with Real Forensic Photo Evidence
* **Action:**
  1. Go to **Incidents** (`/incidents`) → click **New Incident**.
  2. Take a real photograph with your phone or webcam (e.g. holding up an object).
  3. In the Incident Form:
     * Title: `Suspicious Object Detected at Perimeter`
     * Priority: `High`
     * Category: `Security Breach`
     * Evidence: Upload the real photograph you just took.
  4. Click **Create Incident**.
* **Real-World Verification:**
  * The image is uploaded and processed through the server pipeline.
  * The thumbnail renders crisply on the Incident Detail page (`/incidents/:id`).
  * Add an investigator comment: `"Dispatched patrol team. Object verified and logged."`
  * Advance status: `Open` → `Investigating` → `Resolved`.

---

### Test 6: Operator Command Shift Handoff
* **Action:**
  1. Log out and log in as `operator@cctv.com` (`Operator@123`).
  2. Navigate to **Operator Shifts** (`/operator-shifts`).
  3. Click **Check In for Shift** (e.g. `Night Duty`).
  4. Notice the active shift timer counting live on the screen.
  5. After monitoring, click **End Shift / Check Out**.
  6. Enter shift handoff notes: `"Monitored real entrance camera. Zero breaches recorded."`
* **Real-World Verification:**
  * Shift is saved with exact login/logout timestamps and duration.
  * Super Admin can audit the shift report under `/audit-logs`.

---

### Test 7: Multi-Tenant Franchise Isolation
* **Action:**
  1. Log in as Franchise Owner `franchise@cctv.com` (`Franchise@123`).
  2. Check the camera list under `/cameras`.
* **Real-World Verification:**
  * Franchise Admin **ONLY** sees cameras belonging to `Metro Security (FR-METRO-01)`.
  * Open browser DevTools (`F12`) Console and attempt to access another tenant's data:
    ```javascript
    fetch('/api/v1/cameras/660000000000000000000001', {
      headers: { 'Authorization': `Bearer ${sessionStorage.getItem('accessToken')}` }
    }).then(r => console.log('HTTP Status:', r.status));
    ```
  * Returns HTTP `403 Forbidden` (`You do not have access to this camera's franchise network`).

---

### Test 8: Real Customer Subscription & Razorpay Payment
* **Action:**
  1. Log in as Customer `customer@cctv.com` (`Customer@123`).
  2. Customer sees only their property's cameras in the feed.
  3. Go to **Subscriptions** (`/subscriptions`) → click **Upgrade / Renew Subscription**.
  4. Click **Pay with Razorpay**.
  5. The Razorpay checkout dialog opens with test key `rzp_test_TDyIUfTZ34ASeA`.
  6. Select **Card** (use test card `4111 1111 1111 1111`, any future expiry, CVV `123`).
  7. Complete payment.
* **Real-World Verification:**
  * Payment succeeds and triggers payment verification webhook.
  * Subscription status shows green `Active` with expiration date extended by 1 year.
  * PDF Invoice is generated under `/invoices`.

---

## 5. Real-World Edge Cases & Hardware Failure Modes

| # | Real-World Scenario | Physical Action | Expected Behavior |
|---|---|---|---|
| **E1** | **Physical Camera Unplugged** | Disconnect Wi-Fi on the streaming phone or power off the IP camera | Player detects dropped stream, switches badge to **Offline / Reconnecting...** without crashing. |
| **E2** | **Physical Camera Reconnected** | Reconnect Wi-Fi on the phone or power on camera | Stream auto-recovers within 5 seconds; player resumes video without manual browser refresh. |
| **E3** | **Microphone Permission Denied** | Click Talkback but block browser mic permissions | Shows friendly toast: *"Microphone access denied. Grant permissions in browser settings."* |
| **E4** | **Unstable 4G/5G Network** | Switch phone to low bandwidth (toggle 3G/throttle) | MediaMTX buffers gracefully; video framerate drops but connection stays alive. |
| **E5** | **Multiple Simultaneous Viewers** | Open `http://200.141.12.143/live` in 3 separate browsers/devices | All 3 screens play the identical real video feed simultaneously with no lag divergence. |
| **E6** | **Server Reboot Recovery** | Run `sudo reboot` on the VPS while cameras are streaming | Within 45 seconds, VPS reboots, Docker auto-starts, and streams reconnect automatically. |
