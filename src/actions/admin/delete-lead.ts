"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin/auth";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import { UPLOAD_LIMITS } from "@/lib/leads/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

/** Where the admin lands once the lead is gone. */
const LEADS_PATH = "/admin/cereri";

/**
 * „Șterge cererea” on /admin/cereri/[id], for `useActionState` (PLAN PR-7). Re-checks
 * the admin role, removes the lead's photos from the private bucket, then the row;
 * `lead_files` and `lead_events` go with it (on delete cascade). Everything runs
 * through the signed-in user's cookie client (RLS: `admin_all`,
 * `admin_all_lead_uploads`). On success it redirects to the list, so the state
 * only ever carries an error.
 */
export async function deleteLead(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await getAdminSession();
  if (!admin) return { status: "error", message: ADMIN_MESSAGES.forbidden };

  const parsed = z.uuid().safeParse(formData.get("leadId"));
  if (!parsed.success) return { status: "error", message: ADMIN_MESSAGES.invalid };
  const leadId = parsed.data;

  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error("deleteLead: createClient", err);
    return { status: "error", message: ADMIN_MESSAGES.unavailable };
  }

  try {
    // The photos first: once the row is gone, nothing remembers their paths. A
    // failure here is logged, not fatal: the request itself must still disappear.
    const files = await supabase.from("lead_files").select("path").eq("lead_id", leadId);
    if (files.error) {
      console.error(`deleteLead: lead_files: ${files.error.message}`);
    } else if (files.data.length > 0) {
      const paths = files.data.map((file) => file.path);
      const removed = await supabase.storage.from(UPLOAD_LIMITS.bucket).remove(paths);
      if (removed.error) console.error(`deleteLead: storage remove: ${removed.error.message}`);
    }

    const { data, error } = await supabase.from("leads").delete().eq("id", leadId).select("id");
    if (error) {
      console.error(`deleteLead: ${error.message}`);
      return { status: "error", message: ADMIN_MESSAGES.generic };
    }
    // RLS filters silently: 0 rows means no admin role or a lead already gone.
    if (!data || data.length !== 1) return { status: "error", message: ADMIN_MESSAGES.forbidden };
  } catch (err) {
    console.error("deleteLead", err);
    return { status: "error", message: ADMIN_MESSAGES.generic };
  }

  // redirect() throws to perform the navigation, so it stays outside the try.
  redirect(LEADS_PATH);
}
