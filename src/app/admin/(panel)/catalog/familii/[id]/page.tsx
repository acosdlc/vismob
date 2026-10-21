import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { FamilyForm, type FamilyFormProps } from "@/components/admin/FamilyForm";
import { AdminPage, Notice } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { CATALOG_READ_FAILED, CATALOG_ROW_ID, specsFromJson } from "@/lib/admin/catalog-schemas";
import { ADMIN_MESSAGES } from "@/lib/admin/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Familie de materiale" };

type FamilyRead =
  | { kind: "found"; family: FamilyFormProps["family"] }
  | { kind: "missing" }
  | { kind: "failed"; problem: string };

// PLAN PR-8 „Familii”: the edit screen of one material family (name, description,
// specification rows). The row is read through the signed-in user's cookie client
// (ARHITECTURA §8); the (panel) layout's <Suspense> guard lets params and cookies()
// be read at the top level. The code and the tab are shown, never edited.
export default async function FamilyPage({ params }: PageProps<"/admin/catalog/familii/[id]">) {
  const { id } = await params;
  if (!CATALOG_ROW_ID.test(id)) notFound();

  const read = await readFamily(id);
  if (read.kind === "missing") notFound();
  if (read.kind === "failed") {
    return (
      <AdminPage title="Familie de materiale">
        <Notice tone="error">{read.problem}</Notice>
      </AdminPage>
    );
  }

  const { family } = read;
  return (
    <AdminPage
      title={family.name}
      lead={`Familie · ${family.code}`}
      actions={
        <Button href="/admin/catalog" variant="link">
          Înapoi la catalog
        </Button>
      }
    >
      <FamilyForm family={family} />
    </AdminPage>
  );
}

async function readFamily(id: string): Promise<FamilyRead> {
  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    unstable_rethrow(err);
    console.error("FamilyPage: createClient", err);
    return { kind: "failed", problem: ADMIN_MESSAGES.unavailable };
  }

  try {
    const { data, error } = await supabase
      .from("material_families")
      .select("id, name, code, tab, description, specs")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`material_families: ${error.message}`);
    if (!data) return { kind: "missing" };
    const { specs, ...rest } = data;
    return { kind: "found", family: { ...rest, specs: specsFromJson(specs) } };
  } catch (err) {
    unstable_rethrow(err);
    console.error(`FamilyPage: family ${id}`, err);
    return { kind: "failed", problem: CATALOG_READ_FAILED };
  }
}
