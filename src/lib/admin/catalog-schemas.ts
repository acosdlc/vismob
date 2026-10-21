import { z } from "zod";
import type { FieldErrors } from "@/lib/leads/types";
import type { Json } from "@/lib/supabase/database.types";
import { formValues, zodFieldErrors } from "@/lib/validation/form-values";
import { ADMIN_MESSAGES } from "./types";

// Validation of the catalogue edit forms of models, material families and bases
// (docs/PLAN.md PR-8, ARHITECTURA §8 „Catalog”). Pure: the Server Actions parse
// with these, the forms import the texts. The rows themselves are never created or
// deleted here: their ids are closed sets in src/lib/configurator/types.ts, so the
// admin only edits what the seed migration put in.

/** Texts of these forms that ADMIN_MESSAGES does not carry. */
export const CATALOG_MESSAGES = {
  noFamily: "Alege cel puțin o familie de materiale.",
  lastModel: "Nu ar rămâne niciun model activ. Activează altul întâi.",
  lastBase: "Nu ar rămâne nicio bază activă. Activează alta întâi.",
  specs: "Fiecare rând are nume și valoare.",
} as const;

/** Shown by the edit pages when the row cannot be read. */
export const CATALOG_READ_FAILED = "Nu am putut citi înregistrarea. Reîncarcă pagina.";

/** The ids of models, families and bases: 'capitonat', 'catifea', 'lemn' (src/lib/configurator/types.ts). */
export const CATALOG_ROW_ID = /^[a-z]+$/;

/** How many specification rows the family form posts (the Materiale page shows four). */
export const SPEC_ROWS = 6;

/** The row numbers of the specification grid: 1 … SPEC_ROWS. */
export const SPEC_ROW_NUMBERS: readonly number[] = Array.from({ length: SPEC_ROWS }, (_, i) => i + 1);

/** The input names of one specification row: `spec_k_1` / `spec_v_1`. */
export function specFieldNames(row: number): { k: string; v: string } {
  return { k: `spec_k_${row}`, v: `spec_v_${row}` };
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; fieldErrors: FieldErrors };

/** The hidden `id` of an edit form, or null when it is missing or not a catalogue id. */
export function rowId(formData: FormData): string | null {
  const id = formData.get("id");
  return typeof id === "string" && CATALOG_ROW_ID.test(id) ? id : null;
}

/** A required text: present, trimmed, 1 … `max` characters. */
const requiredText = (max: number) =>
  z.string({ error: ADMIN_MESSAGES.required }).trim().min(1, ADMIN_MESSAGES.required).max(max, ADMIN_MESSAGES.tooLong);

/** An optional paragraph: trimmed, bounded, stored as null when empty. */
const optionalText = (max: number) =>
  z
    .string({ error: ADMIN_MESSAGES.required })
    .trim()
    .max(max, ADMIN_MESSAGES.tooLong)
    .transform((value) => (value === "" ? null : value));

/** A checkbox posts "on" when ticked and nothing when not. */
const checkbox = z
  .string()
  .optional()
  .transform((value) => value === "on");

/** The `sort` column: a whole number 0 … 999. */
const sort = z.coerce
  .number({ error: ADMIN_MESSAGES.invalid })
  .int(ADMIN_MESSAGES.invalid)
  .min(0, ADMIN_MESSAGES.invalid)
  .max(999, ADMIN_MESSAGES.invalid);

/** One side of a specification row: may be empty, at most 80 characters. */
const specText = z.string().trim().max(80, ADMIN_MESSAGES.tooLong).default("");

export const modelSchema = z.object({
  name: requiredText(80),
  note: requiredText(120),
  description: optionalText(1000),
  active: checkbox,
  sort,
  /** The family ids ticked in „Familii de materiale permise”; at least one, or resolve() could not configure the model. */
  families: z.array(z.string().regex(CATALOG_ROW_ID, ADMIN_MESSAGES.invalid)).min(1, CATALOG_MESSAGES.noFamily),
});

export const familySchema = z.object({
  name: requiredText(80),
  description: optionalText(1000),
  /** The posted rows: an empty row is dropped, a half-filled one refused. */
  specs: z
    .array(z.object({ k: specText, v: specText }))
    .max(SPEC_ROWS, ADMIN_MESSAGES.invalid)
    .transform((rows, ctx) => {
      const specs: { k: string; v: string }[] = [];
      for (const row of rows) {
        if (row.k === "" && row.v === "") continue;
        if (row.k === "" || row.v === "") {
          ctx.addIssue({ code: "custom", message: CATALOG_MESSAGES.specs });
          return z.NEVER;
        }
        specs.push({ k: row.k, v: row.v });
      }
      return specs;
    }),
});

export const baseSchema = z.object({
  name: requiredText(80),
  note: requiredText(120),
  active: checkbox,
  sort,
});

export type ModelInput = z.output<typeof modelSchema>;
export type FamilyInput = z.output<typeof familySchema>;
export type BaseInput = z.output<typeof baseSchema>;

function parse<S extends z.ZodType>(schema: S, input: unknown): ParseResult<z.output<S>> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, fieldErrors: zodFieldErrors(result.error.issues, ADMIN_MESSAGES.invalid) };
}

/** The model form: the text fields plus every `families` checkbox, deduplicated. */
export function parseModelForm(formData: FormData): ParseResult<ModelInput> {
  const families = Array.from(
    new Set(formData.getAll("families").filter((value): value is string => typeof value === "string")),
  );
  return parse(modelSchema, { ...formValues(formData), families });
}

/** The family form: name, description and the SPEC_ROWS rows posted as spec_k_n / spec_v_n. The tab is not editable. */
export function parseFamilyForm(formData: FormData): ParseResult<FamilyInput> {
  const values = formValues(formData);
  const specs = SPEC_ROW_NUMBERS.map((row) => {
    const names = specFieldNames(row);
    return { k: values[names.k], v: values[names.v] };
  });
  return parse(familySchema, { name: values.name, description: values.description, specs });
}

/** The base form: name, note, active and sort; the photo goes through photoChange() (src/lib/admin/media.ts). */
export function parseBaseForm(formData: FormData): ParseResult<BaseInput> {
  return parse(baseSchema, formValues(formData));
}

/**
 * `material_families.specs` as the DESIGN §4.3 table rows, exactly as src/lib/data/catalog.ts
 * reads them for the site: anything but an array of {k, v} strings is [].
 */
export function specsFromJson(value: Json): { k: string; v: string }[] {
  if (!Array.isArray(value)) return [];
  const specs: { k: string; v: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const { k, v } = item;
    if (typeof k !== "string" || typeof v !== "string") return [];
    specs.push({ k, v });
  }
  return specs;
}
