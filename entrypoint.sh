#!/bin/sh
set -e

echo "🚀 Starting CCTV Platform Container Services..."

# Start MediaMTX in the background if binary exists
if command -v mediamtx >/dev/null 2>&1; then
    echo "📹 Starting MediaMTX Streaming Gateway..."
    mediamtx /app/mediamtx.yml > /tmp/mediamtx.log 2>&1 &
    MEDIAMTX_PID=$!
    echo "✅ MediaMTX running with PID: $MEDIAMTX_PID"
    sleep 2
else
    echo "⚠️  mediamtx binary not found, proceeding with API only."
fi

# Start Synthetic CCTV Feeds for Demo (Entrance, Warehouse, Parking)
if [ "${ENABLE_DEMO_FEEDS:-true}" = "true" ] && command -v ffmpeg >/dev/null 2>&1 && [ -f /app/scripts/stream-synthetic-feeds.sh ]; then
    echo "🎥 Starting Synthetic CCTV Demo Feeds in background..."
    /app/scripts/stream-synthetic-feeds.sh > /tmp/synthetic-feeds.log 2>&1 &
    FEEDS_PID=$!
    echo "✅ Synthetic feeds generator running with PID: $FEEDS_PID"
fi

# Cleanup on exit
cleanup() {
    echo "🛑 Shutting down container processes..."
    if [ ! -z "$FEEDS_PID" ]; then
        kill "$FEEDS_PID" 2>/dev/null || true
    fi
    if [ ! -z "$MEDIAMTX_PID" ]; then
        kill "$MEDIAMTX_PID" 2>/dev/null || true
    fi
    exit 0
}

trap cleanup INT TERM

# Start Backend API using Bun
echo "📡 Launching CCTV Backend Server..."
bun src/server.ts &
BUN_PID=$!

wait $BUN_PID
