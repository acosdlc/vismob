// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SEED_CATALOG } from "./catalog.seed";
import type { Pricing } from "./pricing";
import {
  PREVIEW_CONFIGS,
  PRICING_FIELD_ORDER,
  PRICING_FIELDS,
  PRICING_MESSAGES,
  PRICING_WIDTHS,
  parsePricingForm,
  previewPrices,
  pricingSchema,
} from "./pricing-schema";
import type { Catalog } from "./types";

// A fixture only (the style of pricing.test.ts): the workshop's real grid is never in the code.
const PRICING: Pricing = {
  grid: {
    capitonat: { "90": 2000, "120": 2400, "140": 2800, "160": 3000, "180": 3400, "200": 3800 },
    arcuit: { "160": 3200, "180": 3600 },
    canale: { "160": 3300 },
    lamele: {},
  },
  categoryPct: { A: 0, B: 10, C: 20 },
  hbPct: { "100": 0, "120": 5, "140": 10 },
  base: { lemn: 0, metal: 100, lada: 800, sertare: 600 },
  extras: { led: 300, nightstands: 1200 },
  customPct: 15,
  roundTo: 50,
};

/** The form's post for a Pricing: every number as a string, a width without a price as "". */
function formFor(pricing: Pricing, patch: Record<string, string> = {}): FormData {
  const fd = new FormData();
  for (const [model, row] of Object.entries(pricing.grid)) {
    for (const width of PRICING_WIDTHS) {
      const price = row[width];
      fd.set(`grid.${model}.${width}`, price === undefined ? "" : String(price));
    }
  }
  for (const [category, pct] of Object.entries(pricing.categoryPct)) fd.set(`categoryPct.${category}`, String(pct));
  for (const [height, pct] of Object.entries(pricing.hbPct)) fd.set(`hbPct.${height}`, String(pct));
  for (const [base, lei] of Object.entries(pricing.base)) fd.set(`base.${base}`, String(lei));
  fd.set("extras.led", String(pricing.extras.led));
  fd.set("extras.nightstands", String(pricing.extras.nightstands));
  fd.set("customPct", String(pricing.customPct));
  fd.set("roundTo", String(pricing.roundTo));
  for (const [name, value] of Object.entries(patch)) fd.set(name, value);
  return fd;
}

describe("pricingSchema", () => {
  it("accepts the Pricing shape and drops keys the type does not have", () => {
    const parsed = pricingSchema.safeParse({ ...PRICING, note: "x", extras: { ...PRICING.extras, cover: 1 } });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(PRICING);
  });

  it("refuses what the site's reader refused before the move", () => {
    const invalid: unknown[] = [
      { ...PRICING, grid: { capitonat: PRICING.grid.capitonat } }, // a model is missing
      { ...PRICING, grid: { ...PRICING.grid, capitonat: { "160": 3000, lata: 1 } } }, // a width is not digits
      { ...PRICING, grid: { ...PRICING.grid, capitonat: { "160": 0 } } }, // a price is not positive
      { ...PRICING, hbPct: { "100": 0, "120": 5 } }, // a height is missing
      { ...PRICING, base: { lemn: 0, metal: 100, lada: 800 } }, // a base is missing
      { ...PRICING, roundTo: 0 },
      { ...PRICING, customPct: "15" },
      "not an object",
      null,
    ];
    for (const data of invalid) expect(pricingSchema.safeParse(data).success, JSON.stringify(data)).toBe(false);
  });
});

