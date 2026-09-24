import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      ANTHROPIC_API_KEY: "test-anthropic-key",
      ANTHROPIC_MODEL: "claude-opus-4-5",
      CRON_SECRET: "test-cron-secret",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "tests/helpers/server-only-stub.ts"),
    },
  },
});
