import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/ApiError";
import { logger } from "../utils/logger";
import mongoose from "mongoose";
import { env } from "../config/env";

interface ErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  errors?: unknown[];
  stack?: string;
}

/**
 * Global Express error handler.
 * Must be registered LAST in the middleware chain.
 * Handles: ApiError, Mongoose errors, JWT errors, and unknown errors.
 */

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  let statusCode = 500;
  let message = "Internal server error";
  let errors: unknown[] = [];

  // ── ApiError (operational errors we explicitly throw) ──
  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;

    if (statusCode >= 500) {
      logger.error(`[ApiError 500] ${req.method} ${req.path}`, {
        message: err.message,
        stack: err.stack,
      });
    }
  }

  // ── Mongoose Validation Error ──
  else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = "Validation failed";
    errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  }

  // ── Mongoose Duplicate Key (E11000) ──
  else if ((err as NodeJS.ErrnoException).code === "EBADCSRFTOKEN") {
    statusCode = 403;
    message = "Invalid CSRF token";
  } else if (
    (err as { code?: number }).code === 11000
  ) {
    statusCode = 409;
    const keyValue = (
      err as { keyValue?: Record<string, unknown> }
    ).keyValue;
    const field = keyValue ? Object.keys(keyValue)[0] : "field";
    message = `${field} already exists`;
  }

  // ── Mongoose CastError (invalid ObjectId) ──
  else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  // ── JWT Errors ──
  else if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token";
  } else if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token has expired";
  }

  // ── Unknown Error ──
  else {
    logger.error(`[Unhandled Error] ${req.method} ${req.path}`, {
      message: err.message,
      stack: err.stack,
    });
  }

  const response: ErrorResponse = {
    success: false,
    statusCode,
    message,
    ...(errors.length > 0 && { errors }),
    // ...(env.NODE_ENV === "development" && { stack: err.stack }),
  };

  res.status(statusCode).json(response);
};

/**
 * 404 handler — register before errorHandler but after all routes.
 */
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(ApiError.notFound(`Route ${req.method} ${req.path}`));
};
