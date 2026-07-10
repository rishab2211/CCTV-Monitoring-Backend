import { Request, Response, NextFunction, RequestHandler } from "express";

type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

/**
 * Wraps async Express route handlers to automatically catch errors
 * and forward them to the global error handler via next().
 *
 * Usage:
 *   router.get('/path', catchAsync(async (req, res) => { ... }))
 */
export const catchAsync = (fn: AsyncHandler): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
