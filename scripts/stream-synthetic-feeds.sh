#!/usr/bin/env bash
# ==============================================================================
# 📹 CCTV Platform - Synthetic RTSP Feed Generator for Live Demo & Pitch Videos
# ==============================================================================
# This script uses FFmpeg to stream live synthetic CCTV surveillance feeds into
# MediaMTX (rtsp://localhost:8554) with running real-time timestamp overlays.
#
# If you have sample MP4 videos, place them in a folder and specify the path,
# or run with no arguments to generate real-time synthetic camera feeds.
#
# Requirements:
#   - ffmpeg installed (`sudo apt install ffmpeg` or `brew install ffmpeg`)
#   - MediaMTX running on localhost:8554
#
# Usage:
#   chmod +x scripts/stream-synthetic-feeds.sh
#   ./scripts/stream-synthetic-feeds.sh
# ==============================================================================

set -euo pipefail

RTSP_HOST="${RTSP_HOST:-localhost:8554}"

echo "=================================================================="
echo "🎥 CCTV Monitoring Platform — Synthetic Video Feed Generator"
echo "Target RTSP Server: rtsp://${RTSP_HOST}"
echo "=================================================================="

# Check if ffmpeg is installed
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "❌ Error: ffmpeg is not installed. Please install ffmpeg first."
  exit 1
fi

cleanup() {
  echo ""
  echo "🛑 Stopping synthetic RTSP camera feeds..."
  kill $(jobs -p) 2>/dev/null || true
  exit 0
}

trap cleanup INT TERM EXIT

echo "🚀 Starting Camera 1: Main Entrance [rtsp://${RTSP_HOST}/cam_entrance]..."
ffmpeg -re -f lavfi -i "testsrc=size=1280x720:rate=25" \
  -vf "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.15:t=fill,drawtext=text='REC ● CAM-01 | MAIN ENTRANCE & RECEPTION':fontcolor=white:fontsize=22:box=1:boxcolor=black@0.7:boxborderw=6:x=30:y=30,drawtext=text='%{localtime\:%Y-%m-%d %H\:%M\:%S}':fontcolor=yellow:fontsize=20:box=1:boxcolor=black@0.7:boxborderw=4:x=30:y=65" \
  -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p -an -f rtsp "rtsp://${RTSP_HOST}/cam_entrance" >/dev/null 2>&1 &

echo "🚀 Starting Camera 2: Warehouse Loading Bay [rtsp://${RTSP_HOST}/cam_warehouse]..."
ffmpeg -re -f lavfi -i "smptebars=size=1280x720:rate=25" \
  -vf "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.2:t=fill,drawtext=text='REC ● CAM-02 | WAREHOUSE LOADING BAY':fontcolor=white:fontsize=22:box=1:boxcolor=black@0.7:boxborderw=6:x=30:y=30,drawtext=text='%{localtime\:%Y-%m-%d %H\:%M\:%S}':fontcolor=yellow:fontsize=20:box=1:boxcolor=black@0.7:boxborderw=4:x=30:y=65" \
  -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p -an -f rtsp "rtsp://${RTSP_HOST}/cam_warehouse" >/dev/null 2>&1 &

echo "🚀 Starting Camera 3: Perimeter Parking Area [rtsp://${RTSP_HOST}/cam_parking]..."
ffmpeg -re -f lavfi -i "testsrc2=size=1280x720:rate=25" \
  -vf "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.2:t=fill,drawtext=text='REC ● CAM-03 | PERIMETER PARKING AREA':fontcolor=white:fontsize=22:box=1:boxcolor=black@0.7:boxborderw=6:x=30:y=30,drawtext=text='%{localtime\:%Y-%m-%d %H\:%M\:%S}':fontcolor=yellow:fontsize=20:box=1:boxcolor=black@0.7:boxborderw=4:x=30:y=65" \
  -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p -an -f rtsp "rtsp://${RTSP_HOST}/cam_parking" >/dev/null 2>&1 &

echo ""
echo "✅ All 3 Synthetic RTSP Feeds are running live!"
echo "   1. rtsp://${RTSP_HOST}/cam_entrance"
echo "   2. rtsp://${RTSP_HOST}/cam_warehouse"
echo "   3. rtsp://${RTSP_HOST}/cam_parking"
echo ""
echo "Open the Admin Portal or Mobile Apps to watch the real-time WebRTC streams."
echo "Press Ctrl+C to terminate the feeds when finished."

wait
