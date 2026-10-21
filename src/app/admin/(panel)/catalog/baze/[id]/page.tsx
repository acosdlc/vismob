import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { BaseForm, type BaseFormProps } from "@/components/admin/BaseForm";
import { AdminPage, Notice } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { CATALOG_READ_FAILED, CATALOG_ROW_ID } from "@/lib/admin/catalog-schemas";
import { ADMIN_MESSAGES } from "@/lib/admin/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bază" };

type BaseRead = { kind: "found"; base: BaseFormProps["base"] } | { kind: "missing" } | { kind: "failed"; problem: string };

// PLAN PR-8 „Baze”: the edit screen of one base (name, note, photo, `active`). The
// row is read through the signed-in user's cookie client (ARHITECTURA §8), so an
// inactive base is found too; the (panel) layout's <Suspense> guard lets params and
// cookies() be read at the top level.
export default async function BasePage({ params }: PageProps<"/admin/catalog/baze/[id]">) {
  const { id } = await params;
  if (!CATALOG_ROW_ID.test(id)) notFound();

  const read = await readBase(id);
  if (read.kind === "missing") notFound();
  if (read.kind === "failed") {
    return (
      <AdminPage title="Bază">
        <Notice tone="error">{read.problem}</Notice>
      </AdminPage>
    );
  }

  const { base } = read;
  return (
    <AdminPage
      title={base.name}
      lead={`Bază · ${base.code}`}
      actions={
        <Button href="/admin/catalog" variant="link">
          Înapoi la catalog
        </Button>
      }
    >
      <BaseForm base={base} />
    </AdminPage>
  );
}

async function readBase(id: string): Promise<BaseRead> {
  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    unstable_rethrow(err);
    console.error("BasePage: createClient", err);
    return { kind: "failed", problem: ADMIN_MESSAGES.unavailable };
  }

  try {
    const { data, error } = await supabase
      .from("bases")
      .select("id, name, note, code, photo_path, active, sort")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`bases: ${error.message}`);
    if (!data) return { kind: "missing" };
    return { kind: "found", base: data };
  } catch (err) {
    unstable_rethrow(err);
    console.error(`BasePage: base ${id}`, err);
    return { kind: "failed", problem: CATALOG_READ_FAILED };
  }
}
