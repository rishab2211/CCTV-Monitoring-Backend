#!/usr/bin/env node
/**
 * ==============================================================================
 * 🎮 ONVIF PTZ Relay Bridge
 * ==============================================================================
 * Bridges Cloud Socket.IO PTZ commands to local ONVIF IP Cameras (Xiongmai,
 * Hikvision, Dahua, CP Plus, Tapo, etc.) across NAT with zero port forwarding.
 *
 * Usage:
 *   node scripts/onvif-ptz-bridge.js <LOCAL_CAMERA_IP> [CAMERA_ID_OR_SLUG]
 * ==============================================================================
 */

const { io } = require("socket.io-client");

const CAMERA_IP = process.argv[2] || process.env.CAMERA_IP || "192.168.29.91";
const CAMERA_ID = process.argv[3] || process.env.CAMERA_ID || "6ad5f669c0cc94c86e9a6b9e";
const BACKEND_URL = process.env.BACKEND_URL || "https://api-cctv-backend.duckdns.org";
const ONVIF_PORT = process.env.ONVIF_PORT || 8899;
const ONVIF_ENDPOINT = `http://${CAMERA_IP}:${ONVIF_PORT}/onvif/ptz_service`;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("❌ Fatal Configuration Error: ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required.");
  console.error("   Example: ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=SecretPassword node scripts/onvif-ptz-bridge.js <IP> <CAMERA_ID>");
  process.exit(1);
}

let ONVIF_PROFILE_TOKEN = process.env.ONVIF_PROFILE_TOKEN || "000";

console.log("==================================================================");
console.log("🎮 CCTV Platform — Local ONVIF PTZ Bridge");
console.log("==================================================================");
console.log(`  Local Camera ONVIF : ${ONVIF_ENDPOINT}`);
console.log(`  Target Camera ID   : ${CAMERA_ID}`);
console.log(`  Cloud Backend URL  : ${BACKEND_URL}`);
console.log(`  ONVIF Profile Token: ${ONVIF_PROFILE_TOKEN}`);
console.log("==================================================================");

let inMemoryTokenCache = {
  token: null,
  expiresAt: 0,
};

