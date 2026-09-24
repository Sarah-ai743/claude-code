import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/",
  "/pricing",
  "/login",
  "/signup",
  "/reset-password",
  "/reset-password/confirm",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/contact/")) return true;
  if (pathname.startsWith("/auth/callback")) return true;
  if (pathname.startsWith("/api/leads/public")) return true;
  if (pathname.startsWith("/api/cron/")) return true;
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) return true;
  return false;
}

/**
 * Refreshes the Supabase session cookie on every request and redirects
 * unauthenticated users away from app routes. This is the "protected
 * routes" guard — every route not in PUBLIC_PATHS requires a session.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Env not configured yet (e.g. first local run before .env is filled in).
    // Fail open only for public paths; app routes still redirect to /login.
    if (isPublicPath(request.nextUrl.pathname)) return response;
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
