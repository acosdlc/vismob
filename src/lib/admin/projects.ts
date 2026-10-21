import { z } from "zod";
import type { ModelId } from "@/lib/configurator/types";
import type { FieldErrors } from "@/lib/leads/types";
import { formValues, zodFieldErrors } from "@/lib/validation/form-values";
import { slugify } from "./materials";
import { PHOTO_FIELDS, photoChange } from "./media";
import { ADMIN_MESSAGES } from "./types";

// Pure helpers of the Lucrări screens (docs/PLAN.md PR-9, ARHITECTURA §8 „Lucrări”):
// the project form's schema, the photo rows' parser, the slug a new project gets and
// the two publication rules (consent before publishing, published before hero). No
// Supabase, no React: the Server Actions parse with these, the forms import the texts.

/** Texts of these screens that ADMIN_MESSAGES does not carry (listed in the PR for approval). */
export const PROJECT_MESSAGES = {
  consent: "Publicarea cere acordul clientului; bifează-l întâi.",
  heroUnpublished: "Proiectul din hero trebuie să fie publicat.",
  model: "Alege un model din listă.",
  size: "Scrie lățimea și lungimea saltelei în cm (60–300).",
  slug: "Titlul nu poate da un identificator; scrie un titlu cu litere.",
  photos: "Fiecare poză are un text alternativ.",
} as const;

/** The closed set of `projects.model_id` (src/lib/configurator/types.ts); projectsFromRows() skips anything else. */
export const PROJECT_MODEL_IDS = ["capitonat", "arcuit", "canale", "lamele"] as const satisfies readonly ModelId[];

/** The mattress sizes the form accepts, in cm. */
export const PROJECT_SIZE = { min: 60, max: 300 } as const;

/** The longest text each column takes. */
export const PROJECT_LIMITS = { title: 120, ticketNo: 20, city: 80, alt: 200, sort: 999 } as const;

/**
 * The two extras a project can list. The form posts the `value`s (`extras` checkboxes);
 * the stored `projects.extras` array holds the `label`s, exactly as the site prints them
 * (src/lib/configurator/format.ts, src/lib/data/projects.seed.ts).
 */
export const EXTRAS = [
  { value: "led", label: "LED sub pat" },
  { value: "nightstands", label: "2 noptiere" },
] as const;

export type ExtraValue = (typeof EXTRAS)[number]["value"];

const EXTRA_VALUES: readonly ExtraValue[] = EXTRAS.map((extra) => extra.value);

/** Posted extras values → the stored labels, deduplicated and in EXTRAS order. */
export function extrasLabels(values: readonly string[]): string[] {
  const posted = new Set(values);
  return EXTRAS.filter((extra) => posted.has(extra.value)).map((extra) => extra.label);
}

/** Stored labels → the checkbox values that are ticked (the reverse, for the form). */
export function extrasValues(labels: readonly string[]): ExtraValue[] {
  return EXTRAS.filter((extra) => labels.includes(extra.label)).map((extra) => extra.value);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a posted id looks like a `projects.id` / `project_photos.id` (uuid). */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** The uuid no row carries: `neq("id", NIL_UUID)` matches every row (hero exclusivity for a new project). */
export const NIL_UUID = "00000000-0000-0000-0000-000000000000";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `2026-03-14`: the pattern and a date that exists (`2026-02-30` rolls over, so it is refused). */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; fieldErrors: FieldErrors };

/** A checkbox posts "on" when ticked and nothing when not. */
const checkbox = z
  .string()
  .optional()
  .transform((value) => value === "on");

/** A required text: present, trimmed, 1 … `max` characters. */
const requiredText = (max: number) =>
  z.string({ error: ADMIN_MESSAGES.required }).trim().min(1, ADMIN_MESSAGES.required).max(max, ADMIN_MESSAGES.tooLong);

