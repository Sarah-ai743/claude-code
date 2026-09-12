import { pinoHttp } from "pino-http";
import type { Request } from "express";
import { logger } from "../lib/logger.js";

/**
 * One log line per request: method, path, status, duration, request id.
 *
 * Request bodies are never logged — a lead inquiry contains a customer's
 * personal information, and logs are the wrong place for it.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as Request).requestId,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
