/**
 * Central place that reads and validates environment variables. Importing
 * from here instead of `process.env` directly means a missing variable
 * fails loudly, at the point of use, with a clear message — not as a
 * mysterious `undefined` three layers deep.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",

  get SUPABASE_URL(): string {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get SUPABASE_ANON_KEY(): string {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get SUPABASE_SERVICE_ROLE_KEY(): string {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },

  get ANTHROPIC_API_KEY(): string {
    return required("ANTHROPIC_API_KEY");
  },
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-5",

  get CRON_SECRET(): string {
    return required("CRON_SECRET");
  },

  APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

/** Non-throwing accessors for use in places that must not crash at import time (e.g. tests). */
export function readEnv(name: string): string | undefined {
  return process.env[name];
}
