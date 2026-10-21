import { cacheLife, cacheTag } from "next/cache";
import type { Tables } from "@/lib/supabase/database.types";
import { createPublicClient } from "@/lib/supabase/public";
import { failedRead } from "./fallback";
import { SEED_REVIEWS, type Review } from "./reviews.seed";

export type { Review } from "./reviews.seed";

// The columns the select reads. The public_read policy keeps unpublished reviews
// and those without consent out, so there is no such check in code.
export type ReviewRow = Pick<Tables<"reviews">, "id" | "first_name" | "city" | "body" | "model_label" | "sort">;

/** `reviews` rows as Review[], ordered by `sort`. Pure. Empty city or model stay "" and the card hides them. */
export function reviewsFromRows(rows: ReviewRow[]): Review[] {
  return [...rows]
    .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
    .map((row) => ({
      name: row.first_name,
      city: row.city ?? "",
      body: row.body,
      modelLabel: row.model_label ?? "",
    }));
}

// Null when Supabase cannot be reached (missing env, request or API error): the
// caller then serves the seed. An empty list from a reachable database is the
// truth: section 07 hides (docs/PLAN.md). In production it throws instead (fallback.ts).
async function readReviews(): Promise<Review[] | null> {
  try {
    const { data, error } = await createPublicClient()
      .from("reviews")
      .select("id, first_name, city, body, model_label, sort")
      .order("sort");
    if (error) throw new Error(error.message);
    return reviewsFromRows(data ?? []);
  } catch (err) {
    return failedRead("getReviews", err);
  }
}

/** The published reviews with consent, cached under the "reviews" tag (revalidated by /api/revalidate). */
export async function getReviews(): Promise<Review[]> {
  "use cache";
  cacheTag("reviews");
  const reviews = await readReviews();
  // A successful read lives a day; the seed fallback only minutes, so an outage is
  // retried soon instead of leaving the placeholder cards on the site for a day.
  // Only one cacheLife call runs per invocation (docs: conditional cache lifetimes).
  if (reviews) cacheLife("days");
  else cacheLife("minutes");
  return reviews ?? SEED_REVIEWS;
}
