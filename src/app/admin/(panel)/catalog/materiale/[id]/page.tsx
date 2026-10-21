import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { MaterialForm, type MaterialFormFamily, type MaterialFormMaterial } from "@/components/admin/MaterialForm";
import { AdminPage, Notice } from "@/components/admin/ui";
import { ADMIN_MESSAGES } from "@/lib/admin/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Material" };

/** Shown over the screen when the material cannot be read. */
const READ_FAILED = "Nu am putut citi catalogul. Reîncarcă pagina.";

/** The query-string flag saveMaterial redirects here with after a create. */
const CREATED_FLAG = "creat";

/** The columns the form edits. */
const MATERIAL_COLUMNS = "id, family_id, name, code, hex, supplier, supplier_code, price_category, photo_path, featured, active, sort";

/** A material id as materialIdFor() builds it; anything else is not a material and gets the 404 without a query. */
/** Ids come from materialIdFor() or, for a row written by SQL, any text key: only the length is bounded. */
const MATERIAL_ID_MAX = 80;

type MaterialRead =
  | { kind: "found"; material: MaterialFormMaterial; families: MaterialFormFamily[] }
  | { kind: "missing" }
  | { kind: "failed"; problem: string };

// PLAN PR-8 „Materiale”, the edit screen: the row and the families through the
// signed-in user's cookie client (ARHITECTURA §8), so an inactive material opens
// too. The (panel) layout's <Suspense> guard lets params, searchParams and cookies()
// be read at the top level.
export default async function MaterialPage({ params, searchParams }: PageProps<"/admin/catalog/materiale/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (id.length === 0 || id.length > MATERIAL_ID_MAX) notFound();

  const read = await readMaterial(id);
  if (read.kind === "missing") notFound();
  if (read.kind === "failed") {
    return (
      <AdminPage title="Material">
        <Notice tone="error">{read.problem}</Notice>
      </AdminPage>
    );
  }

  const { material, families } = read;
  const family = families.find((row) => row.id === material.family_id);

  return (
    <AdminPage title={material.name} lead={`${family?.name ?? material.family_id} · ${material.code}`}>
      {sp[CREATED_FLAG] === "1" && <Notice tone="ok">{ADMIN_MESSAGES.created}</Notice>}
      <MaterialForm material={material} families={families} />
    </AdminPage>
  );
}

async function readMaterial(id: string): Promise<MaterialRead> {
  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    unstable_rethrow(err);
    console.error("MaterialPage: createClient", err);
    return { kind: "failed", problem: ADMIN_MESSAGES.unavailable };
  }

  try {
    const [material, families] = await Promise.all([
      supabase.from("materials").select(MATERIAL_COLUMNS).eq("id", id).maybeSingle(),
      supabase.from("material_families").select("id, name, code").order("sort").order("id"),
    ]);
    if (material.error) throw new Error(`materials: ${material.error.message}`);
    if (!material.data) return { kind: "missing" };
    if (families.error) throw new Error(`material_families: ${families.error.message}`);
    return { kind: "found", material: material.data, families: families.data };
  } catch (err) {
    unstable_rethrow(err);
    console.error(`MaterialPage: material ${id}`, err);
    return { kind: "failed", problem: READ_FAILED };
  }
}
