import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests never call a real AI provider and never need a real API key.
    // These values are set before any application module is imported.
    env: {
      NODE_ENV: "test",
      AI_PROVIDER: "mock",
      LOG_LEVEL: "silent",
      CORS_ALLOWED_ORIGINS: "http://localhost:3000",
    },
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
