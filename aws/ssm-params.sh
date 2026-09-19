#!/usr/bin/env bash
# ==============================================================================
# 🔐 CCTV Monitoring Backend — AWS SSM Parameter Store Setup
# ==============================================================================
# Creates all required SecureString parameters in AWS Systems Manager.
# Run this ONCE before creating your ECS service.
#
# Usage:
#   chmod +x aws/ssm-params.sh
#   ./aws/ssm-params.sh
#
# Prerequisites:
#   - AWS CLI configured with a profile that has SSM:PutParameter permissions
#   - All secret values ready (MongoDB URI, JWT secrets, etc.)
# ==============================================================================

set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-south-1}"
PREFIX="/cctv/prod"

echo "════════════════════════════════════════════════════════"
echo "  🔐 CCTV Backend — SSM Parameter Store Setup"
echo "  Region : ${AWS_REGION}"
echo "  Prefix : ${PREFIX}"
echo "════════════════════════════════════════════════════════"
echo ""

# Helper: create or update a SecureString parameter
put_param() {
  local name="$1"
  local value="$2"
  local description="$3"

  echo "  ➜ ${PREFIX}/${name}"
  aws ssm put-parameter \
    --region "${AWS_REGION}" \
    --name "${PREFIX}/${name}" \
    --value "${value}" \
    --type "SecureString" \
    --description "${description}" \
    --overwrite \
    --no-cli-pager > /dev/null
}

# ── Prompt for each secret value ─────────────────────────────────────────────
# (read -s hides input in terminal)

read_secret() {
  local prompt="$1"
  local varname="$2"
  printf "  %s: " "${prompt}"
  read -rs "${varname}"
  echo ""
}

echo "Enter your production secret values."
echo "Input is hidden — paste values and press Enter."
echo ""

read_secret "MongoDB URI (mongodb+srv://...)"                MONGODB_URI
read_secret "Access Token Secret (32+ random chars)"         ACCESS_TOKEN_SECRET
read_secret "Refresh Token Secret (32+ random chars)"        REFRESH_TOKEN_SECRET
read_secret "System API Key (32+ random chars)"              SYSTEM_API_KEY
read_secret "SMTP Host (e.g. smtp.gmail.com)"                SMTP_HOST
read_secret "SMTP User (email address)"                      SMTP_USER
read_secret "SMTP Password (app password)"                   SMTP_PASS
read_secret "Email From (e.g. CCTV Monitor <no-reply@...>)"  EMAIL_FROM
read_secret "Cloudinary Cloud Name"                          CLOUDINARY_CLOUD_NAME
read_secret "Cloudinary API Key"                             CLOUDINARY_API_KEY
read_secret "Cloudinary API Secret"                          CLOUDINARY_API_SECRET
read_secret "Firebase Project ID"                            FIREBASE_PROJECT_ID
read_secret "Firebase Client Email"                          FIREBASE_CLIENT_EMAIL
read_secret "Firebase Private Key (full PEM string)"         FIREBASE_PRIVATE_KEY
read_secret "Razorpay Key ID"                                RAZORPAY_KEY_ID
read_secret "Razorpay Key Secret"                            RAZORPAY_KEY_SECRET
read_secret "MediaMTX Stream Secret (32+ random chars)"      MEDIAMTX_STREAM_SECRET
read_secret "CORS Origins (comma-separated, https:// only)"  CORS_ORIGIN
read_secret "Public Base URL (e.g. https://api.domain.com)" PUBLIC_BASE_URL

echo ""
echo "📝 Writing parameters to SSM..."
echo ""

put_param "MONGODB_URI"            "${MONGODB_URI}"            "MongoDB Atlas connection string"
put_param "ACCESS_TOKEN_SECRET"    "${ACCESS_TOKEN_SECRET}"    "JWT access token signing secret"
put_param "REFRESH_TOKEN_SECRET"   "${REFRESH_TOKEN_SECRET}"   "JWT refresh token signing secret"
put_param "SYSTEM_API_KEY"         "${SYSTEM_API_KEY}"         "Internal system API key for camera hardware bypass"
put_param "SMTP_HOST"              "${SMTP_HOST}"              "SMTP server hostname"
put_param "SMTP_USER"              "${SMTP_USER}"              "SMTP authentication username"
put_param "SMTP_PASS"              "${SMTP_PASS}"              "SMTP authentication password"
put_param "EMAIL_FROM"             "${EMAIL_FROM}"             "Sender address for outbound emails"
put_param "CLOUDINARY_CLOUD_NAME"  "${CLOUDINARY_CLOUD_NAME}"  "Cloudinary cloud name"
put_param "CLOUDINARY_API_KEY"     "${CLOUDINARY_API_KEY}"     "Cloudinary API key"
put_param "CLOUDINARY_API_SECRET"  "${CLOUDINARY_API_SECRET}"  "Cloudinary API secret"
put_param "FIREBASE_PROJECT_ID"    "${FIREBASE_PROJECT_ID}"    "Firebase project ID"
put_param "FIREBASE_CLIENT_EMAIL"  "${FIREBASE_CLIENT_EMAIL}"  "Firebase service account client email"
put_param "FIREBASE_PRIVATE_KEY"   "${FIREBASE_PRIVATE_KEY}"   "Firebase service account private key (PEM)"
put_param "RAZORPAY_KEY_ID"        "${RAZORPAY_KEY_ID}"        "Razorpay API key ID"
put_param "RAZORPAY_KEY_SECRET"    "${RAZORPAY_KEY_SECRET}"    "Razorpay API key secret"
put_param "MEDIAMTX_STREAM_SECRET" "${MEDIAMTX_STREAM_SECRET}" "MediaMTX JWT stream signing secret"
put_param "CORS_ORIGIN"            "${CORS_ORIGIN}"            "Allowed CORS origins (comma-separated)"
put_param "PUBLIC_BASE_URL"        "${PUBLIC_BASE_URL}"        "Public HTTPS base URL of the API"

echo ""
echo "════════════════════════════════════════════════════════"
echo "✅ All SSM parameters written successfully!"
echo ""
echo "   Verify with:"
echo "   aws ssm get-parameters-by-path \\"
echo "     --path ${PREFIX} \\"
echo "     --with-decryption \\"
echo "     --region ${AWS_REGION} \\"
echo "     --query 'Parameters[].Name'"
echo "════════════════════════════════════════════════════════"
