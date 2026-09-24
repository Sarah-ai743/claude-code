import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Exchanges the PKCE `code` Supabase Auth puts on email links (password
 * reset, magic link, email confirmation) for a real session, then
 * forwards to `next`. Without this, a clicked email link carries a code
 * but no active session, and the page it lands on (e.g. "set a new
 * password") would have nothing to act on.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
