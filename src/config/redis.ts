/**
 * @file redis.ts
 * @description Centralized Redis connection manager for clustered deployments.
 * Powers distributed express-rate-limit counters across multi-instance load balancers.
 * Gracefully falls back to in-memory store when REDIS_URL is not configured or offline.
 */
import Redis from "ioredis";
import { RedisStore } from "rate-limit-redis";
import { env } from "./env";
import { logger } from "../utils/logger";

let redisClient: Redis | null = null;
let isConnected = false;

if (env.REDIS_URL && env.REDIS_URL.trim()) {
  try {
    redisClient = new Redis(env.REDIS_URL.trim(), {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 3000);
        return delay;
      },
    });

    redisClient.on("connect", () => {
      logger.info("⚡ [Redis] Connecting to distributed cache server...");
    });

    redisClient.on("ready", () => {
      isConnected = true;
      logger.info("✅ [Redis] Connection established. Distributed rate limiting ACTIVE.");
    });

    redisClient.on("error", (err) => {
      isConnected = false;
      logger.error(`❌ [Redis] Error: ${err.message}`);
    });

    redisClient.on("close", () => {
      isConnected = false;
      logger.warn("⚠️ [Redis] Connection closed.");
    });
  } catch (err: any) {
    logger.error(`❌ [Redis] Initialization failed: ${err.message}`);
    redisClient = null;
    isConnected = false;
  }
} else {
  logger.info("ℹ️ [Redis] REDIS_URL not configured. Operating with local in-memory rate limiting.");
}

/**
 * Returns the active Redis client or null if not configured/available.
 */
export const getRedisClient = (): Redis | null => redisClient;

/**
 * Checks whether Redis is currently connected and responsive.
 */
export const isRedisConnected = (): boolean => isConnected;

/**
 * Factory creating a RedisStore instance for express-rate-limit if Redis is configured.
 * Returns undefined when Redis is not configured, causing express-rate-limit to default
 * seamlessly to its built-in MemoryStore without error.
 *
 * @param prefix - Key prefix to isolate limiter counters (e.g. "gen", "auth", "otp", "whip")
 */
export const createRateLimitStore = (prefix: string) => {
  if (!redisClient) {
    return undefined;
  }

  return new RedisStore({
    sendCommand: (...args: string[]) =>
      redisClient!.call(args[0], ...args.slice(1)) as Promise<any>,
    prefix: `cctv:rl:${prefix}:`,
  });
};

/**
 * Graceful teardown for process exit signals.
 */
export const disconnectRedis = async (): Promise<void> => {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info("🛑 [Redis] Disconnected cleanly");
    } catch {
      redisClient.disconnect();
    } finally {
      redisClient = null;
      isConnected = false;
    }
  }
};
