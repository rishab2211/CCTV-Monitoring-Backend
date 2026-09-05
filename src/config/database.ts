import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "../utils/logger";

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

let retryCount = 0;
let isConnected = false;    // true only when we have a live, confirmed connection
let isReconnecting = false; // prevents parallel reconnect attempts

const connectDB = async (): Promise<void> => {
  if (isReconnecting) return;
  isReconnecting = true;

  while (retryCount < MAX_RETRIES) {
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
      return;
    } catch (error) {
      retryCount++;
      isConnected = false;
      const delay = RETRY_DELAY_MS * Math.pow(1.5, retryCount - 1);
      logger.error(`❌ MongoDB connection attempt ${retryCount}/${MAX_RETRIES} failed:`, error);

      if (retryCount >= MAX_RETRIES) {
        isReconnecting = false;
        logger.error(`❌ MongoDB connection failed after ${MAX_RETRIES} attempts.`);
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  isReconnecting = false;
};

// Only reconnect if we had a live connection that subsequently dropped.
mongoose.connection.on("disconnected", () => {
  if (!isConnected) return;
  isConnected = false;
  logger.warn("⚠️  MongoDB disconnected. Attempting reconnect...");
  retryCount = 0;
  connectDB().catch((err) => {
    logger.error("❌ MongoDB reconnect sequence failed:", err);
  });
});

mongoose.connection.on("error", (err) => {
  logger.error("❌ MongoDB connection error:", err);
});

export { connectDB };
