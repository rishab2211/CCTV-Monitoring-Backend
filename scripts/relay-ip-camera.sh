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
PATH_NAME="${2:-ip_camera_01}"
VPS_RTSP="rtsp://200.141.12.143:8554/${PATH_NAME}"

echo ""
echo "=================================================================="
echo "📹 CCTV Platform — Physical IP Camera Bridge"
echo "=================================================================="
echo "  Physical Camera : ${LOCAL_RTSP}"
echo "  Relaying to VPS : ${VPS_RTSP}"
echo "  Admin Stream ID : ${PATH_NAME}"
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
  -c copy \
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
echo "   Watch in Admin Panel → Live Grid → Camera: ${PATH_NAME}"
echo ""

wait "${FFMPEG_PID}"
