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
CLEAN_SLUG=$(printf "%s" "${RAW_INPUT}" | sed -E 's/^(raw_|live_)//' | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_-]/_/g' | sed -E 's/^_+|_+$//g')

# If shenzhen-cam or shenzhen_cam was provided, ensure it aligns with the DB's live_shenzhen_cam
if [ "${CLEAN_SLUG}" = "shenzhen-cam" ] || [ "${CLEAN_SLUG}" = "shenzhen_cam" ]; then
  CLEAN_SLUG="shenzhen_cam"
fi

INGEST_PATH="live_${CLEAN_SLUG}"
PLAYBACK_PATH="live_${CLEAN_SLUG}"

# Resolve IPv4 address to avoid ISP IPv6 Path MTU blackholes (1460 > 1440 drop)
DEFAULT_HOST="api-cctv-backend.duckdns.org:8554"
RTSP_HOST="${RTSP_HOST:-$DEFAULT_HOST}"

TARGET_HOST=$(printf "%s" "${RTSP_HOST}" | cut -d':' -f1)
TARGET_PORT=$(printf "%s" "${RTSP_HOST}" | cut -s -d':' -f2)
TARGET_PORT="${TARGET_PORT:-8554}"

# Prefer IPv4 resolution for the RTSP gateway
IPV4_ADDR=$(getent ahostsv4 "${TARGET_HOST}" 2>/dev/null | awk '{print $1; exit}' || echo "")
if [ -n "${IPV4_ADDR}" ]; then
  PUBLISH_TARGET="${IPV4_ADDR}:${TARGET_PORT}"
else
  PUBLISH_TARGET="${RTSP_HOST}"
fi

VPS_RTSP="rtsp://${PUBLISH_TARGET}/${INGEST_PATH}"

# Default admin platform credentials for the PTZ bridge
export ADMIN_EMAIL="${ADMIN_EMAIL:-admin@cctvmonitor.com}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin@1234}"

echo ""
echo "=================================================================="
echo "📹 CCTV Platform — Physical IP Camera Bridge"
echo "=================================================================="
echo "  Physical Camera  : ${LOCAL_RTSP}"
echo "  Relaying to VPS  : ${VPS_RTSP} (${TARGET_HOST})"
echo "  Camera Slug (DB) : ${CLEAN_SLUG}"
echo "  Live Playback ID : ${PLAYBACK_PATH}"
echo "  Recording Engine : AUTO-ENABLED (MediaMTX raw_ pattern)"
echo "=================================================================="
echo ""

if ! command -v ffmpeg > /dev/null 2>&1; then
  echo "❌ ffmpeg is required. Install with: sudo apt install ffmpeg"
  exit 1
fi

# Auto-detect video & audio codecs in a single connection to protect camera socket pool
echo "🔍 Probing camera stream codecs..."
PROBE_INFO=$(ffprobe -v error -show_entries stream=codec_type,codec_name -of csv=p=0 -analyzeduration 1000000 -probesize 1000000 -rtsp_transport tcp "${LOCAL_RTSP}" 2>/dev/null || echo -e "video,h264")
CODEC=$(printf "%s\n" "${PROBE_INFO}" | grep -m1 "^video" | cut -d',' -f2 || echo "h264")
AUDIO_TRACK=$(printf "%s\n" "${PROBE_INFO}" | grep -m1 "^audio" | cut -d',' -f2 || echo "")

# Allow camera embedded RTSP server to close probe connection cleanly
sleep 2

if [ "${CODEC}" = "hevc" ] || [ "${CODEC}" = "h265" ]; then
  echo "⚠️  Camera video is HEVC (H.265). Web browsers require H.264 for WebRTC."
  echo "   Enabling ultra-fast zero-latency H.264 transcode (-c:v libx264)..."
  echo "   💡 Pro-Tip: In your camera's Web UI or mobile app, switch Video Encode to H.264 for 0% CPU & 0ms lag!"
  V_ENCODER=(
    -map 0:v:0
    -c:v libx264
    -preset ultrafast
    -tune zerolatency
    -profile:v baseline
    -level 3.1
    -pix_fmt yuv420p
    -r 25
    -fps_mode cfr
    -g 25
    -keyint_min 25
    -sc_threshold 0
    -b:v 1800k
    -maxrate 2200k
    -bufsize 1000k
    -x264-params "no-scenecut=1:sync-lookahead=0:rc-lookahead=0:repeat-headers=1:sliced-threads=1"
  )
