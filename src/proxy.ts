import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// The same path as ADMIN_LOGIN_PATH in src/lib/admin/auth.ts, which is
// server-only (it reads cookies()) and so cannot be imported here.
const LOGIN_PATH = "/admin/login";

/** /admin and everything under it, except the login screen itself (with or without a trailing slash). */
export function isGuardedPath(pathname: string): boolean {
  if (pathname === LOGIN_PATH || pathname === `${LOGIN_PATH}/`) return false;
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

// Refreshes the session on the signed-in areas and sends anonymous visitors of
// /admin to the login screen before any page runs. A signed-in user without the
// admin role passes: the (panel) layout's guard sends them to the login screen,
// which explains the missing role. The layout and every Server Action check the
// role again (ARHITECTURA §8: never rely on the proxy alone).
export async function proxy(request: NextRequest) {
  const { response, session } = await updateSession(request);

  if (session.kind === "anonymous" && isGuardedPath(request.nextUrl.pathname)) {
    const redirect = NextResponse.redirect(new URL(LOGIN_PATH, request.url));
    // Keep a session the refresh just rotated, even though this visitor is anonymous now.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}

// Only the signed-in areas need a session refresh. The public site stays static.
export const config = {
  matcher: ["/admin/:path*", "/auth/:path*"],
};
