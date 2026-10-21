"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin/auth";
import { MATERIAL_MESSAGES } from "@/lib/admin/materials";
import { removeMediaObject } from "@/lib/admin/media";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

/** Where the admin lands once the material is gone, with the „Șters.” notice. */
const CATALOG_PATH = "/admin/catalog?sters=1";

const idSchema = z.string().trim().min(1);

type Outcome = { ok: true } | { ok: false; state: AdminActionState };

const refused = (message: string): Outcome => ({ ok: false, state: { status: "error", message } });

/**
 * „Șterge materialul” on /admin/catalog/materiale/[id], for `useActionState` (PLAN
 * PR-8). Re-checks the admin role, then refuses the delete when something still
 * depends on the row: a project that shows it (ARHITECTURA §8 „Două limite”), a
 * request whose configuration code carries its material code (`CAP-160x200-CT01-…`),
 * or its family, which would be left without an active colour (catalogFromRows() then
 * drops the family). Otherwise it removes the row, then the photo, through the
 * signed-in user's cookie client (RLS: `admin_all`, `admin_all_media`), expires the
 * "catalog" tag and redirects to the overview; only an error ever comes back as state.
 * The code of a deleted material is never reused (nextMaterialCode()).
 */
export async function deleteMaterial(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await getAdminSession();
  if (!admin) return { status: "error", message: ADMIN_MESSAGES.forbidden };

  const parsed = idSchema.safeParse(formData.get("id"));
  if (!parsed.success) return { status: "error", message: ADMIN_MESSAGES.invalid };
  const id = parsed.data;

  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error("deleteMaterial: createClient", err);
    return { status: "error", message: ADMIN_MESSAGES.unavailable };
  }

  let outcome: Outcome;
  try {
    outcome = await removeMaterial(supabase, id);
  } catch (err) {
    console.error("deleteMaterial", err);
    return { status: "error", message: ADMIN_MESSAGES.generic };
  }
  if (!outcome.ok) return outcome.state;

  updateTag("catalog");
  // redirect() throws to perform the navigation, so it stays outside the try.
  redirect(CATALOG_PATH);
}

async function removeMaterial(supabase: ServerClient, id: string): Promise<Outcome> {
  const row = await supabase.from("materials").select("id, family_id, code, active, photo_path").eq("id", id).maybeSingle();
  if (row.error) throw new Error(`materials ${id}: ${row.error.message}`);
  if (!row.data) return refused(ADMIN_MESSAGES.notFound);

  const projects = await supabase.from("projects").select("id", { count: "exact", head: true }).eq("material_id", id);
  if (projects.error) throw new Error(`projects: ${projects.error.message}`);
  if ((projects.count ?? 0) > 0) return refused(MATERIAL_MESSAGES.inProject);

  // The configuration code (configCode(), DESIGN §5.7) frames the material code with dashes.
  const leads = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .ilike("config_code", `%-${row.data.code}-%`);
  if (leads.error) throw new Error(`leads: ${leads.error.message}`);
  if ((leads.count ?? 0) > 0) return refused(MATERIAL_MESSAGES.inLead);

  if (row.data.active) {
    const others = await supabase
      .from("materials")
      .select("id", { count: "exact", head: true })
      .eq("family_id", row.data.family_id)
      .eq("active", true)
      .neq("id", id);
    if (others.error) throw new Error(`materials of ${row.data.family_id}: ${others.error.message}`);
    if ((others.count ?? 0) === 0) return refused(MATERIAL_MESSAGES.lastColor);
  }

  const { data, error } = await supabase.from("materials").delete().eq("id", id).select("id");
  if (error) {
    console.error(`deleteMaterial: ${error.message}`);
    return refused(ADMIN_MESSAGES.generic);
  }
  // RLS filters silently: 0 rows means no admin role or a material already gone.
  if (!data || data.length !== 1) return refused(ADMIN_MESSAGES.forbidden);

  // The photo goes once the row is gone; a failure is logged, never fatal.
  await removeMediaObject(supabase.storage, row.data.photo_path);
  return { ok: true };
}
