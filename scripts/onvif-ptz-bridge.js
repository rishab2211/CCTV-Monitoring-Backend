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

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@cctvmonitor.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@1234";

let ONVIF_PROFILE_TOKEN = process.env.ONVIF_PROFILE_TOKEN || "000";

console.log("==================================================================");
console.log("🎮 CCTV Platform — Local ONVIF PTZ Bridge");
console.log("==================================================================");
console.log(`  Local Camera ONVIF : ${ONVIF_ENDPOINT}`);
console.log(`  Target Camera ID   : ${CAMERA_ID}`);
console.log(`  Cloud Backend URL  : ${BACKEND_URL}`);
console.log(`  ONVIF Profile Token: ${ONVIF_PROFILE_TOKEN}`);
console.log(`  Admin Auth User    : ${ADMIN_EMAIL}`);
console.log("==================================================================");

let inMemoryTokenCache = {
  token: null,
  expiresAt: 0,
};

async function login(force = false) {
  if (!force && inMemoryTokenCache.token && Date.now() < inMemoryTokenCache.expiresAt) {
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
    expiresAt: Date.now() + 10 * 60 * 1000,
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

function buildStopXml(stopZoom = false) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <soap:Body>
    <tptz:Stop>
      <tptz:ProfileToken>${ONVIF_PROFILE_TOKEN}</tptz:ProfileToken>
      <tptz:PanTilt>true</tptz:PanTilt>
      ${stopZoom ? "<tptz:Zoom>true</tptz:Zoom>" : ""}
    </tptz:Stop>
  </soap:Body>
</soap:Envelope>`;
}

// Rate-limited, deduplicated, single-concurrency PTZ state machine
// Protects low-power embedded camera CPUs (Xiongmai/Anyka/Goke) from watchdog resets and RTSP starvation
let activeMotorState = {
  moving: false,
  direction: null,
  speed: 0,
  isZoom: false,
};

let pendingCommand = null;
let isWorkerRunning = false;
let lastCommandTime = 0;
const MIN_CMD_INTERVAL_MS = 150; // Pause between consecutive ONVIF calls to prevent starving RTSP daemon
const MIN_MOVE_PULSE_MS = 250;   // Minimum duration to allow motor a physical step before stopping

async function dispatchSoap(xml) {
  try {
    const res = await fetch(ONVIF_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
      body: xml,
      signal: AbortSignal.timeout(2000), // Strict 2s timeout to never hang
    });
    return res.status === 200;
  } catch (err) {
    console.error(`❌ ONVIF Dispatch Error: ${err.message}`);
    return false;
  }
}

async function runPtzWorker() {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  while (pendingCommand) {
    const cmd = pendingCommand;
    pendingCommand = null;

    // Enforce cooldown interval between requests to protect camera's micro-httpd
    const elapsedSinceLast = Date.now() - lastCommandTime;
    if (elapsedSinceLast < MIN_CMD_INTERVAL_MS) {
      await new Promise((r) => setTimeout(r, MIN_CMD_INTERVAL_MS - elapsedSinceLast));
    }

    if (cmd.action === "stop") {
      if (activeMotorState.moving) {
        console.log("🛑 Motor STOP");
        const stopZoom = activeMotorState.isZoom;
        activeMotorState = { moving: false, direction: null, speed: 0, isZoom: false };
        await dispatchSoap(buildStopXml(stopZoom));
        lastCommandTime = Date.now();
        await new Promise((r) => setTimeout(r, 100));
      }
    } else if (cmd.action === "move") {
      const normSpeed = Math.min(Math.max((cmd.speed || 32) / 64, 0.4), 1.0);
      let x = 0.0;
      let y = 0.0;
      let zoom = null;

      switch (cmd.direction) {
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
          console.warn(`⚠️ Unknown PTZ direction: ${cmd.direction}`);
          continue;
      }

      console.log(`🕹️ Moving [${cmd.direction.toUpperCase()}] at speed ${normSpeed.toFixed(2)}...`);
      const isZoom = cmd.direction === "zoomin" || cmd.direction === "zoomout";
      const success = await dispatchSoap(buildContinuousMoveXml(x, y, zoom));
      lastCommandTime = Date.now();

      if (success) {
        activeMotorState = { moving: true, direction: cmd.direction, speed: normSpeed, isZoom };
        // Pulse window: keep motor stepping for at least MIN_MOVE_PULSE_MS
        // This ensures tap-to-move buttons make a distinct visible step
        await new Promise((r) => setTimeout(r, MIN_MOVE_PULSE_MS));
      } else {
        // If the camera failed or timed out, reset active state to avoid getting stuck
        activeMotorState = { moving: false, direction: null, speed: 0, isZoom: false };
        await new Promise((r) => setTimeout(r, 400)); // Back off slightly on error
      }
    }
  }

  isWorkerRunning = false;
}

function handlePtzDirection(direction, speed = 32) {
  if (direction === "stop") {
    // If motor is already completely stopped and nothing pending, drop immediately
    if (!activeMotorState.moving && !pendingCommand) {
      return;
    }
    // If pending command is already a stop, drop duplicate
    if (pendingCommand && pendingCommand.action === "stop") {
      return;
    }
    pendingCommand = { action: "stop" };
  } else {
    // Deduplication: if motor is already moving in the exact same direction and no pending stop, drop
    if (
      activeMotorState.moving &&
      activeMotorState.direction === direction &&
      !pendingCommand
    ) {
      return;
    }
    // If identical move command is already pending, drop duplicate
    if (
      pendingCommand &&
      pendingCommand.action === "move" &&
      pendingCommand.direction === direction
    ) {
      return;
    }
    pendingCommand = { action: "move", direction, speed };
  }

  // Trigger worker asynchronously
  runPtzWorker().catch((err) => {
    console.error("PTZ Worker Error:", err);
    isWorkerRunning = false;
  });
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
  let token = await login();
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
    if (resolvedCameraId !== CAMERA_ID && /^[0-9a-fA-F]{24}$/.test(CAMERA_ID)) {
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

  socket.on("connect_error", async (err) => {
    console.error(`❌ Connection Error: ${err.message}`);
    const msg = (err.message || "").toLowerCase();
    if (msg.includes("token") || msg.includes("auth") || msg.includes("jwt") || msg.includes("unauthorized")) {
      console.log("🔄 Access token expired. Fetching fresh credentials...");
      try {
        const freshToken = await login(true);
        socket.auth = { token: freshToken };
        console.log("🔄 Reconnecting with fresh token...");
        socket.connect();
      } catch (authErr) {
        console.error(`❌ Re-auth failed: ${authErr.message}`);
      }
    }
  });
}

main().catch((err) => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
