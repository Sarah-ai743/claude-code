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
      // Must match TEST_API_TOKEN in tests/helpers/client.ts.
      LEADPILOT_API_TOKEN:
        "test-token-0123456789abcdef0123456789abcdef0123456789abcdef",
    },
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
