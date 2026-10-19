import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  // Server
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(5000),

  // MongoDB
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

  // JWT
  ACCESS_TOKEN_SECRET: z
    .string()
    .min(32, "ACCESS_TOKEN_SECRET must be at least 32 characters"),
  REFRESH_TOKEN_SECRET: z
    .string()
    .min(32, "REFRESH_TOKEN_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_EXPIRY: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRY: z.string().default("30d"),

  // OTP
  OTP_EXPIRY_MINUTES: z.coerce.number().default(10),

  // Email (SMTP)
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  SMTP_USER: z.string().min(1, "SMTP_USER is required"),
  SMTP_PASS: z.string().min(1, "SMTP_PASS is required"),
  EMAIL_FROM: z.string().default("CCTV Monitor <noreply@cctvmonitor.com>"),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Firebase
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_BASE64: z.string().optional(),

  // Public URLs & Deployment
  // PUBLIC_BASE_URL: primary URL for this service (e.g. https://api.yourdomain.com).
  // On AWS ECS, set this via SSM Parameter Store / task definition environment.
  PUBLIC_BASE_URL: z.string().optional().transform((v) => (v ? v.replace(/^["']|["']$/g, "").trim() : v)),
  // RENDER_EXTERNAL_URL: kept for backwards-compat with local dev on Render; ignored on AWS.
  RENDER_EXTERNAL_URL: z.string().optional().transform((v) => (v ? v.replace(/^["']|["']$/g, "").trim() : v)),
  ENABLE_DEMO_FEEDS: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  // MediaMTX Internal & External
  MEDIAMTX_URL: z.string().default("http://127.0.0.1:8889").transform((v) => v.replace(/^["']|["']$/g, "").trim()),
  MEDIAMTX_INTERNAL_HLS_URL: z.string().default("http://127.0.0.1:8888").transform((v) => v.replace(/^["']|["']$/g, "").trim()),
  MEDIAMTX_INTERNAL_WEBRTC_URL: z.string().default("http://127.0.0.1:8889").transform((v) => v.replace(/^["']|["']$/g, "").trim()),
  MEDIAMTX_API_URL: z.string().default("http://127.0.0.1:9997/v3").transform((v) => v.replace(/^["']|["']$/g, "").trim()),
  MEDIAMTX_STREAM_SECRET: z.string().optional(),
  STREAM_TOKEN_EXPIRY: z.string().default("24h"),

  // Object Storage (AWS S3 & Cloudflare R2)
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),

  // Cloudflare R2 overrides (optional)
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().default("cctv-recordings"),
  R2_PUBLIC_DOMAIN: z.string().optional(),
  STORAGE_ENDPOINT: z.string().optional(),

  // Razorpay
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000), // 15 min
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(10),

  // CORS
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  // System API Key — REQUIRED, no default. Must be set via SSM / Secrets Manager on AWS.
  SYSTEM_API_KEY: z
    .string()
    .min(32, "SYSTEM_API_KEY must be at least 32 characters"),
});


const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ Invalid environment variables:");
  console.error(_env.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = _env.data;

export type Env = typeof env;
