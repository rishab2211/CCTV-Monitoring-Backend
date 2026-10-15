#!/usr/bin/env bash
# ==============================================================================
# 📹 Physical IP Camera → VPS RTSP Relay Bridge
# ==============================================================================
# Relays a physical CCTV camera on your local Wi-Fi / LAN (Hikvision, Dahua,
# CP Plus, Tapo, Reolink, etc.) to your public VPS MediaMTX gateway.
#
# Uses '-c copy' so there is ZERO transcoding lag and ~0% CPU usage.
#
# Usage:
#   ./scripts/relay-ip-camera.sh "rtsp://username:password@192.168.1.100:554/stream1"
#   ./scripts/relay-ip-camera.sh "rtsp://username:password@192.168.1.100:554/stream1" custom_cam_name
# ==============================================================================

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo ""
  echo "Usage: $0 <LOCAL_CAMERA_RTSP_URL> [PATH_NAME]"
  echo ""
  echo "Examples:"
  echo "  Tapo / TP-Link : $0 'rtsp://admin:mypassword@192.168.1.50:554/stream1'"
  echo "  Hikvision      : $0 'rtsp://admin:mypassword@192.168.1.64:554/Streaming/Channels/101'"
  echo "  Dahua / CP Plus: $0 'rtsp://admin:mypassword@192.168.1.108:554/cam/realmonitor?channel=1&subtype=0'"
  echo "  Reolink        : $0 'rtsp://admin:mypassword@192.168.1.120:554/h264Preview_01_main'"
  echo ""
  exit 1
fi

LOCAL_RTSP="$1"
RAW_INPUT="${2:-cam_01}"

# Strip existing raw_/live_ prefixes and normalize to lowercase slug
CLEAN_SLUG=$(echo "${RAW_INPUT}" | sed -E 's/^(raw_|live_)//' | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_-' '-')
INGEST_PATH="raw_${CLEAN_SLUG}"
PLAYBACK_PATH="live_${CLEAN_SLUG}"
RTSP_HOST="${RTSP_HOST:-api-cctv-backend.duckdns.org:8554}"
VPS_RTSP="rtsp://${RTSP_HOST}/${INGEST_PATH}"

echo ""
echo "=================================================================="
echo "📹 CCTV Platform — Physical IP Camera Bridge"
echo "=================================================================="
echo "  Physical Camera  : ${LOCAL_RTSP}"
echo "  Relaying to VPS  : ${VPS_RTSP}"
echo "  Camera Slug (DB) : ${CLEAN_SLUG}"
echo "  Live Playback ID : ${PLAYBACK_PATH}"
echo "  Recording Engine : AUTO-ENABLED (MediaMTX raw_ pattern)"
echo "=================================================================="
echo ""

if ! command -v ffmpeg > /dev/null 2>&1; then
  echo "❌ ffmpeg is required. Install with: sudo apt install ffmpeg"
  exit 1
fi

cleanup() {
  echo ""
  echo "🛑 Stopping camera relay..."
  kill "${FFMPEG_PID}" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

echo "🚀 Connecting to physical camera and relaying to VPS..."
echo "   Press Ctrl+C to stop."
echo ""

ffmpeg \
  -loglevel warning \
  -rtsp_transport tcp \
  -i "${LOCAL_RTSP}" \
  -c:v copy \
  -c:a libopus \
  -b:a 64k \
  -async 50 \
  -rtsp_transport tcp \
  -f rtsp \
  "${VPS_RTSP}" &

FFMPEG_PID=$!

sleep 3

if ! kill -0 "${FFMPEG_PID}" 2>/dev/null; then
  echo "❌ Failed to connect to local camera."
  echo "   Check: 1) Camera IP address, 2) Username/Password, 3) RTSP port 554."
  exit 1
fi

echo "✅ Camera is streaming live to VPS!"
echo "   Live WebRTC Stream: ${PLAYBACK_PATH}"
echo "   Admin Panel Camera: match Serial Number or Name with '${CLEAN_SLUG}'"
echo "   Recording: fMP4 chunks are saving under /app/recordings/${INGEST_PATH}/"
echo ""

wait "${FFMPEG_PID}"
