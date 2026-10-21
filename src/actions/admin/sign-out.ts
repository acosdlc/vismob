"use server";

import { redirect } from "next/navigation";
import { ADMIN_LOGIN_PATH } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * The „Ieși” button, as `<form action={signOut}>`. Clears the session cookies (a
 * failure is logged, never shown) and goes to the login screen. No cache call: the
 * redirect is a fresh request, and revalidating the root layout would expire the
 * public site's cached readers for nothing.
 */
export async function signOut(): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) console.warn(`signOut: ${error.message}`);
  } catch (err) {
    console.error("signOut", err);
  }
  redirect(ADMIN_LOGIN_PATH);
}