describe("PRICING_FIELDS", () => {
  it("names every input after its path in Pricing, and the order lists each once, grid first", () => {
    expect(PRICING_WIDTHS).toEqual(["90", "120", "140", "160", "180", "200"]);
    expect(PRICING_FIELDS.grid("capitonat", "160")).toBe("grid.capitonat.160");
    expect(PRICING_FIELDS.categoryPct("B")).toBe("categoryPct.B");
    expect(PRICING_FIELDS.hbPct("140")).toBe("hbPct.140");
    expect(PRICING_FIELDS.base("lada")).toBe("base.lada");
    expect(PRICING_FIELDS.extras).toEqual({ led: "extras.led", nightstands: "extras.nightstands" });
    expect(PRICING_FIELDS.customPct).toBe("customPct");
    expect(PRICING_FIELDS.roundTo).toBe("roundTo");

    expect(PRICING_FIELD_ORDER).toHaveLength(4 * 6 + 3 + 3 + 4 + 2 + 2);
    expect(new Set(PRICING_FIELD_ORDER).size).toBe(PRICING_FIELD_ORDER.length);
    expect(PRICING_FIELD_ORDER[0]).toBe("grid.capitonat.90");
    expect(PRICING_FIELD_ORDER.at(-1)).toBe("roundTo");
    expect([...formFor(PRICING).keys()].sort()).toEqual([...PRICING_FIELD_ORDER].sort());
  });
});

describe("parsePricingForm", () => {
  it("reads a sparse grid: an empty cell is a width that is not offered, a model may have none", () => {
    const result = parsePricingForm(formFor(PRICING));
    expect(result).toEqual({ ok: true, data: PRICING });
    expect(result.ok && pricingSchema.safeParse(result.data).success).toBe(true);
  });

  it("accepts decimals with a point, trims, and treats a cell that was not posted as empty", () => {
    const fd = formFor(PRICING, { "grid.capitonat.90": " 2000.50 ", "categoryPct.B": "12.5", "base.metal": " 0 " });
    fd.delete("grid.lamele.90");
    const result = parsePricingForm(fd);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.grid.capitonat["90"]).toBe(2000.5);
    expect(result.data.categoryPct.B).toBe(12.5);
    expect(result.data.base.metal).toBe(0);
    expect(result.data.grid.lamele).toEqual({});
  });

  it("refuses a grid price that is not a number or not above zero, keyed by the cell", () => {
    expect(parsePricingForm(formFor(PRICING, { "grid.capitonat.160": "3.450,50" }))).toEqual({
      ok: false,
      fieldErrors: { "grid.capitonat.160": PRICING_MESSAGES.number },
    });
    expect(parsePricingForm(formFor(PRICING, { "grid.arcuit.180": "-3600" }))).toEqual({
      ok: false,
      fieldErrors: { "grid.arcuit.180": PRICING_MESSAGES.number },
    });
    expect(parsePricingForm(formFor(PRICING, { "grid.canale.160": "0" }))).toEqual({
      ok: false,
      fieldErrors: { "grid.canale.160": PRICING_MESSAGES.positive },
    });
  });

  it("refuses an empty, non-numeric or negative percentage; 0 is allowed", () => {
    expect(parsePricingForm(formFor(PRICING, { "categoryPct.A": "" }))).toEqual({
      ok: false,
      fieldErrors: { "categoryPct.A": PRICING_MESSAGES.number },
    });
    expect(parsePricingForm(formFor(PRICING, { "hbPct.120": "cinci" }))).toEqual({
      ok: false,
      fieldErrors: { "hbPct.120": PRICING_MESSAGES.number },
    });
    expect(parsePricingForm(formFor(PRICING, { customPct: "-5" }))).toEqual({
      ok: false,
      fieldErrors: { customPct: PRICING_MESSAGES.number },
    });
    const zero = parsePricingForm(formFor(PRICING, { "categoryPct.A": "0", "hbPct.100": "0", customPct: "0" }));
    expect(zero.ok).toBe(true);
  });

  it("refuses an empty or negative amount for a base or an extra; 0 is allowed", () => {
    expect(parsePricingForm(formFor(PRICING, { "base.lada": "-800" }))).toEqual({
      ok: false,
      fieldErrors: { "base.lada": PRICING_MESSAGES.number },
    });
    expect(parsePricingForm(formFor(PRICING, { "extras.led": "" }))).toEqual({
      ok: false,
      fieldErrors: { "extras.led": PRICING_MESSAGES.number },
    });
    expect(parsePricingForm(formFor(PRICING, { "extras.nightstands": "0", "base.lemn": "0" })).ok).toBe(true);
  });

  it("refuses a rounding step that is not a whole number above zero", () => {
    expect(parsePricingForm(formFor(PRICING, { roundTo: "0" }))).toEqual({
      ok: false,
      fieldErrors: { roundTo: PRICING_MESSAGES.positive },
    });
    expect(parsePricingForm(formFor(PRICING, { roundTo: "50.5" }))).toEqual({
      ok: false,
      fieldErrors: { roundTo: PRICING_MESSAGES.number },
    });
    expect(parsePricingForm(formFor(PRICING, { roundTo: "" }))).toEqual({
      ok: false,
      fieldErrors: { roundTo: PRICING_MESSAGES.number },
    });
  });

  it("reports every input that is missing from an empty post, one message each, nothing for the grid", () => {
    const result = parsePricingForm(new FormData());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const missing = PRICING_FIELD_ORDER.filter((name) => !name.startsWith("grid."));
    expect(Object.keys(result.fieldErrors).sort()).toEqual([...missing].sort());
    for (const name of missing) expect(result.fieldErrors[name]).toBe(PRICING_MESSAGES.number);
  });

  it("ignores inputs it does not know", () => {
    const fd = formFor(PRICING, { $ACTION_ID_abc: "x", "grid.pat5.160": "9", note: "x" });
    expect(parsePricingForm(fd)).toEqual({ ok: true, data: PRICING });
  });
});

