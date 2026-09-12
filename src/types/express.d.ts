import type { Logger } from "pino";

declare global {
  namespace Express {
    interface Request {
      /** Correlation id attached to every log line and every error response. */
      requestId: string;
      /** Per-request child logger, added by pino-http. */
      log: Logger;
    }
  }
}

export {};
