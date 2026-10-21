"use server";

import { updateTag } from "next/cache";
import { getAdminSession } from "@/lib/admin/auth";
import { parseFamilyForm, rowId } from "@/lib/admin/catalog-schemas";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

/**
 * „Salvează” on /admin/catalog/familii/[id] (PLAN PR-8), for `useActionState`. Re-checks
 * the admin role, validates, then writes the family's name, description and
 * specification rows through the signed-in user's cookie client (RLS: `admin_all`)
 * and expires the "catalog" tag. The code and the tab are structural (configuration
 * codes, the Materiale page) and are not written here.
 */
export async function saveFamily(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await getAdminSession();
  if (!admin) return { status: "error", message: ADMIN_MESSAGES.forbidden };

  const id = rowId(formData);
  if (!id) return { status: "error", message: ADMIN_MESSAGES.notFound };

  const parsed = parseFamilyForm(formData);
  if (!parsed.ok) return { status: "error", message: ADMIN_MESSAGES.invalid, fieldErrors: parsed.fieldErrors };
  const { name, description, specs } = parsed.data;

  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error("saveFamily: createClient", err);
    return { status: "error", message: ADMIN_MESSAGES.unavailable };
  }

  try {
    const family = await supabase.from("material_families").select("id").eq("id", id).maybeSingle();
    if (family.error) throw new Error(`material_families: ${family.error.message}`);
    if (!family.data) return { status: "error", message: ADMIN_MESSAGES.notFound };

    const updated = await supabase
      .from("material_families")
      .update({ name, description, specs })
      .eq("id", id)
      .select("id");
    if (updated.error) throw new Error(`material_families: ${updated.error.message}`);
    // RLS does not refuse an update it filters out: without the admin role the
    // statement touches 0 rows and comes back without an error.
    if (!updated.data || updated.data.length !== 1) return { status: "error", message: ADMIN_MESSAGES.forbidden };
  } catch (err) {
    console.error("saveFamily", err);
    return { status: "error", message: ADMIN_MESSAGES.generic };
  }

  updateTag("catalog");
  return { status: "ok", message: ADMIN_MESSAGES.saved };
}
