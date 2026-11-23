"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import {
  MATERIAL_MESSAGES,
  materialIdFor,
  nextMaterialCode,
  nextMaterialSort,
  parseMaterialForm,
  sortLeftBlank,
  type MaterialInput,
} from "@/lib/admin/materials";
import { photoChange, removeMediaObject } from "@/lib/admin/media";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

/** Where a freshly created material opens, with the „Adăugat.” notice. */
const materialPath = (id: string) => `/admin/catalog/materiale/${id}?creat=1`;

type Outcome = { kind: "created"; id: string } | { kind: "updated" } | { kind: "failed"; state: AdminActionState };

const failed = (state: AdminActionState): Outcome => ({ kind: "failed", state });

/**
 * „Salvează” on /admin/catalog/materiale/nou and /admin/catalog/materiale/[id], for
 * `useActionState` (PLAN PR-8 „Materiale”). Re-checks the admin role, validates the
 * whole form, reads the PhotoField's hidden inputs, then writes through the signed-in
 * user's cookie client (RLS: `admin_all`). A new material (hidden `id` empty) gets its
 * id and its code from the family, comes last in the family when „Ordine” was left
 * empty, and lands on its own screen; an existing one keeps its family and its code
 * whatever the form posts, is refused with an emptied „Ordine”, and cannot be the last
 * active colour of its family (catalogFromRows() would drop the family and the models
 * that allow only it). A successful write expires the "catalog" tag, so the site reads
 * the new rows on its next request (ARHITECTURA §8), and the "projects" tag with it: the
 * project captions and the hero ticket are cached under that one with the colour's
 * name, for a day (src/lib/data/projects.ts).
 */
export async function saveMaterial(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await getAdminSession();
  if (!admin) return { status: "error", message: ADMIN_MESSAGES.forbidden };

  const posted = formData.get("id");
  const materialId = typeof posted === "string" ? posted.trim() : "";

  const parsed = parseMaterialForm(formData);
  // An existing colour needs its „Ordine”. The schema reads an emptied box as 0, and a 0
  // ties with the family's first colour and can take its place (the id decides), under
  // „Salvat.” and with the box still empty. Only a new colour may leave it empty, to come
  // last (createMaterial). Answered with the schema's own errors, so one answer marks
  // every field.
  const sortMissing = materialId !== "" && sortLeftBlank(formData);
  if (!parsed.ok || sortMissing) {
    return {
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { ...(parsed.ok ? {} : parsed.fieldErrors), ...(sortMissing ? { sort: ADMIN_MESSAGES.required } : {}) },
    };
  }

  const change = photoChange(formData, "materials");
  if (!change.ok) {
    return { status: "error", message: ADMIN_MESSAGES.invalid, fieldErrors: { photo_path: ADMIN_MESSAGES.invalid } };
  }

  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error("saveMaterial: createClient", err);
    return { status: "error", message: ADMIN_MESSAGES.unavailable };
  }

  let outcome: Outcome;
  try {
    outcome =
      materialId === ""
        ? await createMaterial(supabase, parsed.data, change.path, sortLeftBlank(formData))
        : await updateMaterial(supabase, materialId, parsed.data, change.path, change.remove);
  } catch (err) {
    console.error("saveMaterial", err);
    return { status: "error", message: ADMIN_MESSAGES.generic };
  }
  if (outcome.kind === "failed") return outcome.state;

  updateTag("catalog");
  updateTag("projects");
  // redirect() throws to perform the navigation, so it stays outside the try.
  if (outcome.kind === "created") redirect(materialPath(outcome.id));
  // The edit screen re-reads the row in the action's own response: the title and the
  // photo field's "before" path follow the saved values (server-actions.md, refresh).
  refresh();
  return { status: "ok", message: ADMIN_MESSAGES.saved };
}

