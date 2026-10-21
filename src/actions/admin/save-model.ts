"use server";

import { updateTag } from "next/cache";
import { getAdminSession } from "@/lib/admin/auth";
import { CATALOG_MESSAGES, parseModelForm, rowId } from "@/lib/admin/catalog-schemas";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

/**
 * „Salvează” on /admin/catalog/modele/[id] (PLAN PR-8), for `useActionState`. Re-checks
 * the admin role, validates, then writes the model's texts, `active` and `sort` and
 * replaces its model ↔ family rules through the signed-in user's cookie client (RLS:
 * `admin_all`), and expires the "catalog" tag. The model itself is never created or
 * deleted here (its drawing and rules live in code), and it keeps at least one family:
 * without one, catalogFromRows() would drop it from the configurator. Deactivating the
 * last active model is refused too: getCatalog() throws on a catalogue without models.
 */
export async function saveModel(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await getAdminSession();
  if (!admin) return { status: "error", message: ADMIN_MESSAGES.forbidden };

  const id = rowId(formData);
  if (!id) return { status: "error", message: ADMIN_MESSAGES.notFound };

  const parsed = parseModelForm(formData);
  if (!parsed.ok) return { status: "error", message: ADMIN_MESSAGES.invalid, fieldErrors: parsed.fieldErrors };
  const { name, note, description, active, sort, families } = parsed.data;

  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error("saveModel: createClient", err);
    return { status: "error", message: ADMIN_MESSAGES.unavailable };
  }

  try {
    const model = await supabase.from("models").select("id, active").eq("id", id).maybeSingle();
    if (model.error) throw new Error(`models: ${model.error.message}`);
    if (!model.data) return { status: "error", message: ADMIN_MESSAGES.notFound };

    if (!active && model.data.active) {
      const others = await supabase
        .from("models")
        .select("id", { count: "exact", head: true })
        .eq("active", true)
        .neq("id", id);
      if (others.error) throw new Error(`models count: ${others.error.message}`);
      // An unknown count is treated as none: better to refuse than to empty the configurator.
      if ((others.count ?? 0) === 0) {
        return { status: "error", message: CATALOG_MESSAGES.lastModel, fieldErrors: { active: CATALOG_MESSAGES.lastModel } };
      }
    }

    // A ticked family must be one the table holds: the form only shows those, so
    // anything else is a tampered post, refused like an empty choice.
    const known = await supabase.from("material_families").select("id");
    if (known.error) throw new Error(`material_families: ${known.error.message}`);
    const familyIds = new Set(known.data.map((row) => row.id));
    if (families.some((familyId) => !familyIds.has(familyId))) {
      return { status: "error", message: ADMIN_MESSAGES.invalid, fieldErrors: { families: CATALOG_MESSAGES.noFamily } };
    }

    const updated = await supabase
      .from("models")
      .update({ name, note, description, active, sort })
      .eq("id", id)
      .select("id");
    if (updated.error) throw new Error(`models: ${updated.error.message}`);
    // RLS does not refuse an update it filters out: without the admin role the
    // statement touches 0 rows and comes back without an error.
    if (!updated.data || updated.data.length !== 1) return { status: "error", message: ADMIN_MESSAGES.forbidden };

    // The rules are replaced without ever leaving the model with none: the ticked pairs
    // go in first, then the pairs that were not ticked go. A failure between the two
    // leaves the old rules in place, never zero. The upsert merges (not "ignore
    // duplicates", whose DO NOTHING would not return a pair that was already there and
    // the count below could not tell a missing role from an unchanged rule).
    const pairs = families.map((familyId) => ({ model_id: id, family_id: familyId }));
    const kept = await supabase
      .from("model_families")
      .upsert(pairs, { onConflict: "model_id,family_id" })
      .select("model_id");
    if (kept.error) throw new Error(`model_families upsert: ${kept.error.message}`);
    if (!kept.data || kept.data.length !== pairs.length) return { status: "error", message: ADMIN_MESSAGES.forbidden };
    // The ids match CATALOG_ROW_ID and were checked against material_families above, so the list is safe.
    const removed = await supabase
      .from("model_families")
      .delete()
      .eq("model_id", id)
      .not("family_id", "in", `(${families.join(",")})`);
    if (removed.error) throw new Error(`model_families delete: ${removed.error.message}`);
  } catch (err) {
    console.error("saveModel", err);
    return { status: "error", message: ADMIN_MESSAGES.generic };
  }

  updateTag("catalog");
  return { status: "ok", message: ADMIN_MESSAGES.saved };
}
