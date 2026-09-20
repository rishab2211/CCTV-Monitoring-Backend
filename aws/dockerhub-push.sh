#!/usr/bin/env bash
# ==============================================================================
# 🚀 CCTV Monitoring Backend — Docker Hub Build & Push Script
# ==============================================================================
# Usage:
#   chmod +x aws/dockerhub-push.sh
#   ./aws/dockerhub-push.sh              # pushes as latest
#   ./aws/dockerhub-push.sh v1.0.0       # pushes with a version tag too
# ==============================================================================

set -euo pipefail

DOCKERHUB_USER="rishab2211"
IMAGE_NAME="cctv-monitoring-backend"
IMAGE_TAG="${1:-latest}"
FULL_IMAGE="${DOCKERHUB_USER}/${IMAGE_NAME}"

echo "════════════════════════════════════════════════════════"
echo "  🐳 CCTV Backend — Docker Hub Push"
echo "════════════════════════════════════════════════════════"
echo "  Hub User  : ${DOCKERHUB_USER}"
echo "  Image     : ${FULL_IMAGE}"
echo "  Tag       : ${IMAGE_TAG}"
echo "════════════════════════════════════════════════════════"

# ── Step 1: Login to Docker Hub ───────────────────────────────────────────────
echo ""
echo "🔐 [1/4] Logging in to Docker Hub..."
echo "   (You will be prompted for your Docker Hub password)"
docker login --username "${DOCKERHUB_USER}"
echo "✅ Logged in to Docker Hub"

# ── Step 2: Build the image ───────────────────────────────────────────────────
echo ""
echo "🔨 [2/4] Building Docker image for linux/amd64..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"

docker build \
  --build-arg PORT=8080 \
  --platform linux/amd64 \
  --tag "${FULL_IMAGE}:${IMAGE_TAG}" \
  --tag "${FULL_IMAGE}:latest" \
  "${PROJECT_ROOT}"

echo "✅ Image built"

# ── Step 3: Push to Docker Hub ────────────────────────────────────────────────
echo ""
echo "⬆️  [3/4] Pushing to Docker Hub..."
docker push "${FULL_IMAGE}:${IMAGE_TAG}"
if [ "${IMAGE_TAG}" != "latest" ]; then
  docker push "${FULL_IMAGE}:latest"
fi
echo "✅ Pushed: https://hub.docker.com/r/${FULL_IMAGE}"

# ── Step 4: Print next step ───────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo "✅ Push complete!"
echo ""
echo "   Image: ${FULL_IMAGE}:${IMAGE_TAG}"
echo ""
echo "   Next — force a new ECS deployment:"
echo "   aws ecs update-service \\"
echo "     --cluster cctv-monitoring-cluster \\"
echo "     --service cctv-monitoring-service \\"
echo "     --force-new-deployment \\"
echo "     --region ap-southeast-2"
echo "════════════════════════════════════════════════════════"
