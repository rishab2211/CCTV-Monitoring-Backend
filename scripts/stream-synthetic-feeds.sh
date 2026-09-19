#!/usr/bin/env bash
# ==============================================================================
# 📹 CCTV Platform - Resilient Synthetic RTSP Feed Generator for Live Demos
# ==============================================================================
# Continuously streams 3 synthetic CCTV surveillance feeds with running clock
# overlays into MediaMTX with automatic restart on disconnect.
# ==============================================================================

set -uo pipefail

RTSP_HOST="${RTSP_HOST:-localhost:8554}"

echo "=================================================================="
echo "🎥 CCTV Monitoring Platform — Synthetic Video Feed Generator"
echo "Target RTSP Server: rtsp://${RTSP_HOST}"
echo "=================================================================="

# Check ffmpeg installation
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "❌ Error: ffmpeg is not installed."
  exit 1
fi

# Detect available font for video timestamp overlay
FONT_PARAM=""
if [ -f "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" ]; then
  FONT_PARAM=":fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
fi

# Wait for MediaMTX RTSP listener to be ready before firing feeds
echo "⏳ Waiting for MediaMTX RTSP listener on ${RTSP_HOST}..."
RETRIES=0
while ! (echo > /dev/tcp/127.0.0.1/8554) >/dev/null 2>&1; do
  sleep 1
  RETRIES=$((RETRIES + 1))
  if [ $RETRIES -gt 30 ]; then
    echo "⚠️ MediaMTX took more than 30s to bind. Attempting to start feeds anyway..."
    break
  fi
done
echo "✅ MediaMTX RTSP listener is ready!"

cleanup() {
  echo ""
  echo "🛑 Stopping synthetic RTSP camera feeds..."
  kill $(jobs -p) 2>/dev/null || true
  exit 0
}

trap cleanup INT TERM EXIT

# Stream loop function with auto-restart
stream_loop() {
  local CAM_NAME="$1"
  local STREAM_PATH="$2"
  local SRC="$3"
  local LABEL="$4"

  while true; do
    echo "▶️ [${CAM_NAME}] Launching live synthetic feed to rtsp://${RTSP_HOST}/${STREAM_PATH}..."
    ffmpeg -re -f lavfi -i "${SRC}" \
      -vf "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.15:t=fill,drawtext=text='REC ● ${LABEL}'${FONT_PARAM}:fontcolor=white:fontsize=22:box=1:boxcolor=black@0.7:boxborderw=6:x=30:y=30,drawtext=text='%{localtime\:%Y-%m-%d %H\:%M\:%S}'${FONT_PARAM}:fontcolor=yellow:fontsize=20:box=1:boxcolor=black@0.7:boxborderw=4:x=30:y=65" \
      -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p -an -f rtsp "rtsp://${RTSP_HOST}/${STREAM_PATH}" >/dev/null 2>&1 || true

    echo "⚠️ [${CAM_NAME}] Stream disconnected or interrupted. Restarting in 2 seconds..."
    sleep 2
  done
}

# Launch the 3 synthetic cameras in background loops
stream_loop "CAM-01" "cam_entrance" "testsrc=size=1280x720:rate=25" "CAM-01 | MAIN ENTRANCE & RECEPTION" &
stream_loop "CAM-02" "cam_warehouse" "smptebars=size=1280x720:rate=25" "CAM-02 | WAREHOUSE LOADING BAY" &
stream_loop "CAM-03" "cam_parking" "testsrc2=size=1280x720:rate=25" "CAM-03 | PERIMETER PARKING AREA" &

echo ""
echo "✅ All 3 Synthetic RTSP Feeds are running in background loops!"
echo "   1. rtsp://${RTSP_HOST}/cam_entrance"
echo "   2. rtsp://${RTSP_HOST}/cam_warehouse"
echo "   3. rtsp://${RTSP_HOST}/cam_parking"
echo ""

wait