async function login() {
  if (inMemoryTokenCache.token && Date.now() < inMemoryTokenCache.expiresAt) {
    return inMemoryTokenCache.token;
  }

  const res = await fetch(`${BACKEND_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`Login failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  const token = data.data?.tokens?.accessToken || data.data?.token;
  if (!token) {
    throw new Error("Login succeeded but returned no valid access token");
  }

  inMemoryTokenCache = {
    token,
    expiresAt: Date.now() + 6 * 3600 * 1000,
  };
  return token;
}

function buildContinuousMoveXml(x, y, zoom = null) {
  let velocityContent = "";
  if (zoom !== null) {
    velocityContent = `<tt:Zoom x="${zoom.toFixed(2)}"/>`;
  } else {
    velocityContent = `<tt:PanTilt x="${x.toFixed(2)}" y="${y.toFixed(2)}"/>`;
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">
  <soap:Body>
    <tptz:ContinuousMove>
      <tptz:ProfileToken>${ONVIF_PROFILE_TOKEN}</tptz:ProfileToken>
      <tptz:Velocity>
        ${velocityContent}
      </tptz:Velocity>
    </tptz:ContinuousMove>
  </soap:Body>
</soap:Envelope>`;
}

function buildStopXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <soap:Body>
    <tptz:Stop>
      <tptz:ProfileToken>${ONVIF_PROFILE_TOKEN}</tptz:ProfileToken>
      <tptz:PanTilt>true</tptz:PanTilt>
      <tptz:Zoom>true</tptz:Zoom>
    </tptz:Stop>
  </soap:Body>
</soap:Envelope>`;
}

async function sendOnvifCommand(xml) {
  try {
    const res = await fetch(ONVIF_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
      body: xml,
      signal: AbortSignal.timeout(3000),
    });
    return res.status === 200;
  } catch (err) {
    console.error(`❌ ONVIF Dispatch Error: ${err.message}`);
    return false;
  }
}

let lastMoveTime = 0;
let pendingStopTimer = null;

async function handlePtzDirection(direction, speed = 32) {
  const normSpeed = Math.min(Math.max(speed / 64, 0.4), 1.0);

  if (direction === "stop") {
    if (pendingStopTimer) clearTimeout(pendingStopTimer);
    const elapsed = Date.now() - lastMoveTime;
    const minStepMs = 600; // Allow physical motor to complete a clear visible step

    if (elapsed < minStepMs) {
      pendingStopTimer = setTimeout(async () => {
        console.log("🛑 Motor STOP (step completed)");
        await sendOnvifCommand(buildStopXml());
      }, minStepMs - elapsed);
      return true;
    }

    console.log("🛑 Motor STOP");
    return await sendOnvifCommand(buildStopXml());
  }

  if (pendingStopTimer) {
    clearTimeout(pendingStopTimer);
    pendingStopTimer = null;
  }
  lastMoveTime = Date.now();

  let x = 0.0;
  let y = 0.0;
  let zoom = null;

  switch (direction) {
    case "left":
      x = -normSpeed;
      break;
    case "right":
      x = normSpeed;
      break;
    case "up":
      y = normSpeed;
      break;
    case "down":
      y = -normSpeed;
      break;
    case "upleft":
      x = -normSpeed;
      y = normSpeed;
      break;
    case "upright":
      x = normSpeed;
      y = normSpeed;
      break;
    case "downleft":
      x = -normSpeed;
      y = -normSpeed;
      break;
    case "downright":
      x = normSpeed;
      y = -normSpeed;
      break;
    case "zoomin":
      zoom = normSpeed;
      break;
    case "zoomout":
      zoom = -normSpeed;
      break;
    default:
      console.warn(`⚠️ Unknown PTZ direction: ${direction}`);
      return false;
  }

  console.log(`🕹️ Moving [${direction.toUpperCase()}] at speed ${normSpeed.toFixed(2)}...`);
  return await sendOnvifCommand(buildContinuousMoveXml(x, y, zoom));
}

async function resolveCameraId(token, identifier) {
  if (!identifier) return identifier;
  if (/^[0-9a-fA-F]{24}$/.test(identifier)) return identifier;
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/cameras?limit=50`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return identifier;
    const data = await res.json();
    const cameras = data.data?.data || data.data?.cameras || (Array.isArray(data.data) ? data.data : []);
    const words = identifier.toLowerCase().split(/[_-]+/).filter(Boolean);
    const match = cameras.find(c => {
      const haystack = `${c.name} ${c.serialNumber} ${c.rtspUrl} ${c._id}`.toLowerCase();
      return words.every(w => haystack.includes(w));
    });
    if (match) {
      console.log(`🎯 Resolved Camera Slug "${identifier}" -> "${match.name}" (${match._id})`);
      return match._id;
    }
  } catch (err) {
    console.warn(`Could not resolve camera slug: ${err.message}`);
  }
  return identifier;
}

async function main() {
  console.log("🔐 Authenticating with platform API...");
  const token = await login();
  console.log("✅ Authenticated successfully");

  const resolvedCameraId = await resolveCameraId(token, CAMERA_ID);

  console.log(`🔌 Connecting to real-time gateway: ${BACKEND_URL}...`);
  const socket = io(BACKEND_URL, {
    path: "/socket.io/",
    transports: ["polling", "websocket"],
    auth: { token },
  });

  socket.on("connect", () => {
    console.log("⚡ Connected to Cloud Socket.IO!");
    console.log(`📡 Joining camera control room: camera_${resolvedCameraId}`);
    socket.emit("join_camera", resolvedCameraId);
    if (resolvedCameraId !== CAMERA_ID) {
      socket.emit("join_camera", CAMERA_ID);
    }
  });

  socket.on("camera_ptz_moved", async (data) => {
    if (data.cameraId === resolvedCameraId || data.cameraId === CAMERA_ID || !data.cameraId) {
      console.log(`📥 Cloud PTZ Event: ${data.direction} (speed: ${data.speed || 32})`);
      await handlePtzDirection(data.direction, data.speed);
    }
  });

  socket.on("disconnect", (reason) => {
    console.warn(`⚠️ Disconnected from Cloud Gateway: ${reason}. Auto-reconnecting...`);
  });

  socket.on("connect_error", (err) => {
    console.error(`❌ Connection Error: ${err.message}`);
  });
}

main().catch((err) => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
