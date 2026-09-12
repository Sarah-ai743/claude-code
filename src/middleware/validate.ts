import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { ValidationError } from "../lib/errors.js";

/**
 * Validates and replaces `req.body` with the parsed result.
 *
 * After this middleware, the controller works with data that is known-good and
 * fully typed. Unknown fields are stripped rather than passed through, so a
 * frontend cannot smuggle extra properties into the service layer.
 */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join(".") || "(body)",
        message: issue.message,
        code: issue.code,
      }));
      next(new ValidationError("The request body is invalid.", details));
      return;
    }

    req.body = result.data;
    next();
  };
}
