import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import fs from "fs";
import { env } from "../config/env";

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// Ensure log directory exists dynamically
const logDir = path.resolve(process.cwd(), "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, stack }) => {
  const base = `${timestamp} [${level}]: ${message}`;
  return stack ? `${base}\n${stack}` : base;
});

// File transport — daily rotation, keeps 14 days of logs
const fileRotateTransport = new DailyRotateFile({
  filename: path.join(logDir, "cctv-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  maxFiles: "14d",
  maxSize: "20m",
  format: combine(timestamp(), errors({ stack: true }), json()),
});

// Error-only file transport
const errorFileTransport = new DailyRotateFile({
  filename: path.join(logDir, "error-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  maxFiles: "30d",
  maxSize: "20m",
  level: "error",
  format: combine(timestamp(), errors({ stack: true }), json()),
});


export const logger = winston.createLogger({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  defaultMeta: { service: "cctv-backend" },
  transports: [
    // Console — always on
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        errors({ stack: true }),
        consoleFormat
      ),
    }),
    // File transports
    fileRotateTransport,
    errorFileTransport,
  ],
});

// Stream for Morgan (if used later)
export const morganStream = {
  write: (message: string) => logger.http(message.trim()),
};
