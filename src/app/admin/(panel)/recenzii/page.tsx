import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { AdminPage, EmptyState, Notice, Table, TableWrap, Tag, Td, Th } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { reviewExcerpt, reviewLabel, reviewSourceLabel } from "@/lib/admin/reviews";
import { ADMIN_MESSAGES } from "@/lib/admin/types";
import type { Tables } from "@/lib/supabase/database.types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Recenzii" };

/** Shown in place of the table when the query fails. */
const READ_FAILED = "Nu am putut citi recenziile. Reîncarcă pagina.";

/** The query-string flag the delete redirects here with. */
const DELETED_FLAG = "sters";

const LINK = "inline-flex min-h-11 items-center underline hover:text-accent";

type ReviewRow = Pick<Tables<"reviews">, "id" | "first_name" | "city" | "body" | "model_label" | "source" | "consent" | "published" | "sort">;

type ReviewsRead = { ok: true; reviews: ReviewRow[] } | { ok: false; problem: string };

// PLAN PR-9 „Recenzii”: every review, published or not, read through the signed-in
// user's cookie client (ARHITECTURA §8; the public_read policy would hide the
// unpublished ones). Each row links to its edit screen; the one action here is to
// add a review. The (panel) layout wraps this page in the guard's <Suspense>, so
// searchParams and cookies() may be read at the top level.
export default async function RecenziiPage({ searchParams }: PageProps<"/admin/recenzii">) {
  const sp = await searchParams;
  const deleted = sp[DELETED_FLAG] === "1";
  const read = await readReviews();

  return (
    <AdminPage
      title="Recenzii"
      lead="Doar recenzii reale, cu acordul scris al clientului. Pe site apar cele publicate."
      actions={<Button href="/admin/recenzii/nou">Adaugă recenzie</Button>}
    >
      {deleted && <Notice tone="ok">{ADMIN_MESSAGES.removed}</Notice>}
      {read.ok ? <ReviewsTable reviews={read.reviews} /> : <Notice tone="error">{read.problem}</Notice>}
    </AdminPage>
  );
}

async function readReviews(): Promise<ReviewsRead> {
  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    unstable_rethrow(err);
    console.error("RecenziiPage: createClient", err);
    return { ok: false, problem: ADMIN_MESSAGES.unavailable };
  }

  try {
    const { data, error } = await supabase
      .from("reviews")
      .select("id, first_name, city, body, model_label, source, consent, published, sort")
      .order("sort")
      .order("id");
    if (error) throw new Error(`reviews: ${error.message}`);
    return { ok: true, reviews: data ?? [] };
  } catch (err) {
    unstable_rethrow(err);
    console.error("RecenziiPage: reviews", err);
    return { ok: false, problem: READ_FAILED };
  }
}

function ReviewsTable({ reviews }: { reviews: ReviewRow[] }) {
  if (reviews.length === 0) return <EmptyState>Nicio recenzie încă. Adaugă prima.</EmptyState>;
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>Client</Th>
            <Th>Recenzia</Th>
            <Th>Model</Th>
            <Th>Sursă</Th>
            <Th>Stare</Th>
            <Th>Ordine</Th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((review) => (
            <tr key={review.id} className="[&>td]:align-middle">
              <Td className="whitespace-nowrap">
                <Link href={`/admin/recenzii/${review.id}`} className={`${LINK} font-semibold`}>
                  {reviewLabel(review)}
                </Link>
              </Td>
              <Td className="text-ink-2">{reviewExcerpt(review.body)}</Td>
              <Td className="whitespace-nowrap">{review.model_label || "—"}</Td>
              <Td className="whitespace-nowrap">{reviewSourceLabel(review.source)}</Td>
              <Td>
                <span className="flex flex-wrap gap-2">
                  {review.published ? <Tag tone="accent">Publicată</Tag> : <Tag tone="muted">Nepublicată</Tag>}
                  {!review.consent && <Tag tone="muted">Fără acord</Tag>}
                </span>
              </Td>
              <Td className="mono-13">{review.sort}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}
