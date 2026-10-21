import { z } from "zod";
import type { PriceCategory } from "@/lib/configurator/types";
import type { FieldErrors } from "@/lib/leads/types";
import { formValues, zodFieldErrors } from "@/lib/validation/form-values";
import { ADMIN_MESSAGES } from "./types";

// Pure helpers of the Materiale screens (docs/PLAN.md PR-8, ARHITECTURA §8
// „Catalog”): the form's schema, the id and the code a new material gets, and the
// texts the actions answer with. No Supabase, no React: the actions and the form
// call these and only write or display.

/** The three categories of `materials.price_category`, in the select's order. */
export const PRICE_CATEGORIES = ["A", "B", "C"] as const satisfies readonly PriceCategory[];

/** Texts of these screens that ADMIN_MESSAGES does not carry (listed in the PR for approval). */
export const MATERIAL_MESSAGES = {
  hex: "Scrie culoarea ca #RRGGBB.",
  lastColor: "Familia ar rămâne fără nicio culoare activă. Activează sau adaugă alta întâi.",
  inProject: "Materialul apare într-o lucrare; dezactivează-l în loc să-l ștergi.",
  inLead: "Materialul apare în cereri primite; dezactivează-l în loc să-l ștergi.",
  familyUnknown: "Alege o familie din listă.",
} as const;

export const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/** The longest slug a material id carries after the family prefix. */
export const SLUG_MAX = 40;

/** The slug materialIdFor falls back to when nothing of the name survives (e.g. „***”). */
const EMPTY_SLUG = "material";

/**
 * „Verde sticlă” → `verde-sticla`: lowercase ASCII with the diacritics stripped
 * (ș → s, ț → t, ă â → a, î → i, the cedilla forms too), every run of other
 * characters a single dash, no dash at either end, at most SLUG_MAX characters.
 * Empty when nothing of the name is a letter or a digit.
 */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

/**
 * The id of a new material, `ct-verde-sticla`: the family code in lowercase, a dash
 * and the slug of the name, with `-2`, `-3`… appended while the id is taken. Ids are
 * the primary key and travel in the configurator's URL (`c=ct-verde`), so they never
 * change once assigned.
 */
export function materialIdFor(familyCode: string, name: string, takenIds: readonly string[]): string {
  const base = `${familyCode.toLowerCase()}-${slugify(name) || EMPTY_SLUG}`;
  const taken = new Set(takenIds);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * The code of a new material, `CT07`: the family code followed by the next number,
 * zero-padded to two digits, computed as the highest numeric suffix already used with
 * that prefix plus one. A code is assigned once and never reused: the delete refuses a
 * material that leads or projects still reference, so a number in use is never freed,
 * and a gap left by a deleted unused material stays a gap. A code of another family
 * whose code starts the same way (`CT01` seen from the prefix `C`) does not count: its
 * remainder is not all digits.
 */
export function nextMaterialCode(familyCode: string, existingCodes: readonly string[]): string {
  let highest = 0;
  for (const code of existingCodes) {
    if (!code.startsWith(familyCode)) continue;
    const suffix = code.slice(familyCode.length);
    if (!/^\d+$/.test(suffix)) continue;
    highest = Math.max(highest, Number(suffix));
  }
  return `${familyCode}${String(highest + 1).padStart(2, "0")}`;
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

/**
 * The Materiale form (PR-8). `family_id` is only checked for presence here: the
 * action confirms it names a family, and ignores it on an edit (the family and the
 * code never change). The hex is stored uppercase, as the seed writes it.
 */
export const materialSchema = z.object({
  family_id: z.string({ error: MATERIAL_MESSAGES.familyUnknown }).trim().min(1, MATERIAL_MESSAGES.familyUnknown),
  name: z.string({ error: ADMIN_MESSAGES.required }).trim().min(1, ADMIN_MESSAGES.required).max(80, ADMIN_MESSAGES.tooLong),
  hex: z
    .string({ error: MATERIAL_MESSAGES.hex })
    .trim()
    .regex(HEX_PATTERN, MATERIAL_MESSAGES.hex)
    .transform((value) => value.toUpperCase()),
  supplier: optionalText(120),
  supplier_code: optionalText(60),
  price_category: z.enum(PRICE_CATEGORIES, { error: ADMIN_MESSAGES.invalid }),
  featured: checkbox,
  active: checkbox,
  sort: z.coerce
    .number({ error: ADMIN_MESSAGES.invalid })
    .int(ADMIN_MESSAGES.invalid)
    .min(0, ADMIN_MESSAGES.invalid)
    .max(999, ADMIN_MESSAGES.invalid)
    .default(0),
});

export type MaterialInput = z.output<typeof materialSchema>;

export type ParseMaterialResult = { ok: true; data: MaterialInput } | { ok: false; fieldErrors: FieldErrors };

/** Validates the posted Materiale form; on failure, the first message per field. */
export function parseMaterialForm(formData: FormData): ParseMaterialResult {
  const result = materialSchema.safeParse(formValues(formData));
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, fieldErrors: zodFieldErrors(result.error.issues, ADMIN_MESSAGES.invalid) };
}
