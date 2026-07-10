import { Request, Response, NextFunction, RequestHandler } from "express";
import { ZodSchema, ZodError } from "zod";
import { ApiError } from "../utils/ApiError";

type ValidationTarget = "body" | "params" | "query";

/**
 * Zod schema validation middleware factory.
 *
 * Usage:
 *   router.post('/register', validate(registerSchema), controller)
 *   router.get('/:id', validate(idSchema, 'params'), controller)
 *
 * On success: req.body / req.params / req.query is replaced with the parsed (typed) value.
 * On failure: throws 400 ApiError with field-level errors.
 */
export const validate = (
  schema: ZodSchema,
  target: ValidationTarget = "body"
): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const errors = formatZodErrors(result.error);
      return next(ApiError.badRequest("Validation failed", errors));
    }

    // Replace with parsed data (handles coercion, defaults, stripping unknowns)
    req[target] = result.data;
    next();
  };
};

/**
 * Formats Zod validation errors into a clean array for the API response.
 */
const formatZodErrors = (error: ZodError): Array<{ field: string; message: string }> => {
  return error.errors.map((e) => ({
    field: e.path.join(".") || "value",
    message: e.message,
  }));
};
