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

// Refreshes the session on the signed-in areas and sends anonymous visitors who
// open /admin to the login screen before any page runs. Only navigations (GET,
// HEAD) are redirected. A Server Action is a POST to the page's own address: a
// redirect here would answer in its place, and the form would show the
// framework's error screen and lose what was typed. So every other method goes on
// with the refreshed cookies, and the action answers with ADMIN_MESSAGES.forbidden.
// Nothing here stops an anonymous POST, then: the layout and every Server Action
// check the role themselves (ARHITECTURA §8: never rely on the proxy alone). A
// signed-in user without the admin role passes too: the (panel) layout's guard
// sends them to the login screen, which explains the missing role.
export async function proxy(request: NextRequest) {
  const { response, session } = await updateSession(request);

  const navigation = request.method === "GET" || request.method === "HEAD";
  if (navigation && session.kind === "anonymous" && isGuardedPath(request.nextUrl.pathname)) {
    const redirect = NextResponse.redirect(new URL(LOGIN_PATH, request.url));
    // Keep a session the refresh just rotated, even though this visitor is anonymous now.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  // A Server Action call from a visitor who is not an admin (the session was ended, its
  // renewal was refused, the role was removed) gets no cookie on the response. Next counts
  // a cookie set here as set by the action and renders the page again inside the action's
  // answer; the (panel) layout's guard would redirect that render to the login screen, and
  // the form would be gone with what was typed before the action's notice is ever shown.
  // The request still goes on with the cookies updateSession left on it, so the action
  // sees the session as it is now, and the next navigation writes them to the browser.
  // An admin's call keeps its cookies: a session renewed during a save must reach the
  // browser, and the guard lets that render pass.
  const admin = session.kind === "signed-in" && session.admin;
  if (!navigation && !admin) return NextResponse.next({ request });

  return response;
}

// Only the signed-in areas need a session refresh. The public site stays static.
export const config = {
  matcher: ["/admin/:path*", "/auth/:path*"],
};
