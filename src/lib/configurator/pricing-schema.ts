// The price grid as data: its Zod schema (shared by the site's reader and the admin),
// the names of the inputs the Prețuri form posts, the parser of that form, the check
// of its lei amounts for a thousands-separator slip (the floor under a grid price is
// shared with the Excel import) and the three typical configurations the form
// previews (docs/ARHITECTURA.md §7, §8; docs/PLAN.md PR-8).
// Pure: no React, no Supabase, so the Client Component, the Server Action and the
// `src/lib/data` reader all import it.
import { z } from "zod";
import { DEFAULT_CONFIG, SIZES } from "./catalog.seed";
import type { FieldErrors } from "@/lib/leads/types";
import { priceFor, type Pricing } from "./pricing";
import { resolve } from "./rules";
import type { BaseId, Catalog, Config, HeadboardHeight, ModelId, PriceCategory } from "./types";

// The closed sets of src/lib/configurator/types.ts: the admin edits these rows and
// never creates or deletes one, so the grid has exactly these keys.
export const PRICING_MODEL_IDS = ["capitonat", "arcuit", "canale", "lamele"] as const satisfies readonly ModelId[];
export const PRICING_BASE_IDS = ["lemn", "metal", "lada", "sertare"] as const satisfies readonly BaseId[];
export const PRICING_CATEGORIES = ["A", "B", "C"] as const satisfies readonly PriceCategory[];
export const PRICING_HEIGHTS = ["100", "120", "140"] as const satisfies readonly `${HeadboardHeight}`[];

/** The standard widths of the grid, one column each (catalog.seed.ts SIZES). */
export const PRICING_WIDTHS = SIZES;
export type PricingWidth = (typeof PRICING_WIDTHS)[number];

// The exact shape of the Pricing type: z.record with an enum key is exhaustive
// (every model, every base) and z.object strips keys the type does not have.
export const pricingSchema = z.object({
  grid: z.record(z.enum(PRICING_MODEL_IDS), z.record(z.string().regex(/^\d+$/), z.number().positive())),
  categoryPct: z.object({ A: z.number(), B: z.number(), C: z.number() }),
  hbPct: z.object({ "100": z.number(), "120": z.number(), "140": z.number() }),
  base: z.object(
    Object.fromEntries(PRICING_BASE_IDS.map((id) => [id, z.number()])) as Record<BaseId, z.ZodNumber>,
  ),
  extras: z.object({ led: z.number(), nightstands: z.number() }),
  customPct: z.number(),
  roundTo: z.number().positive(),
});

/**
 * The names of the inputs the Prețuri form posts: the path of the value inside
 * `Pricing`, joined with dots, so a Zod issue's path is the field it belongs to.
 */
export const PRICING_FIELDS = {
  /**
   * A grid cell; an empty one is left out of the grid. The width stays in the configurator
   * (it offers every SIZES width) and is priced from another cell of the row: the next
   * wider one, or the widest (estimatePrice() in pricing.ts).
   */
  grid: (model: ModelId, width: PricingWidth) => `grid.${model}.${width}` as const,
  categoryPct: (category: PriceCategory) => `categoryPct.${category}` as const,
  hbPct: (height: `${HeadboardHeight}`) => `hbPct.${height}` as const,
  base: (base: BaseId) => `base.${base}` as const,
  extras: { led: "extras.led", nightstands: "extras.nightstands" },
  customPct: "customPct",
  roundTo: "roundTo",
} as const;

/** Every input name in form order (the grid first), for focusFirstInvalid(). */
export const PRICING_FIELD_ORDER: readonly string[] = [
  ...PRICING_MODEL_IDS.flatMap((model) => PRICING_WIDTHS.map((width) => PRICING_FIELDS.grid(model, width))),
  ...PRICING_CATEGORIES.map((category) => PRICING_FIELDS.categoryPct(category)),
  ...PRICING_HEIGHTS.map((height) => PRICING_FIELDS.hbPct(height)),
  ...PRICING_BASE_IDS.map((base) => PRICING_FIELDS.base(base)),
  PRICING_FIELDS.extras.led,
  PRICING_FIELDS.extras.nightstands,
  PRICING_FIELDS.customPct,
  PRICING_FIELDS.roundTo,
];

/**
 * Below this, a grid price is taken for a thousands-separator slip, not a price: the
 * site and the panel print „3.450 lei” (formatPrice, ro-RO), and "3.450" typed back
 * is a number to the parser, 3.45. No bed costs less, so there the size of the amount
 * is enough. One constant for the Prețuri form's Server Action (fieldsUnderLeiFloor)
 * and the Excel import (scripts/catalog-workbook.ts), so both refuse the same grid
 * prices. A base or an extra may really cost less, and there the two differ: the form
 * refuses only the typed shape of the slip (THOUSANDS_SLIP); the import, where a
 * number cell has no typed shape left, still holds a base to this floor and does not
 * check an extra for the slip.
 */
