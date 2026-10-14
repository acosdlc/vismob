import { SEED_REVIEWS, type Review } from "./reviews.seed";

export type { Review } from "./reviews.seed";

// PR-5 switches this to a cached Supabase read (published reviews with consent)
// with the seed as the fallback for builds that have no environment variables.
// In production an empty list hides section 07 (docs/PLAN.md).
export async function getReviews(): Promise<Review[]> {
  return SEED_REVIEWS;
}
