import pino from "pino";
import { env, isProduction } from "../config/env.js";

/**
 * Structured JSON logging.
 *
 * `redact` is the important part: even if a secret is accidentally attached to
 * a log call, it is replaced with [Redacted] before anything is written.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-api-key']",
      "*.apiKey",
      "*.api_key",
      "*.ANTHROPIC_API_KEY",
      "*.password",
      "*.token",
    ],
    censor: "[Redacted]",
  },
  // Pretty output is a development nicety; production logs stay machine-readable.
  ...(isProduction ? {} : { transport: undefined }),
});

export type Logger = typeof logger;
