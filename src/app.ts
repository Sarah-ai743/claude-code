import express, { type Express } from "express";
import cors from "cors";
import { corsAllowedOrigins } from "./config/env.js";
import { requestId } from "./middleware/requestId.js";
import { httpLogger } from "./middleware/httpLogger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { apiTokenAuth } from "./middleware/apiTokenAuth.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { leadsRouter } from "./modules/leads/leads.routes.js";
import { followupsRouter } from "./modules/followups/followups.routes.js";
import { approvalsRouter } from "./modules/approvals/approvals.routes.js";
import { activityRouter } from "./modules/audit/audit.routes.js";

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
      allowedHeaders: ["Content-Type", "Authorization", "X-API-Token", "X-Request-Id"],
      exposedHeaders: ["X-Request-Id"],
      maxAge: 600,
    }),
  );

  // A body limit is a cheap denial-of-service and cost guard.
  app.use(express.json({ limit: "128kb" }));

  // Public: uptime monitors and the hosting platform's health check need to
  // reach this without a credential. It reveals nothing but liveness.
  app.use("/api/health", healthRouter);

  // Everything else requires the shared API token.
  app.use("/api/leads", apiTokenAuth, leadsRouter);
  app.use("/api/followups", apiTokenAuth, followupsRouter);
  app.use("/api/approvals", apiTokenAuth, approvalsRouter);
  app.use("/api/activity", apiTokenAuth, activityRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
