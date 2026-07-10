/**
 * Custom operational error class for the API.
 * Use this for all expected/handled errors (validation failures, not found, unauthorized, etc.)
 * Unhandled errors (programming bugs) will NOT be instances of this class.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errors: unknown[];
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    errors: unknown[] = [],
    stack?: string
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  // ─── Convenience factories ────────────────────────────────────────────────

  static badRequest(message: string, errors?: unknown[]): ApiError {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message: string = "Unauthorized"): ApiError {
    return new ApiError(401, message);
  }

  static forbidden(
    message: string = "You don't have permission to perform this action"
  ): ApiError {
    return new ApiError(403, message);
  }

  static notFound(resource: string = "Resource"): ApiError {
    return new ApiError(404, `${resource} not found`);
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, message);
  }

  static tooManyRequests(message: string = "Too many requests"): ApiError {
    return new ApiError(429, message);
  }

  static internal(message: string = "Internal server error"): ApiError {
    return new ApiError(500, message);
  }
}
