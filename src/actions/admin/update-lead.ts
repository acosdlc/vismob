"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin/auth";
import { zodFieldErrors } from "@/lib/admin/leads";
import { ADMIN_MESSAGES, LEAD_STATUSES, type AdminActionState } from "@/lib/admin/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";
import { formValues } from "@/lib/validation/schemas";

// Status and internal notes of one lead (PLAN PR-7 „Cereri”); empty notes are stored
// as null. Not exported: a "use server" module exports only async functions.
const updateLeadSchema = z.object({
  leadId: z.uuid(ADMIN_MESSAGES.invalid),
  status: z.enum(LEAD_STATUSES, ADMIN_MESSAGES.invalid),
  notes: z
    .string({ error: ADMIN_MESSAGES.required })
    .trim()
    .max(4000, ADMIN_MESSAGES.tooLong)
    .transform((value) => (value === "" ? null : value)),
});

/**
 * „Salvează” on /admin/cereri/[id], for `useActionState`. Re-checks the admin role,
 * validates, then writes `status` and `notes` through the signed-in user's cookie
 * client (RLS: `admin_all`). Leads are not public content, so no cache tag expires;
 * `refresh()` re-renders the detail page, whose badge and lead line show the status
 * from the database, in the action's own response (server-actions.md, "Choosing a cache update").
 */
export async function updateLead(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await getAdminSession();
  if (!admin) return { status: "error", message: ADMIN_MESSAGES.forbidden };

  const parsed = updateLeadSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: zodFieldErrors(parsed.error.issues, ADMIN_MESSAGES.invalid),
    };
  }
  const { leadId, status, notes } = parsed.data;

  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error("updateLead: createClient", err);
    return { status: "error", message: ADMIN_MESSAGES.unavailable };
  }

  try {
    const { data, error } = await supabase.from("leads").update({ status, notes }).eq("id", leadId).select("id");
    if (error) {
      console.error(`updateLead: ${error.message}`);
      return { status: "error", message: ADMIN_MESSAGES.generic };
    }
    // RLS does not refuse an update it filters out: without the admin role, or for an
    // id that no longer exists, the statement touches 0 rows and comes back without an error.
    if (!data || data.length !== 1) return { status: "error", message: ADMIN_MESSAGES.forbidden };
  } catch (err) {
    console.error("updateLead", err);
    return { status: "error", message: ADMIN_MESSAGES.generic };
  }

  refresh();
  return { status: "ok", message: ADMIN_MESSAGES.saved };
}
