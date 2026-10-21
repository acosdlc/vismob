import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import {
  ProjectForm,
  type ProjectFormBase,
  type ProjectFormFamily,
  type ProjectFormMaterial,
  type ProjectFormModel,
} from "@/components/admin/ProjectForm";
import { AdminPage, Notice } from "@/components/admin/ui";
import { ADMIN_MESSAGES } from "@/lib/admin/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Proiect nou" };

/** Shown in place of the form when the catalogue cannot be read: without a model nothing can be created. */
const READ_FAILED = "Nu am putut citi catalogul. Reîncarcă pagina.";

interface ProjectLists {
  models: ProjectFormModel[];
  materials: ProjectFormMaterial[];
  families: ProjectFormFamily[];
  bases: ProjectFormBase[];
}

type ListsRead = { ok: true; lists: ProjectLists } | { ok: false; problem: string };

// PLAN PR-9 „Lucrări”: the empty form. Only the selects' options are read (through the
// signed-in user's cookie client, ARHITECTURA §8), every row, inactive ones included: a
// project may reference a material the configurator no longer offers. The slug is chosen
// by the Server Action, which then redirects to the new project's screen, where the photos
// are added. The (panel) layout wraps this page in the guard's <Suspense>, so cookies()
// may be read at the top level.
export default async function ProiectNouPage() {
  const read = await readLists();

  return (
    <AdminPage title="Proiect nou" lead="Pozele se adaugă după ce salvezi proiectul.">
      {read.ok ? <ProjectForm project={null} {...read.lists} /> : <Notice tone="error">{read.problem}</Notice>}
    </AdminPage>
  );
}

function unwrap<T>(result: { data: T[] | null; error: { message: string } | null }, table: string): T[] {
  if (result.error) throw new Error(`${table}: ${result.error.message}`);
  return result.data ?? [];
}

async function readLists(): Promise<ListsRead> {
  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    unstable_rethrow(err);
    console.error("ProiectNouPage: createClient", err);
    return { ok: false, problem: ADMIN_MESSAGES.unavailable };
  }

  try {
    const [models, materials, families, bases] = await Promise.all([
      supabase.from("models").select("id, name").order("sort").order("id"),
      supabase.from("materials").select("id, name, family_id").order("sort").order("id"),
      supabase.from("material_families").select("id, name").order("sort").order("id"),
      supabase.from("bases").select("id, name").order("sort").order("id"),
    ]);
    const lists: ProjectLists = {
      models: unwrap(models, "models"),
      materials: unwrap(materials, "materials"),
      families: unwrap(families, "material_families"),
      bases: unwrap(bases, "bases"),
    };
    if (lists.models.length === 0) throw new Error("models is empty");
    return { ok: true, lists };
  } catch (err) {
    unstable_rethrow(err);
    console.error("ProiectNouPage: catalog", err);
    return { ok: false, problem: READ_FAILED };
  }
}
