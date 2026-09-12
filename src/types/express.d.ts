import type { Logger } from "pino";

declare global {
  namespace Express {
    interface Request {
      /** Correlation id attached to every log line and every error response. */
      requestId: string;
      /** Per-request child logger, added by pino-http. */
      log: Logger;
      /**
       * Query string after validation. Express 5 makes `req.query` read-only,
       * so the parsed result is kept here instead of replacing it.
       */
      validatedQuery?: unknown;
      /** Which configured API token authenticated this request. Never the token itself. */
      apiTokenIndex?: number;
      /** Raw request bytes, kept so webhook signatures can be verified. */
      rawBody?: Buffer;
    }
  }
}

export {};
