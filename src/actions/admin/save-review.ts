"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin/auth";
import { canPublish, parseReviewForm, REVIEW_MESSAGES, type ReviewInput } from "@/lib/admin/reviews";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

/** Where a freshly created review opens, with the „Adăugat.” notice. */
const reviewPath = (id: string) => `/admin/recenzii/${id}?creat=1`;

/** The hidden `id` of an existing review: the table's uuid primary key. */
const idSchema = z.uuid();

type Outcome = { kind: "created"; id: string } | { kind: "updated" } | { kind: "failed"; state: AdminActionState };

const failed = (state: AdminActionState): Outcome => ({ kind: "failed", state });

/**
 * „Salvează” on /admin/recenzii/nou and /admin/recenzii/[id], for `useActionState`
 * (PLAN PR-9 „Recenzii”). Re-checks the admin role, validates the whole form, refuses
 * to publish a review without the client's written consent (before any write), then
 * writes through the signed-in user's cookie client (RLS: `admin_all`). A new review
 * (hidden `id` empty) lands on its own screen; an existing one is re-read in the
 * action's own response. A successful write expires the "reviews" tag, so Acasă shows
 * the change on its next request (ARHITECTURA §8).
 */
export async function saveReview(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await getAdminSession();
  if (!admin) return { status: "error", message: ADMIN_MESSAGES.forbidden };

  const posted = formData.get("id");
  const reviewId = typeof posted === "string" ? posted.trim() : "";
  // The edit screen only opens for a uuid, so anything else here is not a review.
  if (reviewId !== "" && !idSchema.safeParse(reviewId).success) return { status: "error", message: ADMIN_MESSAGES.notFound };

  const parsed = parseReviewForm(formData);
  if (!parsed.ok) return { status: "error", message: ADMIN_MESSAGES.invalid, fieldErrors: parsed.fieldErrors };
  if (!canPublish(parsed.data)) {
    return { status: "error", message: REVIEW_MESSAGES.consent, fieldErrors: { published: REVIEW_MESSAGES.consent } };
  }

  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error("saveReview: createClient", err);
    return { status: "error", message: ADMIN_MESSAGES.unavailable };
  }

  let outcome: Outcome;
  try {
    outcome = reviewId === "" ? await createReview(supabase, parsed.data) : await updateReview(supabase, reviewId, parsed.data);
  } catch (err) {
    console.error("saveReview", err);
    return { status: "error", message: ADMIN_MESSAGES.generic };
  }
  if (outcome.kind === "failed") return outcome.state;

  updateTag("reviews");
  // redirect() throws to perform the navigation, so it stays outside the try.
  if (outcome.kind === "created") redirect(reviewPath(outcome.id));
  // The edit screen re-reads the row in the action's own response, so its title
  // follows the saved name and city (server-actions.md, refresh).
  refresh();
  return { status: "ok", message: ADMIN_MESSAGES.saved };
}

/** The columns the form edits, as the insert and the update write them. */
function columns(input: ReviewInput) {
  return {
    first_name: input.first_name,
    city: input.city,
    body: input.body,
    model_label: input.model_label,
    source: input.source,
    consent: input.consent,
    published: input.published,
    sort: input.sort,
  };
}

async function createReview(supabase: ServerClient, input: ReviewInput): Promise<Outcome> {
  const { data, error } = await supabase.from("reviews").insert(columns(input)).select("id");
  if (error) {
    console.error(`saveReview: insert: ${error.message}`);
    return failed({ status: "error", message: ADMIN_MESSAGES.generic });
  }
  // RLS does not refuse an insert it filters out: without the admin role the statement
  // writes 0 rows and comes back without an error.
  if (!data || data.length !== 1) return failed({ status: "error", message: ADMIN_MESSAGES.forbidden });
  return { kind: "created", id: data[0].id };
}

async function updateReview(supabase: ServerClient, id: string, input: ReviewInput): Promise<Outcome> {
  const row = await supabase.from("reviews").select("id").eq("id", id).maybeSingle();
  if (row.error) {
    console.error(`saveReview: reviews ${id}: ${row.error.message}`);
    return failed({ status: "error", message: ADMIN_MESSAGES.generic });
  }
  if (!row.data) return failed({ status: "error", message: ADMIN_MESSAGES.notFound });

  const { data, error } = await supabase.from("reviews").update(columns(input)).eq("id", id).select("id");
  if (error) {
    console.error(`saveReview: update ${id}: ${error.message}`);
    return failed({ status: "error", message: ADMIN_MESSAGES.generic });
  }
  // RLS filters silently: 0 rows means no admin role (the row was just read, so it exists).
  if (!data || data.length !== 1) return failed({ status: "error", message: ADMIN_MESSAGES.forbidden });
  return { kind: "updated" };
}
