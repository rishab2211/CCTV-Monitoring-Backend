import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "../utils/logger";

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

let retryCount = 0;
let isConnected = false;    // true only when we have a live, confirmed connection
let isReconnecting = false; // prevents parallel reconnect attempts

const connectDB = async (): Promise<void> => {
  if (isReconnecting) return; // guard: don't start a second attempt while one is running
  isReconnecting = true;

  try {
    const conn = await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      // Fix for TLS cert validation issues on Linux with MongoDB Atlas.
      // The system CA bundle may not include MongoDB's certificate chain.
      // Only bypassed in non-production — production enforces full TLS.
      ...(env.NODE_ENV !== "production" && {
        tlsAllowInvalidCertificates: true,
      }),
    });

    isConnected = true;
    retryCount = 0;
    isReconnecting = false;

    const { host, port, name } = conn.connection;
    logger.info(`✅ MongoDB connected: ${host}:${port}/${name}`);
  } catch (error) {
    isConnected = false;
    isReconnecting = false;
    logger.error("❌ MongoDB connection failed:", error);
    throw error;
  }
};

// Only reconnect if we had a live connection that subsequently dropped.
// If isConnected is false, we were never connected — the retry loop above handles it.
// This prevents the disconnected event from running in parallel with the retry loop.
mongoose.connection.on("disconnected", () => {
  if (!isConnected) return;
  isConnected = false;
  logger.warn("⚠️  MongoDB disconnected. Attempting reconnect...");
  retryCount = 0; // reset for a fresh reconnect sequence
  connectDB();
});

mongoose.connection.on("error", (err) => {
  logger.error("❌ MongoDB connection error:", err);
});

export { connectDB };
