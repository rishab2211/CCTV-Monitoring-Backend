import { Request, Response, NextFunction, RequestHandler } from "express";
import { ZodSchema, ZodError } from "zod";
import { ApiError } from "../utils/ApiError";

type ValidationTarget = "body" | "params" | "query";

/**
 * Zod schema validation middleware factory.
 * Supports both flat Zod schemas (z.object({ ... })) and wrapped schemas (z.object({ body/query/params: ... })).
 *
 * Usage:
 *   router.post('/tickets', validate(createTicketSchema, 'body'), controller)
 *   router.get('/', validate(paginationSchema, 'query'), controller)
 */
export const validate = (
  schema: ZodSchema,
  target: ValidationTarget = "body"
): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // 1. Try direct parsing (for flat Zod schemas)
    const directResult = schema.safeParse(req[target]);
    if (directResult.success) {
      req[target] = directResult.data;
      return next();
    }

    // 2. Try parsing wrapped object { [target]: req[target] } (for schemas expecting { body/query/params: z.object(...) })
    const wrappedResult = schema.safeParse({ [target]: req[target] });
    if (wrappedResult.success) {
      const parsed = wrappedResult.data as Record<string, any>;
      req[target] = parsed[target] ?? parsed;
      return next();
    }

    // If both failed, format and return Zod errors (using wrapped errors for precise field names if available)
    const errors = formatZodErrors(wrappedResult.error, target);
    return next(ApiError.badRequest("Validation failed", errors));
  };
};

/**
 * Formats Zod validation errors into a clean array for the API response.
 */
const formatZodErrors = (
  error: ZodError,
  targetPrefix?: string
): Array<{ field: string; message: string }> => {
  return error.errors.map((e) => {
    let field = e.path.join(".") || "value";
    if (targetPrefix && field.startsWith(`${targetPrefix}.`)) {
      field = field.slice(targetPrefix.length + 1);
    }
    return {
      field: field || targetPrefix || "value",
      message: e.message,
    };
  });
};