/** An optional text: trimmed, bounded, null when left empty (the columns are nullable). */
const optionalText = (max: number) =>
  z
    .string({ error: ADMIN_MESSAGES.invalid })
    .trim()
    .max(max, ADMIN_MESSAGES.tooLong)
    .optional()
    .transform((value) => (value ? value : null));

/** A mattress side in cm: a whole number 60 … 300; "" coerces to 0 and is refused with the same text. */
const size = z.coerce
  .number({ error: PROJECT_MESSAGES.size })
  .int(PROJECT_MESSAGES.size)
  .min(PROJECT_SIZE.min, PROJECT_MESSAGES.size)
  .max(PROJECT_SIZE.max, PROJECT_MESSAGES.size);

/** The `sort` column: a whole number 0 … 999; "" is 0. */
const sort = z.coerce
  .number({ error: ADMIN_MESSAGES.invalid })
  .int(ADMIN_MESSAGES.invalid)
  .min(0, ADMIN_MESSAGES.invalid)
  .max(PROJECT_LIMITS.sort, ADMIN_MESSAGES.invalid)
  .default(0);

/** `delivered_on`: empty is null, otherwise an ISO date that exists. */
const deliveredOn = z
  .string({ error: ADMIN_MESSAGES.invalid })
  .trim()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    if (!isIsoDate(value)) {
      ctx.addIssue({ code: "custom", message: ADMIN_MESSAGES.invalid });
      return z.NEVER;
    }
    return value;
  });

/**
 * The Lucrări form (PR-9). `model_id`, `material_id` and `base_id` are only checked for
 * shape here: the action confirms each names a row. `extras` arrives as the posted
 * checkbox values and leaves as the stored labels.
 */
export const projectSchema = z.object({
  title: requiredText(PROJECT_LIMITS.title),
  ticket_no: optionalText(PROJECT_LIMITS.ticketNo),
  model_id: z.enum(PROJECT_MODEL_IDS, { error: PROJECT_MESSAGES.model }),
  width_cm: size,
  length_cm: size,
  material_id: optionalText(80),
  base_id: optionalText(40),
  extras: z.array(z.enum(EXTRA_VALUES, { error: ADMIN_MESSAGES.invalid })).default([]).transform(extrasLabels),
  city: optionalText(PROJECT_LIMITS.city),
  delivered_on: deliveredOn,
  client_consent: checkbox,
  published: checkbox,
  featured: checkbox,
  hero: checkbox,
  sort,
});

export type ProjectInput = z.output<typeof projectSchema>;

/** Validates the posted Lucrări form; on failure, the first message per field. */
export function parseProjectForm(formData: FormData): ParseResult<ProjectInput> {
  const extras = formData.getAll("extras").filter((value): value is string => typeof value === "string");
  const result = projectSchema.safeParse({ ...formValues(formData), extras });
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, fieldErrors: zodFieldErrors(result.error.issues, ADMIN_MESSAGES.invalid) };
}

/** RLS `public_read` shows a project only when published AND with the client's consent: the form refuses the other combination. */
export function canPublish(input: Pick<ProjectInput, "published" | "client_consent">): boolean {
  return !input.published || input.client_consent;
}

/** The hero project is the first thing on Acasă: it has to be published (and so, through canPublish, consented). */
export function heroAllowed(input: Pick<ProjectInput, "hero" | "published">): boolean {
  return !input.hero || input.published;
}

export type ProjectSlugResult = { ok: true; slug: string } | { ok: false; message: string };

/**
 * The slug of a new project, from its title: slugify() with `-2`, `-3`… appended while
 * the slug is taken (the column is unique). A title with no letter or digit („***”)
 * gives no slug and is refused with PROJECT_MESSAGES.slug. Slugs never change once
 * assigned: the update leaves the column alone.
 */
export function projectSlugFor(title: string, takenSlugs: readonly string[]): ProjectSlugResult {
  const base = slugify(title);
  if (!base) return { ok: false, message: PROJECT_MESSAGES.slug };
  const taken = new Set(takenSlugs);
  if (!taken.has(base)) return { ok: true, slug: base };
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return { ok: true, slug: candidate };
  }
}

