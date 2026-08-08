import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Route gating for the signed-in areas of the site.
 *
 * Next 16 renamed Middleware to Proxy; the file must sit beside `app/` and
 * export `proxy`. Its own docs are explicit that this is not a session
 * management layer — it runs on every matched request and cannot reach
 * SQLite — so all it does is look for the cookie and bounce a request that
 * has none. Whether the cookie is a *valid* session is decided by the page,
 * via `requireSession`, where the database is available.
 *
 * That split is the point: this makes the redirect fast, and the page makes
 * it true. A forged cookie gets past here and no further.
 */
const SESSION_COOKIE = "owntmrw_session";

/**
 * Signed-in areas. Home stays open to everyone, and so do the activity and
 * signals feeds — both are read-only across every tracked project, so there
 * is nothing on either page a session unlocks. Project pages carry the trade
 * terminal and per-wallet data, so they gate the same as the screener and
 * the portfolio.
 */
const GATED = ["/screener", "/portfolio", "/project"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!GATED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  const login = new URL("/login", request.url);
  // Carry the destination so signing in lands where the click was aimed.
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/screener/:path*", "/portfolio/:path*", "/project/:path*"],
};
