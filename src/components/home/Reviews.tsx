import { ReviewCard } from "@/components/site/ReviewCard";
import type { Review } from "@/lib/data/reviews";
import type { Settings } from "@/lib/data/settings.seed";
import { Section } from "./Section";

// DESIGN §4.1, 07 — Clienți. Only real reviews with consent; the section hides
// when there are none, and the Google line shows only when both values exist.
export function Reviews({ reviews, settings }: { reviews: Review[]; settings: Settings }) {
  if (reviews.length === 0) return null;
  const google = settings.google_rating && settings.google_reviews_count;
  return (
    <Section id="recenzii" rule tone="paper-2">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-4">
          <span className="eyebrow">07 — Clienți</span>
          <h2 className="h2-section max-w-[760px]">Ce spun clienții</h2>
        </div>
        {google && (
          <p className="mono-13 text-ink-2">
            Google: {settings.google_rating} din {settings.google_reviews_count} recenzii
          </p>
        )}
      </div>
      <ul className="mt-[clamp(32px,4vw,56px)] grid list-none grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-4 p-0">
        {reviews.map((r, i) => (
          <li key={i} className="flex">
            <ReviewCard quote={r.body} name={r.name} city={r.city} model={r.modelLabel} />
          </li>
        ))}
      </ul>
    </Section>
  );
}