describe("previewPrices", () => {
  it("prices the three typical configurations with the site's own functions", () => {
    const prices = previewPrices(SEED_CATALOG, PRICING);
    expect(prices.map((p) => p.label)).toEqual(PREVIEW_CONFIGS.map((p) => p.label));
    // Capitonat 160, A (the seed colour has no category), hb 120: 3000 × 1.05 = 3150, + lemn 0
    // Arcuit 180, hb 140: 3600 × 1.10 = 3960, + ladă 800 + LED 300 = 5060 → 5050
    // Lamele has no width in this grid.
    expect(prices.map((p) => p.price)).toEqual([3150, 5050, null]);
  });

  it("uses the colour's own category when the catalogue carries one", () => {
    const catalog: Catalog = {
      ...SEED_CATALOG,
      families: SEED_CATALOG.families.map((family) =>
        family.id === "catifea" ? { ...family, colors: family.colors.map((c) => ({ ...c, priceCategory: "C" as const })) } : family,
      ),
    };
    // 3000 × (1 + (20 + 5) / 100) = 3750
    expect(previewPrices(catalog, PRICING)[0].price).toBe(3750);
  });

  it("is all null without a grid", () => {
    expect(previewPrices(SEED_CATALOG, null).map((p) => p.price)).toEqual([null, null, null]);
  });

  it("leaves a line null when the catalogue no longer has its colour (the label names that colour)", () => {
    const catalog: Catalog = {
      ...SEED_CATALOG,
      families: SEED_CATALOG.families.map((family) =>
        family.id === "catifea" ? { ...family, colors: family.colors.filter((c) => c.id !== "ct-verde") } : family,
      ),
    };
    expect(previewPrices(catalog, PRICING)[0].price).toBeNull();
  });

  it("leaves a line null when the catalogue no longer has its model, family or base", () => {
    const noArcuit: Catalog = { ...SEED_CATALOG, models: SEED_CATALOG.models.filter((m) => m.id !== "arcuit") };
    expect(previewPrices(noArcuit, PRICING).map((p) => p.price)).toEqual([3150, null, null]);

    const noLada: Catalog = { ...SEED_CATALOG, bases: SEED_CATALOG.bases.filter((b) => b.id !== "lada") };
    expect(previewPrices(noLada, PRICING).map((p) => p.price)).toEqual([3150, null, null]);

    const noCatifea: Catalog = {
      ...SEED_CATALOG,
      models: SEED_CATALOG.models.map((m) => ({ ...m, families: m.families.filter((f) => f !== "catifea") })),
      families: SEED_CATALOG.families.filter((f) => f.id !== "catifea"),
    };
    expect(previewPrices(noCatifea, PRICING).map((p) => p.price)).toEqual([null, 5050, null]);
  });

  it("is all null, without throwing, for a catalogue resolve() cannot use", () => {
    const empty: Catalog = { models: [], families: [], bases: [] };
    expect(previewPrices(empty, PRICING).map((p) => p.price)).toEqual([null, null, null]);
  });
});
