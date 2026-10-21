import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { MaterialForm, type MaterialFormFamily } from "@/components/admin/MaterialForm";
import { AdminPage, Notice } from "@/components/admin/ui";
import { ADMIN_MESSAGES } from "@/lib/admin/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Material nou" };

/** Shown in place of the form when the families cannot be read: without them nothing can be created. */
const READ_FAILED = "Nu am putut citi catalogul. Reîncarcă pagina.";

type FamiliesRead = { ok: true; families: MaterialFormFamily[] } | { ok: false; problem: string };

// PLAN PR-8 „Materiale”: the empty form. Only the families are read (through the
// signed-in user's cookie client, ARHITECTURA §8); the id and the code are chosen
// by the Server Action, which then redirects to the new material's screen. The
// (panel) layout wraps this page in the guard's <Suspense>, so cookies() may be
// read at the top level.
export default async function MaterialNouPage() {
  const read = await readFamilies();

  return (
    <AdminPage title="Material nou" lead="Codul se alocă automat din familie și nu se refolosește.">
      {read.ok ? <MaterialForm material={null} families={read.families} /> : <Notice tone="error">{read.problem}</Notice>}
    </AdminPage>
  );
}

async function readFamilies(): Promise<FamiliesRead> {
  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    unstable_rethrow(err);
    console.error("MaterialNouPage: createClient", err);
    return { ok: false, problem: ADMIN_MESSAGES.unavailable };
  }

  try {
    const { data, error } = await supabase.from("material_families").select("id, name, code").order("sort").order("id");
    if (error) throw new Error(error.message);
    if (data.length === 0) throw new Error("material_families is empty");
    return { ok: true, families: data };
  } catch (err) {
    unstable_rethrow(err);
    console.error("MaterialNouPage: material_families", err);
    return { ok: false, problem: READ_FAILED };
  }
}
