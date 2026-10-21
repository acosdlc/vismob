"use server";

import { updateTag } from "next/cache";
import { getAdminSession } from "@/lib/admin/auth";
import { parseSettingsForm } from "@/lib/admin/settings-schema";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import type { Json } from "@/lib/supabase/database.types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

/**
 * „Salvează” on /admin/setari (PLAN PR-7), for `useActionState`. Re-checks the admin
 * role, validates the whole form, writes `settings.data` through the signed-in
 * user's cookie client (RLS: `admin_all`), then expires the "settings" tag so the
 * site reads the new values on its next request (ARHITECTURA §8).
 */
export async function saveSettings(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await getAdminSession();
  if (!admin) return { status: "error", message: ADMIN_MESSAGES.forbidden };

  const parsed = parseSettingsForm(formData);
  if (!parsed.ok) return { status: "error", message: ADMIN_MESSAGES.invalid, fieldErrors: parsed.fieldErrors };

  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error("saveSettings: createClient", err);
    return { status: "error", message: ADMIN_MESSAGES.unavailable };
  }

  try {
    const { data, error } = await supabase
      .from("settings")
      // Settings is an interface (no index signature), so it needs the cast into Json.
      .update({ data: parsed.data as unknown as Json })
      .eq("id", 1)
      .select("id");
    if (error) {
      console.error(`saveSettings: ${error.message}`);
      return { status: "error", message: ADMIN_MESSAGES.generic };
    }
    // RLS does not refuse an update it filters out: without the admin role the
    // statement touches 0 rows and comes back without an error. A missing row 1 gives the
    // same 0 rows and is reported as forbidden on purpose: the seed migration inserts it.
    if (!data || data.length !== 1) return { status: "error", message: ADMIN_MESSAGES.forbidden };
  } catch (err) {
    console.error("saveSettings", err);
    return { status: "error", message: ADMIN_MESSAGES.generic };
  }

  updateTag("settings");
  return { status: "ok", message: ADMIN_MESSAGES.saved };
}
