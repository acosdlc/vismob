"use server";

import { redirect } from "next/navigation";
import { ADMIN_LOGIN_PATH } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * The „Ieși” button, as `<form action={signOut}>`. Ends the session of this browser
 * and clears its cookies (a failure is logged, never shown), then goes to the login
 * screen. The scope is "local": the library's default, "global", would sign the
 * account out on every other device too. No cache call: the redirect is a fresh
 * request, and revalidating the root layout would expire the public site's cached
 * readers for nothing.
 */
export async function signOut(): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) console.warn(`signOut: ${error.message}`);
  } catch (err) {
    console.error("signOut", err);
  }
  redirect(ADMIN_LOGIN_PATH);
}
