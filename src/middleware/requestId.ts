import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const SAFE_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

/**
 * Gives every request an id, reusing an upstream `x-request-id` when it looks
 * sane. The id goes into every log line and into every error response, so a
 * user can paste it into a support message and you can find the exact request.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("x-request-id");
  req.requestId = incoming && SAFE_ID.test(incoming) ? incoming : `req_${randomUUID()}`;
  res.setHeader("x-request-id", req.requestId);
  next();
}
