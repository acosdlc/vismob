import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { ModelForm, type ModelFormProps } from "@/components/admin/ModelForm";
import { AdminPage, Notice } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { CATALOG_READ_FAILED, CATALOG_ROW_ID } from "@/lib/admin/catalog-schemas";
import { ADMIN_MESSAGES } from "@/lib/admin/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Model" };

type ModelRead =
  | { kind: "found"; model: ModelFormProps["model"]; families: ModelFormProps["families"]; selected: string[] }
  | { kind: "missing" }
  | { kind: "failed"; problem: string };

// PLAN PR-8 „Modele”: the edit screen of one model (texts, `active`, the model ↔
// family rules). Everything is read through the signed-in user's cookie client
// (ARHITECTURA §8), so an inactive model is found too; the (panel) layout's
// <Suspense> guard lets params and cookies() be read at the top level.
export default async function ModelPage({ params }: PageProps<"/admin/catalog/modele/[id]">) {
  const { id } = await params;
  if (!CATALOG_ROW_ID.test(id)) notFound();

  const read = await readModel(id);
  if (read.kind === "missing") notFound();
  if (read.kind === "failed") {
    return (
      <AdminPage title="Model">
        <Notice tone="error">{read.problem}</Notice>
      </AdminPage>
    );
  }

  const { model, families, selected } = read;
  return (
    <AdminPage
      title={model.name}
      lead={`Model · ${model.code}`}
      actions={
        <Button href="/admin/catalog" variant="link">
          Înapoi la catalog
        </Button>
      }
    >
      <ModelForm model={model} families={families} selected={selected} />
    </AdminPage>
  );
}

async function readModel(id: string): Promise<ModelRead> {
  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    unstable_rethrow(err);
    console.error("ModelPage: createClient", err);
    return { kind: "failed", problem: ADMIN_MESSAGES.unavailable };
  }

  try {
    const [model, families, rules] = await Promise.all([
      supabase.from("models").select("id, name, note, code, description, active, sort").eq("id", id).maybeSingle(),
      supabase.from("material_families").select("id, name, code").order("sort").order("id"),
      supabase.from("model_families").select("family_id").eq("model_id", id),
    ]);
    if (model.error) throw new Error(`models: ${model.error.message}`);
    if (!model.data) return { kind: "missing" };
    if (families.error) throw new Error(`material_families: ${families.error.message}`);
    if (rules.error) throw new Error(`model_families: ${rules.error.message}`);
    return { kind: "found", model: model.data, families: families.data, selected: rules.data.map((row) => row.family_id) };
  } catch (err) {
    unstable_rethrow(err);
    console.error(`ModelPage: model ${id}`, err);
    return { kind: "failed", problem: CATALOG_READ_FAILED };
  }
}
