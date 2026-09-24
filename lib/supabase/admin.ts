import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Service-role Supabase client. This BYPASSES Row Level Security entirely,
 * so it must never be imported by any file that can end up in a client
 * bundle (the `server-only` import above makes that a build-time error).
 *
 * Only two call sites should ever use this:
 *   1. `/api/leads/public` — the one write path with no logged-in session.
 *   2. `/api/cron/followups` — a trusted, secret-gated background job.
 * Everything else must use the request-scoped client from `./server` so
 * that RLS is the real enforcement boundary.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
