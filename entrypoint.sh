#!/bin/sh
set -e

echo "🚀 Starting CCTV Platform Container Services..."

# Start MediaMTX in the background if binary exists
if command -v mediamtx >/dev/null 2>&1; then
    echo "📹 Starting MediaMTX Streaming Gateway..."
    mediamtx /app/mediamtx.yml > /tmp/mediamtx.log 2>&1 &
    MEDIAMTX_PID=$!
    echo "✅ MediaMTX running with PID: $MEDIAMTX_PID"
else
    echo "⚠️  mediamtx binary not found, proceeding with API only."
fi

# Cleanup on exit
cleanup() {
    echo "🛑 Shutting down container processes..."
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
