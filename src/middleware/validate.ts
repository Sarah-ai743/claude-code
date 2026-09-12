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
function toDetails(issues: { path: PropertyKey[]; message: string; code: string }[]) {
  return issues.map((issue) => ({
    field: issue.path.join(".") || "(body)",
    message: issue.message,
    code: issue.code,
  }));
}

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      next(new ValidationError("The request body is invalid.", toDetails(result.error.issues)));
      return;
    }

    req.body = result.data;
    next();
  };
}

/**
 * Same idea for the query string. Express 5 exposes `req.query` through a
 * getter, so the parsed value is attached as `req.validatedQuery` rather than
 * overwriting it.
 */
export function validateQuery<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      next(
        new ValidationError("The query string is invalid.", toDetails(result.error.issues)),
      );
      return;
    }

    req.validatedQuery = result.data;
    next();
  };
}
