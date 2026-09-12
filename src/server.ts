import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { getAIProvider } from "./ai/providers/index.js";

/**
 * Starts the HTTP listener. Nothing else belongs in this file.
 */
function start(): void {
  // Fail fast: if the provider cannot be constructed (missing key), find out at
  // boot rather than on the first customer request.
  getAIProvider();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "server.started");
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, "server.shutting_down");
    server.close(() => process.exit(0));
    // Don't hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "unhandled_rejection");
  });
}

start();
