import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { ReviewForm, type ReviewFormReview } from "@/components/admin/ReviewForm";
import { AdminPage, Notice } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { reviewLabel } from "@/lib/admin/reviews";
import { ADMIN_MESSAGES } from "@/lib/admin/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Recenzie" };

/** A Postgres uuid, in any version: anything else is not a review and gets the 404 without a query. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shown over the screen when the review cannot be read. */
const READ_FAILED = "Nu am putut citi recenziile. Reîncarcă pagina.";

/** The query-string flag saveReview redirects here with after a create. */
const CREATED_FLAG = "creat";

/** The columns the form edits. */
const REVIEW_COLUMNS = "id, first_name, city, body, model_label, source, consent, published, sort";

type ReviewRead = { kind: "found"; review: ReviewFormReview } | { kind: "missing" } | { kind: "failed"; problem: string };

// PLAN PR-9 „Recenzii”, the edit screen: the row through the signed-in user's cookie
// client (ARHITECTURA §8), so an unpublished review opens too. The (panel) layout's
// <Suspense> guard lets params, searchParams and cookies() be read at the top level.
export default async function RecenziePage({ params, searchParams }: PageProps<"/admin/recenzii/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();

  const read = await readReview(id);
  if (read.kind === "missing") notFound();
  if (read.kind === "failed") {
    return (
      <AdminPage title="Recenzie">
        <Notice tone="error">{read.problem}</Notice>
      </AdminPage>
    );
  }

  return (
    <AdminPage
      title={reviewLabel(read.review)}
      actions={
        <Button variant="link" href="/admin/recenzii">
          Înapoi la recenzii
        </Button>
      }
    >
      {sp[CREATED_FLAG] === "1" && <Notice tone="ok">{ADMIN_MESSAGES.created}</Notice>}
      <ReviewForm review={read.review} />
    </AdminPage>
  );
}

async function readReview(id: string): Promise<ReviewRead> {
  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    unstable_rethrow(err);
    console.error("RecenziePage: createClient", err);
    return { kind: "failed", problem: ADMIN_MESSAGES.unavailable };
  }

  try {
    const { data, error } = await supabase.from("reviews").select(REVIEW_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw new Error(`reviews: ${error.message}`);
    if (!data) return { kind: "missing" };
    return { kind: "found", review: data };
  } catch (err) {
    unstable_rethrow(err);
    console.error(`RecenziePage: review ${id}`, err);
    return { kind: "failed", problem: READ_FAILED };
  }
}