async function createMaterial(
  supabase: ServerClient,
  input: MaterialInput,
  photoPath: string | null,
  sortBlank: boolean,
): Promise<Outcome> {
  const family = await supabase.from("material_families").select("id, code").eq("id", input.family_id).maybeSingle();
  if (family.error) {
    console.error(`saveMaterial: material_families: ${family.error.message}`);
    return failed({ status: "error", message: ADMIN_MESSAGES.generic });
  }
  if (!family.data) {
    return failed({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { family_id: MATERIAL_MESSAGES.familyUnknown },
    });
  }

  // Every material, not only the family's: the id is the table's primary key and the
  // code is unique across families, so both are chosen against the whole table. The
  // same read gives the family's last order (inactive colours included).
  const existing = await supabase.from("materials").select("id, code, family_id, sort");
  if (existing.error) {
    console.error(`saveMaterial: materials: ${existing.error.message}`);
    return failed({ status: "error", message: ADMIN_MESSAGES.generic });
  }
  const id = materialIdFor(
    family.data.code,
    input.name,
    existing.data.map((row) => row.id),
  );
  const code = nextMaterialCode(
    family.data.code,
    existing.data.map((row) => row.code),
  );
  // „Ordine” left empty means last in the family; a typed number, 0 included, is kept.
  // The schema has already turned the empty value into 0, hence the flag.
  const familyId = family.data.id;
  const sort = sortBlank
    ? nextMaterialSort(existing.data.filter((row) => row.family_id === familyId).map((row) => row.sort))
    : input.sort;

  const { data, error } = await supabase
    .from("materials")
    .insert({
      id,
      family_id: familyId,
      name: input.name,
      code,
      hex: input.hex,
      supplier: input.supplier,
      supplier_code: input.supplier_code,
      price_category: input.price_category,
      photo_path: photoPath,
      featured: input.featured,
      active: input.active,
      sort,
    })
    .select("id");
  if (error) {
    console.error(`saveMaterial: insert: ${error.message}`);
    return failed({ status: "error", message: ADMIN_MESSAGES.generic });
  }
  // RLS does not refuse an insert it filters out: without the admin role the statement
  // writes 0 rows and comes back without an error.
  if (!data || data.length !== 1) return failed({ status: "error", message: ADMIN_MESSAGES.forbidden });
  return { kind: "created", id };
}

async function updateMaterial(
  supabase: ServerClient,
  id: string,
  input: MaterialInput,
  photoPath: string | null,
  removePath: string | null,
): Promise<Outcome> {
  const row = await supabase.from("materials").select("id, family_id, code, active").eq("id", id).maybeSingle();
  if (row.error) {
    console.error(`saveMaterial: materials ${id}: ${row.error.message}`);
    return failed({ status: "error", message: ADMIN_MESSAGES.generic });
  }
  if (!row.data) return failed({ status: "error", message: ADMIN_MESSAGES.notFound });

  if (row.data.active && !input.active) {
    const others = await supabase
      .from("materials")
      .select("id", { count: "exact", head: true })
      .eq("family_id", row.data.family_id)
      .eq("active", true)
      .neq("id", id);
    if (others.error) {
      console.error(`saveMaterial: counting the family's colours: ${others.error.message}`);
      return failed({ status: "error", message: ADMIN_MESSAGES.generic });
    }
    if ((others.count ?? 0) === 0) {
      return failed({ status: "error", message: MATERIAL_MESSAGES.lastColor, fieldErrors: { active: MATERIAL_MESSAGES.lastColor } });
    }
  }

  // The family and the code are not in the payload: they never change after creation.
  const { data, error } = await supabase
    .from("materials")
    .update({
      name: input.name,
      hex: input.hex,
      supplier: input.supplier,
      supplier_code: input.supplier_code,
      price_category: input.price_category,
      photo_path: photoPath,
      featured: input.featured,
      active: input.active,
      sort: input.sort,
    })
    .eq("id", id)
    .select("id");
  if (error) {
    console.error(`saveMaterial: update ${id}: ${error.message}`);
    return failed({ status: "error", message: ADMIN_MESSAGES.generic });
  }
  // RLS filters silently: 0 rows means no admin role (the row was just read, so it exists).
  if (!data || data.length !== 1) return failed({ status: "error", message: ADMIN_MESSAGES.forbidden });

  // The replaced photo goes only once the row points elsewhere; a failure is logged, never fatal.
  await removeMediaObject(supabase.storage, removePath);
  return { kind: "updated" };
}
