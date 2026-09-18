#!/usr/bin/env bash
# ==============================================================================
# 📷 Webcam → RTSP Stream Pusher for CCTV Platform Local Testing
# ==============================================================================
# Captures your laptop webcam via FFmpeg and pushes it to MediaMTX as an RTSP
# stream, making it available for WebRTC playback in the admin panel.
#
# Requirements:
#   - ffmpeg installed (confirmed ✅)
#   - MediaMTX running (confirmed ✅ on localhost:8554 / API :9997)
#
# Usage:
#   chmod +x scripts/stream-webcam.sh
#   ./scripts/stream-webcam.sh                  # streams to default path: cam-test-1
#   ./scripts/stream-webcam.sh cam_entrance     # custom path name
#   WEBCAM=/dev/video1 ./scripts/stream-webcam.sh  # use a different webcam device
# ==============================================================================

set -euo pipefail

# ─── Configuration ─────────────────────────────────────────────────────────────
WEBCAM="${WEBCAM:-/dev/video0}"
RTSP_HOST="${RTSP_HOST:-localhost:8554}"
PATH_NAME="${1:-cam-test-1}"
RTSP_URL="rtsp://${RTSP_HOST}/${PATH_NAME}"
RESOLUTION="${RESOLUTION:-1280x720}"
FRAMERATE="${FRAMERATE:-25}"

# ─── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo "=================================================================="
echo "📷 CCTV Platform — Webcam RTSP Stream Pusher"
echo "=================================================================="
echo "  Webcam Device  :  ${WEBCAM}"
echo "  Resolution     :  ${RESOLUTION} @ ${FRAMERATE}fps"
echo "  Publishing to  :  ${RTSP_URL}"
echo "  WebRTC viewer  :  http://localhost:9997/${PATH_NAME}"
echo "=================================================================="
echo ""

# ─── Pre-flight checks ─────────────────────────────────────────────────────────
if ! command -v ffmpeg > /dev/null 2>&1; then
  echo "❌ ffmpeg is not installed. Run: sudo apt install ffmpeg"
  exit 1
fi

if [ ! -e "${WEBCAM}" ]; then
  echo "❌ Webcam device '${WEBCAM}' not found."
  echo "   Available video devices:"
  ls /dev/video* 2>/dev/null || echo "   (none found)"
  exit 1
fi

# Check MediaMTX is accessible
if ! curl -sf "http://127.0.0.1:9997/v3/config/global/get" > /dev/null 2>&1; then
  echo "⚠️  Warning: MediaMTX API not reachable at :9997."
  echo "   Make sure MediaMTX is running (./mediamtx mediamtx.yml) and try again."
  exit 1
fi

# ─── Cleanup handler ───────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "🛑 Stopping webcam stream..."
  kill "${FFMPEG_PID}" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# ─── Register path in MediaMTX API (so backend detects it) ────────────────────
echo "📡 Registering path '${PATH_NAME}' in MediaMTX..."
curl -sf -X POST "http://127.0.0.1:9997/v3/config/paths/add/${PATH_NAME}" \
  -H "Content-Type: application/json" \
  -d '{"source": "publisher", "maxReaders": 20}' > /dev/null 2>&1 || \
curl -sf -X PATCH "http://127.0.0.1:9997/v3/config/paths/patch/${PATH_NAME}" \
  -H "Content-Type: application/json" \
  -d '{"source": "publisher", "maxReaders": 20}' > /dev/null 2>&1 || true
echo "✅ Path registered"

# ─── Start FFmpeg webcam → RTSP publisher ─────────────────────────────────────
echo ""
echo "🚀 Starting webcam stream..."
echo "   Press Ctrl+C to stop."
echo ""

ffmpeg \
  -loglevel warning \
  -f v4l2 \
  -framerate "${FRAMERATE}" \
  -video_size "${RESOLUTION}" \
  -input_format mjpeg \
  -i "${WEBCAM}" \
  -c:v libx264 \
  -preset ultrafast \
  -tune zerolatency \
  -pix_fmt yuv420p \
  -an \
  -rtsp_transport tcp \
  -f rtsp \
  "${RTSP_URL}" &

FFMPEG_PID=$!

sleep 2

# Verify FFmpeg is still alive
if ! kill -0 "${FFMPEG_PID}" 2>/dev/null; then
  echo ""
  echo "❌ FFmpeg failed to start. Try a different resolution or input format:"
  echo "   RESOLUTION=640x480 ./scripts/stream-webcam.sh"
  echo ""
  echo "   Or check available formats:"
  echo "   ffmpeg -f v4l2 -list_formats all -i ${WEBCAM} 2>&1"
  exit 1
fi

# ─── Success ───────────────────────────────────────────────────────────────────
echo ""
echo "✅ Webcam is live!"
echo ""
echo "  📺 RTSP URL   : ${RTSP_URL}"
echo "  🌐 WebRTC URL : http://localhost:9997/${PATH_NAME}"
echo "  📋 Path name  : ${PATH_NAME}"
echo ""
echo "  Next steps:"
echo "  1. In your admin panel → Cameras → find your camera"
echo "  2. Set RTSP URL to: ${RTSP_URL}"
echo "  3. Click 'Start Stream' to view the webcam feed in the browser"
echo ""
echo "  Press Ctrl+C to stop the stream."
echo ""

wait "${FFMPEG_PID}"
