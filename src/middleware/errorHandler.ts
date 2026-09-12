import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors.js";

/**
 * The single exit point for every failure in the application.
 *
 * The client gets a stable machine-readable `code`, a safe message, and the
 * request id. The server keeps the stack trace. Leaking stack traces or driver
 * errors to a browser tells an attacker how your system is built.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const isKnown = err instanceof AppError;
  const status = isKnown ? err.status : 500;
  const code = isKnown ? err.code : "INTERNAL_ERROR";
  const details = isKnown ? err.details : [];

  const safeMessage =
    isKnown && err.expose
      ? err.message
      : "Something went wrong on our side. Please try again.";

  const log = req.log ?? console;
  const logPayload = { err, code, status, requestId: req.requestId };

  if (status >= 500) {
    log.error(logPayload, "request failed");
  } else {
    log.warn(logPayload, "request rejected");
  }

  // Note what is NOT here: no stack trace, no `cause`, no upstream error text,
  // in any environment. The full detail went to the logs a few lines above,
  // and the request id ties the two together.
  res.status(status).json({
    error: {
      code,
      message: safeMessage,
      details,
      requestId: req.requestId,
    },
  });
}
