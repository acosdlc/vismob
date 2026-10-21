"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ADMIN_HOME_PATH } from "@/lib/admin/auth";
import { parseLogin } from "@/lib/admin/login-schema";
import { sessionFromClaims } from "@/lib/admin/session";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

/**
 * The /admin/login form, for `useActionState` (docs/PLAN.md PR-7). Signs in with
 * email and password through the cookie client, then checks the admin role on the
 * verified claims: a user without it is signed out again and told why (ARHITECTURA
 * §8). Supabase's own error texts never reach the screen.
 */
export async function signIn(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const parsed = parseLogin(formData);
  if (!parsed.ok) return { status: "error", message: ADMIN_MESSAGES.invalid, fieldErrors: parsed.fieldErrors };

  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error("signIn", err);
    return { status: "error", message: ADMIN_MESSAGES.unavailable };
  }

  let admin = false;
  try {
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      console.warn(`signIn: ${error.message}`);
      return { status: "error", message: ADMIN_MESSAGES.credentials };
    }
    const { data, error: claimsError } = await supabase.auth.getClaims();
    if (claimsError) {
      // The password was right but the token could not be verified (JWKS, network):
      // not a missing role, so no sign-out and no „fără drepturi” message.
      console.warn(`signIn: ${claimsError.message}`);
      return { status: "error", message: ADMIN_MESSAGES.unavailable };
    }
    const session = sessionFromClaims(data?.claims);
    admin = session.kind === "signed-in" && session.admin;
    // A valid account without the role gets no session: sign it out again.
    if (!admin) await supabase.auth.signOut();
  } catch (err) {
    console.error("signIn", err);
    return { status: "error", message: ADMIN_MESSAGES.unavailable };
  }
  if (!admin) return { status: "error", message: ADMIN_MESSAGES.notAdmin };

  // redirect() throws to perform the navigation, so it stays outside the try.
  revalidatePath("/", "layout");
  redirect(ADMIN_HOME_PATH);
}
