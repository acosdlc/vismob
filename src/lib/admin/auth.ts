import "server-only";
import { redirect, unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ANONYMOUS, adminFromSession, sessionFromClaims, type AdminSession, type SessionState } from "./session";

export type { AdminSession, SessionState } from "./session";

export const ADMIN_LOGIN_PATH = "/admin/login";
export const ADMIN_HOME_PATH = "/admin";

/**
 * Who is visiting, from the session cookie. `getClaims()` verifies the JWT
 * signature (ARHITECTURA §8: never trust `getSession()` alone). It reads
 * `cookies()`, so every caller runs at request time, inside a `<Suspense>`
 * boundary (Server Component) or in a Server Action. Fails closed: with no
 * Supabase variables, a network error or a bad token the visitor is anonymous.
 * During a prerender `cookies()` is a hanging promise that Next settles itself;
 * `unstable_rethrow` hands that (and a redirect) back to the framework.
 */
export async function readSession(): Promise<SessionState> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error) {
      console.warn(`readSession: ${error.message}`);
      return ANONYMOUS;
    }
    return sessionFromClaims(data?.claims);
  } catch (err) {
    unstable_rethrow(err);
    console.error("readSession", err);
    return ANONYMOUS;
  }
}

/** The admin session, or null. Server Actions use this and answer with an error state when it is null. */
export async function getAdminSession(): Promise<AdminSession | null> {
  return adminFromSession(await readSession());
}

/** For pages and layouts: the admin session, or a redirect to /admin/login. */
export async function requireAdmin(): Promise<AdminSession> {
  const admin = await getAdminSession();
  if (!admin) redirect(ADMIN_LOGIN_PATH);
  return admin;
}
