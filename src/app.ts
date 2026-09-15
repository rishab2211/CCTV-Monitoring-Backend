import path from "path";
import express, { Application } from "express";
import helmet from "helmet";
import cors from "cors";
import { env } from "./config/env";
import router from "./routes";
import healthRoutes from "./routes/v1/health.routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { generalLimiter } from "./middleware/rateLimiter";
import { logger } from "./utils/logger";

const app: Application = express();

// ─── Security Middleware ──────────────────────────────────────────────────────

// Helmet — sets secure HTTP headers
app.use(
  helmet({
    crossOriginEmbedderPolicy: false, // Needed for WebRTC later
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
      },
    },
  })
);

// CORS
const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());
const isWildcard = allowedOrigins.includes("*");

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, server-to-server)
      if (!origin) return callback(null, true);
      // Wildcard — allow all origins (not recommended for credentialed requests)
      if (isWildcard) return callback(null, true);
      // Development — allow everything
      if (env.NODE_ENV === "development") return callback(null, true);
      // Production — explicit allowlist check
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // Return null (block) instead of throwing — prevents 500, lets CORS module send 403
        callback(null, false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    optionsSuccessStatus: 204, // Some legacy browsers (IE11) choke on 204
  })
);

// ─── Body Parsers ─────────────────────────────────────────────────────────────

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ─── Trust Proxy (for correct IP behind Nginx) ────────────────────────────────

app.set("trust proxy", 1);

// ─── Health Checks & Orchestrator Probes ──────────────────────────────────────
// Mounted before rate limiter so health probes are never throttled or blocked
app.use("/health", healthRoutes);

// Fast HTTP/HEAD root ping for cloud orchestrators & load balancers
app.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "CCTV Monitoring Backend",
    healthCheck: "/api/v1/health",
  });
});

// ─── Global Rate Limiter ──────────────────────────────────────────────────────

app.use(generalLimiter);

// ─── Request Logger (development only) ───────────────────────────────────────

if (env.NODE_ENV === "development") {
  app.use((req, _res, next) => {
    logger.debug(`→ ${req.method} ${req.path}`);
    next();
  });
}

// ─── API Routes ───────────────────────────────────────────────────────────────

// Static uploads for evidence (with security headers)
app.use(
  "/uploads",
  (_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=3600");
    next();
  },
  express.static(path.join(__dirname, "../uploads"))
);

app.use("/api", router);

// ─── 404 & Error Handlers ────────────────────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