// ───────────── Photo rows ─────────────

/** The hidden input every existing photo row posts (one per row, read with getAll). */
export const PHOTO_ROW_ID_FIELD = "photo_id";

/** The alt text of the one new photo the form may post (next to the PhotoField's PHOTO_FIELDS). */
export const NEW_PHOTO_ALT_FIELD = "new_photo_alt";

/** The input names of one existing photo's row: `photo_alt_<id>`, `photo_sort_<id>`, `photo_delete_<id>`. */
export function photoRowFields(id: string): { alt: string; sort: string; delete: string } {
  return { alt: `photo_alt_${id}`, sort: `photo_sort_${id}`, delete: `photo_delete_${id}` };
}

export interface ProjectPhotoEdit {
  id: string;
  /** Ignored when `delete` is set. */
  alt: string;
  /** Ignored when `delete` is set. */
  sort: number;
  delete: boolean;
}

export interface ProjectPhotosInput {
  /** One entry per posted `photo_id`, in posting order. */
  edits: ProjectPhotoEdit[];
  /** The photo PhotoField uploaded, with its alt text; null when none was picked. */
  newPhoto: { path: string; alt: string } | null;
}

/** `project_photos.alt` is not null and the site reads it aloud: never empty, at most 200 characters. */
const altText = z
  .string({ error: PROJECT_MESSAGES.photos })
  .trim()
  .min(1, PROJECT_MESSAGES.photos)
  .max(PROJECT_LIMITS.alt, ADMIN_MESSAGES.tooLong);

const photoRowSchema = z.object({ alt: altText, sort });

function text(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

/**
 * The Poze form of a project: for every posted `photo_id`, its alt, sort and delete
 * box (a row ticked for deletion is not validated further), plus the optional new photo
 * (PhotoField's hidden inputs, folder `projects`) with its own alt, required once a
 * path is posted. The field errors carry the row's input names, so the form can mark
 * the right row.
 */
export function parseProjectPhotosForm(formData: FormData): ParseResult<ProjectPhotosInput> {
  const fieldErrors: FieldErrors = {};
  const edits: ProjectPhotoEdit[] = [];
  const seen = new Set<string>();

  for (const posted of formData.getAll(PHOTO_ROW_ID_FIELD)) {
    if (!isUuid(posted)) {
      fieldErrors[PHOTO_ROW_ID_FIELD] ??= ADMIN_MESSAGES.invalid;
      continue;
    }
    if (seen.has(posted)) continue;
    seen.add(posted);
    const names = photoRowFields(posted);
    if (text(formData, names.delete) === "on") {
      edits.push({ id: posted, alt: "", sort: 0, delete: true });
      continue;
    }
    const row = photoRowSchema.safeParse({ alt: text(formData, names.alt), sort: text(formData, names.sort) });
    if (row.success) {
      edits.push({ id: posted, alt: row.data.alt, sort: row.data.sort, delete: false });
      continue;
    }
    for (const issue of row.error.issues) {
      const field = issue.path[0] === "sort" ? names.sort : names.alt;
      fieldErrors[field] ??= issue.message || ADMIN_MESSAGES.invalid;
    }
  }

  let newPhoto: ProjectPhotosInput["newPhoto"] = null;
  const change = photoChange(formData, "projects");
  if (!change.ok) {
    fieldErrors[PHOTO_FIELDS.path] = ADMIN_MESSAGES.invalid;
  } else if (change.path) {
    const alt = altText.safeParse(text(formData, NEW_PHOTO_ALT_FIELD));
    if (alt.success) newPhoto = { path: change.path, alt: alt.data };
    else fieldErrors[NEW_PHOTO_ALT_FIELD] = alt.error.issues[0]?.message ?? PROJECT_MESSAGES.photos;
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, data: { edits, newPhoto } };
}
