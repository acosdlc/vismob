import type { JwtPayload } from "@supabase/supabase-js";

// What the admin knows about the visitor, derived from the verified JWT claims
// (src/lib/admin/auth.ts reads them; this module is pure so it can be tested).
// The role lives in `app_metadata.role`, granted by SQL (docs/ADMIN.md); the
// `is_admin()` function in the database checks the very same claim for RLS.

export const ADMIN_ROLE = "admin";

export type SessionState =
  | { kind: "anonymous" }
  | { kind: "signed-in"; userId: string; email: string | null; admin: boolean };

/** A signed-in user with the admin role. */
export interface AdminSession {
  userId: string;
  email: string | null;
}

export const ANONYMOUS: SessionState = { kind: "anonymous" };

/** The session state for a set of claims; no claims or no subject means anonymous. */
export function sessionFromClaims(claims: JwtPayload | null | undefined): SessionState {
  if (!claims || typeof claims.sub !== "string" || claims.sub === "") return ANONYMOUS;
  const role = claims.app_metadata?.role;
  return {
    kind: "signed-in",
    userId: claims.sub,
    email: typeof claims.email === "string" && claims.email !== "" ? claims.email : null,
    admin: role === ADMIN_ROLE,
  };
}

/** The admin session, or null when the visitor is anonymous or has no admin role. */
export function adminFromSession(state: SessionState): AdminSession | null {
  return state.kind === "signed-in" && state.admin ? { userId: state.userId, email: state.email } : null;
}
