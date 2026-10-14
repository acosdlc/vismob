// Reviews seed. Only real reviews, with the client's consent, are ever shown
// (DESIGN §3.14); until they arrive (PR-7) these three cards hold the exact
// DESIGN §3.14 placeholders so the 1440/390 checks match the canvas.
export interface Review {
  /** „[Prenume]” */
  name: string;
  /** „[Oraș]” */
  city: string;
  /** The quote. */
  body: string;
  /** „Capitonat · 160 × 200” */
  modelLabel: string;
}

const PLACEHOLDER_REVIEW: Review = {
  name: "[Prenume]",
  city: "[Oraș]",
  body: "[Recenzie]",
  modelLabel: "[Model · dimensiune]",
};

export const SEED_REVIEWS: Review[] = [
  { ...PLACEHOLDER_REVIEW },
  { ...PLACEHOLDER_REVIEW },
  { ...PLACEHOLDER_REVIEW },
];
