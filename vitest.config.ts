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
      // Throwaway fixtures — see tests/helpers/client.ts.
      EMAIL_WEBHOOK_SECRET: "test-webhook-secret-0123456789abcdef0123456789ab",
      EMAIL_DEFAULT_BUSINESS_TYPE: "Cleaning Company",
      EMAIL_DEFAULT_SERVICES: "Home Cleaning,End of Tenancy Cleaning",
      EMAIL_DEFAULT_LANGUAGE: "English",
      EMAIL_APPROVAL_REQUIRED: "true",
    },
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