export const LEI_FLOOR = 100;

/** Texts of the Prețuri form that ADMIN_MESSAGES does not carry. */
export const PRICING_MESSAGES = {
  number: "Scrie un număr.",
  positive: "Scrie un număr mai mare ca zero.",
  /**
   * Under a grid cell above zero and under LEI_FLOOR, and under a base or an extra typed
   * with a point between thousands ("1.200", 1.2 lei to the parser): fieldsUnderLeiFloor.
   */
  floor: `Preț sub ${LEI_FLOOR} lei. Scrie suma fără punct la mii: 3450, nu 3.450.`,
  /**
   * Above the grid. It says what an empty cell does: the width is still offered, and
   * priced from the next filled width or, with none wider, from the widest filled one
   * (PRICING_FIELDS.grid). The note under the price grid of the Excel template carries
   * the same second sentence (NOTES.grid in scripts/catalog-workbook.ts).
   */
  grid: "Scrie prețul în lei pentru fiecare lățime, fără punct la mii: 3450, nu 3.450. O celulă goală nu scoate lățimea din configurator: patul ia prețul următoarei lățimi completate sau, dacă nu e niciuna mai lată, al celei mai late completate.",
} as const;

export type ParsePricingResult = { ok: true; data: Pricing } | { ok: false; fieldErrors: FieldErrors };

/**
 * Plain digits with an optional decimal point: "3450", "3450.50". No sign. A point is
 * always the decimal point, so "3.450" is 3.45: fieldsUnderLeiFloor catches that slip.
 */
const NUMBER = /^\d+(\.\d+)?$/;
const INTEGER = /^\d+$/;

/** A posted amount or percentage: a number, 0 allowed, nothing negative. The form always posts it. */
const amount = z
  .string({ error: PRICING_MESSAGES.number })
  .trim()
  .regex(NUMBER, PRICING_MESSAGES.number)
  .transform(Number);

/** A grid price: "" (or not posted) for a cell left empty, otherwise a number above zero. */
const gridPrice = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .pipe(amount.refine((value) => value > 0, PRICING_MESSAGES.positive).optional());

/** The rounding step: a whole number above zero. */
const roundTo = z
  .string({ error: PRICING_MESSAGES.number })
  .trim()
  .regex(INTEGER, PRICING_MESSAGES.number)
  .transform(Number)
  .refine((value) => value > 0, PRICING_MESSAGES.positive);

/** One model's row: only the widths that have a price. */
const gridRow = z
  .object(Object.fromEntries(PRICING_WIDTHS.map((width) => [width, gridPrice])) as Record<PricingWidth, typeof gridPrice>)
  .transform((row) => {
    const offered: Record<string, number> = {};
    for (const width of PRICING_WIDTHS) {
      const price = row[width];
      if (price !== undefined) offered[width] = price;
    }
    return offered;
  });

const amountsFor = <K extends string>(keys: readonly K[]) =>
  z.object(Object.fromEntries(keys.map((key) => [key, amount])) as Record<K, typeof amount>);

/** The posted form, nested as the Pricing type; its output is a Pricing. */
const pricingFormSchema = z.object({
  grid: z.object(
    Object.fromEntries(PRICING_MODEL_IDS.map((model) => [model, gridRow])) as Record<ModelId, typeof gridRow>,
  ),
  categoryPct: amountsFor(PRICING_CATEGORIES),
  hbPct: amountsFor(PRICING_HEIGHTS),
  base: amountsFor(PRICING_BASE_IDS),
  extras: z.object({ led: amount, nightstands: amount }),
  customPct: amount,
  roundTo,
});

/** The flat form values arranged as the schema reads them; a missing input is undefined. */
function nest(values: Record<string, string>) {
  const pick = <K extends string>(keys: readonly K[], name: (key: K) => string) =>
    Object.fromEntries(keys.map((key) => [key, values[name(key)]])) as Record<K, string | undefined>;
  return {
    grid: Object.fromEntries(
      PRICING_MODEL_IDS.map((model) => [model, pick(PRICING_WIDTHS, (width) => PRICING_FIELDS.grid(model, width))]),
    ),
    categoryPct: pick(PRICING_CATEGORIES, PRICING_FIELDS.categoryPct),
    hbPct: pick(PRICING_HEIGHTS, PRICING_FIELDS.hbPct),
    base: pick(PRICING_BASE_IDS, PRICING_FIELDS.base),
    extras: { led: values[PRICING_FIELDS.extras.led], nightstands: values[PRICING_FIELDS.extras.nightstands] },
    customPct: values[PRICING_FIELDS.customPct],
    roundTo: values[PRICING_FIELDS.roundTo],
  };
}

