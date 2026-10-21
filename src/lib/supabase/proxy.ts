import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ANONYMOUS, sessionFromClaims, type SessionState } from "@/lib/admin/session";
import { supabasePublishableKey, supabaseUrl } from "./env";

export interface UpdatedSession {
  /** Return this exact response (or copy its cookies) so the refreshed cookies reach the browser. */
  response: NextResponse;
  /** Who is visiting, from the verified claims; anonymous when nothing can be checked. */
  session: SessionState;
}

// Refreshes the Supabase Auth session and writes the new cookies to the request
// (for Server Components) and to the response (for the browser), then says who
// the visitor is. Never throws: without the Supabase variables, or when the
// check fails, the visitor is anonymous and the request goes on untouched.
export async function updateSession(request: NextRequest): Promise<UpdatedSession> {
  let response = NextResponse.next({ request });

  let url: string;
  let key: string;
  try {
    url = supabaseUrl();
    key = supabasePublishableKey();
  } catch (err) {
    console.warn(`updateSession: ${err instanceof Error ? err.message : String(err)}`);
    return { response, session: ANONYMOUS };
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Nothing may run between createServerClient and getClaims(), or users get
  // logged out at random. getClaims() validates the JWT signature.
  try {
    const { data } = await supabase.auth.getClaims();
    return { response, session: sessionFromClaims(data?.claims) };
  } catch (err) {
    console.error("updateSession", err);
    return { response, session: ANONYMOUS };
  }
}
