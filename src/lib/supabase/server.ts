import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

// Server client for Server Components, Server Actions and Route Handlers.
// Create a new one per request; it reads the session from the request cookies.
// Row level security applies: signed in as the admin it sees everything the
// admin_all policies allow; anonymous it sees only the public_read rows. The
// admin (src/app/admin, src/actions/admin) reads and writes only through it.
//
// It waits for a real request first. With Partial Prefetching (next.config.ts) Next
// prerenders every panel screen again at request time, with the visitor's cookies: for
// a link's prefetch, and once beside every navigation and page load. cookies() resolves
// in such a pass, so the client would be built and used there, where its clock read is
// reported as an error and every read is cut when the pass ends, which the screens then
// log as a failed read. connection() stays pending in every prerender, the build's
// included; Next settles it itself and the callers' unstable_rethrow() hands that back.
// It resolves at once in a real render and in a Server Action.
export async function createClient() {
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, which cannot set cookies.
          // The proxy refreshes the session instead.
        }
      },
    },
  });
}

export type ServerClient = Awaited<ReturnType<typeof createClient>>;
