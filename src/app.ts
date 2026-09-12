import express, { type Express } from "express";
import cors from "cors";
import { corsAllowedOrigins } from "./config/env.js";
import { requestId } from "./middleware/requestId.js";
import { httpLogger } from "./middleware/httpLogger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { leadsRouter } from "./modules/leads/leads.routes.js";

/**
 * Builds the Express application. Kept separate from server.ts so tests can
 * import the app and make requests against it without opening a port.
 *
 * Middleware order matters and reads top to bottom:
 *   id → logging → cors → body parsing → routes → 404 → errors
 */
export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(requestId);
  app.use(httpLogger);

  app.use(
    cors({
      origin(origin, callback) {
        // Requests with no Origin header (curl, server-to-server) are allowed;
        // browser requests must come from an allow-listed origin.
        if (!origin || corsAllowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      exposedHeaders: ["X-Request-Id"],
      maxAge: 600,
    }),
  );

  // A body limit is a cheap denial-of-service and cost guard.
  app.use(express.json({ limit: "128kb" }));

  app.use("/api/health", healthRouter);
  app.use("/api/leads", leadsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
