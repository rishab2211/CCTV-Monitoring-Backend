import express, { Application } from "express";
import helmet from "helmet";
import cors from "cors";
import { env } from "./config/env";
import router from "./routes";
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
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || env.NODE_ENV === "development") {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy: Origin ${origin} not allowed`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// ─── Body Parsers ─────────────────────────────────────────────────────────────

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ─── Trust Proxy (for correct IP behind Nginx) ────────────────────────────────

app.set("trust proxy", 1);

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

app.use("/api", router);

// ─── 404 & Error Handlers ────────────────────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
