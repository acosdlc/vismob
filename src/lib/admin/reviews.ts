import { z } from "zod";
import type { FieldErrors } from "@/lib/leads/types";
import { formValues, zodFieldErrors } from "@/lib/validation/form-values";
import { ADMIN_MESSAGES } from "./types";

// Pure helpers of the Recenzii screens (docs/PLAN.md PR-9, ARHITECTURA §8
// „Recenzii”): the form's schema, the consent rule and the texts the actions and
// the pages share. No Supabase, no React: the actions and the form call these and
// only write or display. The site shows a review only when it is published AND
// the client agreed (the public_read policy), so the admin refuses to publish
// one without the consent ticked.

/** Texts of these screens that ADMIN_MESSAGES does not carry (listed in the PR for approval). */
export const REVIEW_MESSAGES = {
  consent: "Publicarea cere acordul clientului; bifează-l întâi.",
} as const;

/** Where a review was received, as the `source` select offers them; the column is free text, so SQL rows may hold other values. */
export const REVIEW_SOURCES = [
  { value: "google", label: "Google" },
  { value: "facebook", label: "Facebook" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "direct", label: "Direct, în atelier" },
] as const;

export type ReviewSource = (typeof REVIEW_SOURCES)[number]["value"];

const SOURCE_VALUES = REVIEW_SOURCES.map((source) => source.value) as [ReviewSource, ...ReviewSource[]];

/** The label of a stored `source`: the select's text for a known value, the raw value otherwise, „—” for none. */
export function reviewSourceLabel(source: string | null | undefined): string {
  if (!source) return "—";
  return REVIEW_SOURCES.find((candidate) => candidate.value === source)?.label ?? source;
}

/** „Ana, Cluj” or just „Ana”: the review's name in the table, the screen title and the delete confirmation. */
export function reviewLabel(review: { first_name: string; city: string | null }): string {
  return review.city ? `${review.first_name}, ${review.city}` : review.first_name;
}

/** How many characters of the body the list shows. */
export const EXCERPT_LENGTH = 90;

/** The first `max` characters of a review, with „…” when something was cut; whole code points, so a diacritic is never split. */
export function reviewExcerpt(body: string, max: number = EXCERPT_LENGTH): string {
  const chars = Array.from(body);
  if (chars.length <= max) return body;
  return `${chars.slice(0, max).join("").trimEnd()}…`;
}

/** A checkbox posts "on" when ticked and nothing when not. */
const checkbox = z
  .string()
  .optional()
  .transform((value) => value === "on");

/** An optional text: trimmed, bounded, null when left empty (the columns are nullable). */
const optionalText = (max: number) =>
  z
    .string({ error: ADMIN_MESSAGES.invalid })
    .trim()
    .max(max, ADMIN_MESSAGES.tooLong)
    .optional()
    .transform((value) => (value ? value : null));

/** The Recenzii form (PR-9): every editable column of `reviews`. */
export const reviewSchema = z.object({
  first_name: z.string({ error: ADMIN_MESSAGES.required }).trim().min(1, ADMIN_MESSAGES.required).max(60, ADMIN_MESSAGES.tooLong),
  city: optionalText(80),
  body: z.string({ error: ADMIN_MESSAGES.required }).trim().min(1, ADMIN_MESSAGES.required).max(1000, ADMIN_MESSAGES.tooLong),
  model_label: optionalText(80),
  // „—” posts "" and means none; anything else has to be one of the select's values.
  source: z
    .string({ error: ADMIN_MESSAGES.invalid })
    .trim()
    .optional()
    .transform((value) => (value ? value : null))
    .pipe(z.enum(SOURCE_VALUES, { error: ADMIN_MESSAGES.invalid }).nullable()),
  consent: checkbox,
  published: checkbox,
  sort: z.coerce
    .number({ error: ADMIN_MESSAGES.invalid })
    .int(ADMIN_MESSAGES.invalid)
    .min(0, ADMIN_MESSAGES.invalid)
    .max(999, ADMIN_MESSAGES.invalid)
    .default(0),
});

export type ReviewInput = z.output<typeof reviewSchema>;

export type ParseReviewResult = { ok: true; data: ReviewInput } | { ok: false; fieldErrors: FieldErrors };

/** Validates the posted Recenzii form; on failure, the first message per field. */
export function parseReviewForm(formData: FormData): ParseReviewResult {
  const result = reviewSchema.safeParse(formValues(formData));
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, fieldErrors: zodFieldErrors(result.error.issues, ADMIN_MESSAGES.invalid) };
}

/**
 * Whether the review may be saved as posted: an unpublished review always, a
 * published one only with the client's written consent (RLS would hide it from the
 * site anyway; refusing it keeps the admin's „Publicată” honest).
 */
export function canPublish({ published, consent }: { published: boolean; consent: boolean }): boolean {
  return !published || consent;
}
