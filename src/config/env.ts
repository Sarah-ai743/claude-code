import "dotenv/config";
import { z } from "zod";

/**
 * Every environment variable the application reads goes through this file.
 *
 * Two rules make this safe:
 *   1. Nothing else in the codebase touches `process.env` directly.
 *   2. If a required variable is missing or malformed, the process refuses to
 *      start. A loud crash at deploy time beats a mysterious 500 at 2am.
 */
const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(8080),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    /** Comma-separated list of browser origins allowed to call this API. */
    CORS_ALLOWED_ORIGINS: z.string().default(""),

    /** `mock` runs the whole app offline with no API key and no cost. */
    AI_PROVIDER: z.enum(["anthropic", "mock"]).default("anthropic"),
    AI_MODEL_DEFAULT: z.string().min(1).default("claude-opus-5"),
    AI_EFFORT: z.enum(["low", "medium", "high"]).default("medium"),
    AI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
    AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(2_000),

    /** Read from the environment only — never hard-coded, never logged. */
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.AI_PROVIDER === "anthropic" && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["ANTHROPIC_API_KEY"],
        message: "ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic",
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    // Deliberately console.error, not the logger: the logger itself depends on
    // this config, so it may not exist yet.
    console.error(`Invalid environment configuration:\n${problems}\n`);
    console.error("Copy .env.example to .env and fill in the missing values.");
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();

export const corsAllowedOrigins: string[] = env.CORS_ALLOWED_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const isProduction = env.NODE_ENV === "production";