else
  echo "✅ Camera video is ${CODEC}. Using zero-copy passthrough (-c:v copy) for 0ms lag!"
  V_ENCODER=(-map 0:v:0 -c:v copy)
fi

if [ -n "${AUDIO_TRACK}" ]; then
  echo "🔊 Camera audio detected (${AUDIO_TRACK}). Relaying as Opus audio."
  A_ENCODER=(-map 0:a:0 -c:a libopus -b:a 48k -ar 48000 -ac 1 -af "aresample=48000:async=1:first_pts=0")
else
  echo "🔇 No audio track detected on camera. Running video-only (-an)."
  A_ENCODER=(-an)
fi

CAMERA_IP=$(printf "%s" "${LOCAL_RTSP}" | sed -E 's|.*@([^:/]+).*|\1|')
PTZ_PID=""

RUNNING=1
cleanup() {
  echo ""
  echo "🛑 Stopping camera relay and PTZ bridge..."
  RUNNING=0
  kill "${FFMPEG_PID:-}" 2>/dev/null || true
  if [ -n "${PTZ_PID}" ]; then
    kill "${PTZ_PID}" 2>/dev/null || true
  fi
  exit 0
}
trap cleanup INT TERM

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PTZ_BRIDGE_SCRIPT="${SCRIPT_DIR}/onvif-ptz-bridge.js"

if [ -f "${PTZ_BRIDGE_SCRIPT}" ] && command -v node > /dev/null 2>&1; then
  echo "🎮 Starting background ONVIF PTZ Bridge for ${CAMERA_IP}..."
  node "${PTZ_BRIDGE_SCRIPT}" "${CAMERA_IP}" "${CLEAN_SLUG}" &
  PTZ_PID=$!
fi

echo "🚀 Connecting to physical camera and relaying to VPS..."
echo "   Live WebRTC Stream: ${PLAYBACK_PATH}"
echo "   Admin Panel Camera: match Serial Number or Name with '${CLEAN_SLUG}'"
echo "   Recording: fMP4 chunks are saving under /app/recordings/${INGEST_PATH}/"
echo "   Press Ctrl+C to stop."
echo ""

while [ "${RUNNING}" -eq 1 ]; do
  ffmpeg \
    -loglevel warning \
    -hide_banner \
    -rtsp_transport tcp \
    -timeout 5000000 \
    -reorder_queue_size 0 \
    -max_delay 500000 \
    -buffer_size 2097152 \
    -flags low_delay \
    -fflags +genpts+discardcorrupt+nobuffer \
    -err_detect ignore_err \
    -probesize 1000000 \
    -analyzeduration 1000000 \
    -i "${LOCAL_RTSP}" \
    "${V_ENCODER[@]}" \
    "${A_ENCODER[@]}" \
    -avoid_negative_ts make_zero \
    -rtsp_transport tcp \
    -f rtsp \
    "${VPS_RTSP}" &

  FFMPEG_PID=$!
  wait "${FFMPEG_PID}" || true

  if [ "${RUNNING}" -eq 1 ]; then
    echo "⚠️ Camera stream disconnected or Wi-Fi packet dropped."
    # Check if the camera host IP is responding on LAN
    if command -v ping > /dev/null 2>&1; then
      if ! ping -c 1 -W 1 "${CAMERA_IP}" > /dev/null 2>&1; then
        echo "⏳ Camera (${CAMERA_IP}) is unreachable (Wi-Fi dropped or rebooting). Waiting for camera to come online..."
        while [ "${RUNNING}" -eq 1 ] && ! ping -c 1 -W 1 "${CAMERA_IP}" > /dev/null 2>&1; do
          sleep 2
        done
        if [ "${RUNNING}" -eq 1 ]; then
          echo "✅ Camera (${CAMERA_IP}) is back online! Allowing RTSP daemon 3s to initialize..."
          sleep 3
        fi
      else
        sleep 1
      fi
    else
      sleep 1
    fi

    if [ "${RUNNING}" -eq 1 ]; then
      echo "🔄 Reconnecting to camera RTSP stream..."
    fi
  fi
done