/** The posted strings, first value per name (a `$ACTION` entry or a file is skipped). */
function values(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string" || key.startsWith("$ACTION") || key in out) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Validates the posted Prețuri form. On success the data is a complete `Pricing`
 * (a model with no price at all has an empty row, so it has no price); on failure
 * the first message per input, keyed by the input's name (PRICING_FIELDS).
 */
export function parsePricingForm(formData: FormData): ParsePricingResult {
  const result = pricingFormSchema.safeParse(nest(values(formData)));
  // `result.data` is `z.output<typeof pricingFormSchema>`; returning it as `Pricing` is the type check.
  if (result.success) return { ok: true, data: result.data };

  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path.map(String).join(".");
    if (!field || fieldErrors[field]) continue;
    fieldErrors[field] = issue.message || PRICING_MESSAGES.number;
  }
  return { ok: false, fieldErrors };
}

/**
 * The slip as it is typed: one to three digits, a point and exactly three digits
 * ("1.200", "12.500"), which is the panel's own „1.200 lei” typed back. A text of this
 * shape is always a number to the parser (NUMBER).
 */
const THOUSANDS_SLIP = /^\d{1,3}\.\d{3}$/;

/**
 * The inputs of the posted Prețuri form (PRICING_FIELDS names, in form order) whose
 * lei amount is taken for a thousands-separator slip; savePricing answers
 * PRICING_MESSAGES.floor under each. A grid cell is flagged by size, above zero and
 * under LEI_FLOOR: no bed costs less, and it is the rule of the Excel import for the
 * grid (parsePricing in scripts/catalog-workbook.ts). A base and an extra are flagged
 * by shape only (THOUSANDS_SLIP): 0 is a real amount for a base and either may cost
 * less than the floor (metal legs for 50 lei more), so the size cannot tell "1.200"
 * from a price there. The percentages and the rounding step are small by nature and
 * are never flagged. It reads the post, not parsePricingForm's output: the typed text
 * is what carries the shape, and the action can mark these inputs in the same answer
 * as the parser's errors. An input the parser refuses is never flagged.
 */
export function fieldsUnderLeiFloor(formData: FormData): string[] {
  const posted = values(formData);
  const underFloor = (name: string) => {
    const parsed = amount.safeParse(posted[name]);
    return parsed.success && parsed.data > 0 && parsed.data < LEI_FLOOR;
  };
  // Trimmed as the parser trims it (`amount`); an input that was not posted has no text.
  const typedAsSlip = (name: string) => THOUSANDS_SLIP.test((posted[name] ?? "").trim());
  return [
    ...PRICING_MODEL_IDS.flatMap((model) => PRICING_WIDTHS.map((width) => PRICING_FIELDS.grid(model, width))).filter(underFloor),
    ...PRICING_BASE_IDS.map((base) => PRICING_FIELDS.base(base)).filter(typedAsSlip),
    ...[PRICING_FIELDS.extras.led, PRICING_FIELDS.extras.nightstands].filter(typedAsSlip),
  ];
}

export interface PreviewConfig {
  label: string;
  config: Config;
}

/**
 * Three typical configurations (ARHITECTURA §8 „Prețuri”), with the seed ids. The
 * label names the configuration; the price category is the colour's own, from the
 * catalogue, so the label does not state one.
 */
export const PREVIEW_CONFIGS: readonly PreviewConfig[] = [
  {
    label: "Capitonat 160 × 200, catifea Verde sticlă, tăblie 120, picioare din lemn",
    config: { ...DEFAULT_CONFIG, model: "capitonat", size: "160", family: "catifea", color: "ct-verde", hb: 120, base: "lemn" },
  },
  {
    label: "Arcuit 180 × 200, bouclé Alb lapte, tăblie 140, ladă, LED",
    config: { ...DEFAULT_CONFIG, model: "arcuit", size: "180", family: "boucle", color: "bc-alb", hb: 140, base: "lada", led: true },
  },
  {
    label: "Lamele 140 × 200, lemn Stejar natur, tăblie 100, picioare metalice",
    config: { ...DEFAULT_CONFIG, model: "lamele", size: "140", family: "lemn", color: "lm-stejar", hb: 100, base: "metal" },
  },
];

export interface PreviewPrice {
  label: string;
  /** null: no grid, the model has no width in it, or the catalogue no longer has the model, family or base the label names. */
  price: number | null;
}

/**
 * The indicative price of each PREVIEW_CONFIGS entry, with the same functions as
 * the site (resolve, priceFor). resolve() repairs an id the catalogue no longer
 * has: a missing colour becomes the family's first colour and the line is still
 * priced, but a missing model, family or base would price another configuration
 * than the label names, so that line is null instead.
 */
export function previewPrices(catalog: Catalog, pricing: Pricing | null): PreviewPrice[] {
  return PREVIEW_CONFIGS.map(({ label, config }) => {
    try {
      const r = resolve(config, catalog);
      const same =
        r.model.id === config.model && r.family.id === config.family && r.color.id === config.color && r.base.id === config.base;
      return { label, price: same ? priceFor(r, pricing) : null };
    } catch {
      // resolve() throws on a catalogue with no models or no bases: nothing to price.
      return { label, price: null };
    }
  });
}
