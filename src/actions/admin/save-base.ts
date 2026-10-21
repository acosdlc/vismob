"use server";

import { updateTag } from "next/cache";
import { getAdminSession } from "@/lib/admin/auth";
import { CATALOG_MESSAGES, parseBaseForm, rowId } from "@/lib/admin/catalog-schemas";
import { PHOTO_FIELDS, photoChange, removeMediaObject } from "@/lib/admin/media";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

/**
 * „Salvează” on /admin/catalog/baze/[id] (PLAN PR-8), for `useActionState`. Re-checks
 * the admin role, validates, then writes the base's name, note, `active`, `sort` and
 * photo path through the signed-in user's cookie client (RLS: `admin_all`), removes
 * the photo the save replaced and expires the "catalog" tag. The photo itself was
 * uploaded by the browser (PhotoField); only its path arrives here. Deactivating the
 * last active base is refused: the configurator needs one to resolve a configuration.
 */
export async function saveBase(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await getAdminSession();
  if (!admin) return { status: "error", message: ADMIN_MESSAGES.forbidden };

  const id = rowId(formData);
  if (!id) return { status: "error", message: ADMIN_MESSAGES.notFound };

  const parsed = parseBaseForm(formData);
  if (!parsed.ok) return { status: "error", message: ADMIN_MESSAGES.invalid, fieldErrors: parsed.fieldErrors };
  const change = photoChange(formData, "bases");
  if (!change.ok) {
    return { status: "error", message: ADMIN_MESSAGES.invalid, fieldErrors: { [PHOTO_FIELDS.path]: ADMIN_MESSAGES.invalid } };
  }
  const { name, note, active, sort } = parsed.data;

  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error("saveBase: createClient", err);
    return { status: "error", message: ADMIN_MESSAGES.unavailable };
  }

  try {
    const base = await supabase.from("bases").select("id, active, photo_path").eq("id", id).maybeSingle();
    if (base.error) throw new Error(`bases: ${base.error.message}`);
    if (!base.data) return { status: "error", message: ADMIN_MESSAGES.notFound };

    if (!active && base.data.active) {
      const others = await supabase
        .from("bases")
        .select("id", { count: "exact", head: true })
        .eq("active", true)
        .neq("id", id);
      if (others.error) throw new Error(`bases count: ${others.error.message}`);
      // An unknown count is treated as none: better to refuse than to empty the configurator.
      if ((others.count ?? 0) === 0) {
        return { status: "error", message: CATALOG_MESSAGES.lastBase, fieldErrors: { active: CATALOG_MESSAGES.lastBase } };
      }
    }

    const updated = await supabase
      .from("bases")
      .update({ name, note, active, sort, photo_path: change.path })
      .eq("id", id)
      .select("id");
    if (updated.error) throw new Error(`bases: ${updated.error.message}`);
    // RLS does not refuse an update it filters out: without the admin role the
    // statement touches 0 rows and comes back without an error.
    if (!updated.data || updated.data.length !== 1) return { status: "error", message: ADMIN_MESSAGES.forbidden };

    // The object to remove is the one the row pointed at, not what the form says it
    // loaded with: a stale tab would otherwise orphan the live photo. Only once the row
    // points elsewhere: a failure here is logged, never fatal.
    const previous = base.data.photo_path;
    await removeMediaObject(supabase.storage, previous && previous !== change.path ? previous : null);
  } catch (err) {
    console.error("saveBase", err);
    return { status: "error", message: ADMIN_MESSAGES.generic };
  }

  updateTag("catalog");
  return { status: "ok", message: ADMIN_MESSAGES.saved };
}
