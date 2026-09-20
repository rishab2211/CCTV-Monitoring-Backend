#!/usr/bin/env bash
# ==============================================================================
# 🚀 CCTV Monitoring Backend — ECR Build & Push Script
# ==============================================================================
# Usage:
#   chmod +x aws/ecr-push.sh
#   ./aws/ecr-push.sh                   # uses defaults (ap-southeast-2, latest tag)
#   ./aws/ecr-push.sh us-east-1 v1.2.0 # custom region and tag
# ==============================================================================

set -euo pipefail

# ── Config — edit these before first use ──────────────────────────────────────
AWS_REGION="${1:-ap-southeast-2}"
IMAGE_TAG="${2:-latest}"

# Auto-detect AWS account ID from caller identity
AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ECR_REPO_NAME="cctv-monitoring-backend"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
FULL_IMAGE="${ECR_REGISTRY}/${ECR_REPO_NAME}:${IMAGE_TAG}"
LATEST_IMAGE="${ECR_REGISTRY}/${ECR_REPO_NAME}:latest"

echo "════════════════════════════════════════════════════════"
echo "  📦 CCTV Backend — ECR Push"
echo "════════════════════════════════════════════════════════"
echo "  AWS Account : ${AWS_ACCOUNT_ID}"
echo "  Region      : ${AWS_REGION}"
echo "  Repository  : ${ECR_REPO_NAME}"
echo "  Tag         : ${IMAGE_TAG}"
echo "  Full Image  : ${FULL_IMAGE}"
echo "════════════════════════════════════════════════════════"

# ── Step 1: Authenticate Docker to ECR ───────────────────────────────────────
echo ""
echo "🔐 [1/5] Authenticating Docker to ECR..."
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR_REGISTRY}"
echo "✅ Docker authenticated to ECR"

# ── Step 2: Create ECR repository if it doesn't exist ────────────────────────
echo ""
echo "📁 [2/5] Ensuring ECR repository exists..."
aws ecr describe-repositories \
    --repository-names "${ECR_REPO_NAME}" \
    --region "${AWS_REGION}" > /dev/null 2>&1 \
  || aws ecr create-repository \
      --repository-name "${ECR_REPO_NAME}" \
      --region "${AWS_REGION}" \
      --image-scanning-configuration scanOnPush=true \
      --encryption-configuration encryptionType=AES256 \
      --output table
echo "✅ ECR repository ready"

# ── Step 3: Build Docker image ────────────────────────────────────────────────
echo ""
echo "🔨 [3/5] Building Docker image..."
# SCRIPT_DIR resolves to the aws/ folder; project root is one level up
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"

docker build \
  --build-arg PORT=8080 \
  --build-arg NODE_ENV=production \
  --platform linux/amd64 \
  --tag "${ECR_REPO_NAME}:${IMAGE_TAG}" \
  --tag "${ECR_REPO_NAME}:latest" \
  "${PROJECT_ROOT}"

echo "✅ Docker image built"

# ── Step 4: Tag for ECR ───────────────────────────────────────────────────────
echo ""
echo "🏷️  [4/5] Tagging images for ECR..."
docker tag "${ECR_REPO_NAME}:${IMAGE_TAG}" "${FULL_IMAGE}"
docker tag "${ECR_REPO_NAME}:latest"      "${LATEST_IMAGE}"
echo "✅ Images tagged"

# ── Step 5: Push to ECR ───────────────────────────────────────────────────────
echo ""
echo "⬆️  [5/5] Pushing images to ECR..."
docker push "${FULL_IMAGE}"
docker push "${LATEST_IMAGE}"

echo ""
echo "════════════════════════════════════════════════════════"
echo "✅ Push complete!"
echo "   Image URI : ${FULL_IMAGE}"
echo ""
echo "   Next step: update ECS service —"
echo "   aws ecs update-service \\"
echo "     --cluster cctv-monitoring-cluster \\"
echo "     --service cctv-monitoring-service \\"
echo "     --force-new-deployment \\"
echo "     --region ${AWS_REGION}"
echo "════════════════════════════════════════════════════════"
