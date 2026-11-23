// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, SEED_CATALOG } from "./catalog.seed";
import { priceFor, type Pricing } from "./pricing";
import {
  LEI_FLOOR,
  PREVIEW_CONFIGS,
  PRICING_FIELD_ORDER,
  PRICING_FIELDS,
  PRICING_MESSAGES,
  PRICING_WIDTHS,
  fieldsUnderLeiFloor,
  parsePricingForm,
  previewPrices,
  pricingSchema,
} from "./pricing-schema";
import { resolve } from "./rules";
import type { Catalog, Config } from "./types";

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

describe("PRICING_MESSAGES", () => {
  it("says above the grid what an empty cell does, and under a refused amount how to write thousands", () => {
    // An empty cell does not take the width out of the configurator (StepSize offers every
    // SIZES width) and estimatePrice() prices it from another cell, also when no wider cell
    // is filled: the hint must not promise otherwise, nor stop at the first of the two cases.
    expect(PRICING_MESSAGES.grid).toBe(
      "Scrie prețul în lei pentru fiecare lățime, fără punct la mii: 3450, nu 3.450. O celulă goală nu scoate lățimea din configurator: patul ia prețul următoarei lățimi completate sau, dacă nu e niciuna mai lată, al celei mai late completate.",
    );
    expect(PRICING_MESSAGES.floor).toBe("Preț sub 100 lei. Scrie suma fără punct la mii: 3450, nu 3.450.");
    expect(PRICING_MESSAGES.floor).toContain(`sub ${LEI_FLOOR} lei`);
  });

  it("is true to the site: a width with an empty cell is still priced, with the next filled width of its row or, with none wider, the widest filled one", () => {
    // The fixture's Arcuit row has prices at 160 and 180 only. Category A, headboard 100
    // and wooden legs add nothing, so each price below is a grid cell as it is.
    const parsed = parsePricingForm(formFor(PRICING));
    if (!parsed.ok) throw new Error("the fixture must parse");
    const arcuit = (size: Config["size"]) => {
      const config: Config = { ...DEFAULT_CONFIG, model: "arcuit", size, family: "boucle", color: "bc-alb", hb: 100, base: "lemn" };
      return priceFor(resolve(config, SEED_CATALOG), parsed.data);
    };
    expect([arcuit("160"), arcuit("180")]).toEqual([3200, 3600]);
    expect([arcuit("90"), arcuit("120"), arcuit("140")]).toEqual([3200, 3200, 3200]);
    // No filled width after 200: estimatePrice() falls back to the widest one, a narrower bed's
    // price. The second half of the hint's sentence says so.
    expect(arcuit("200")).toBe(3600);
  });
});

describe("parsePricingForm", () => {
  it("reads a sparse grid: an empty cell is left out of its row, a model may have none", () => {
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

describe("fieldsUnderLeiFloor", () => {
  it("flags a grid cell, a base and an extra typed with a point between thousands, by input name and in form order", () => {
    // The panel prints „3.450 lei”; typed back, "3.450" is a number to the parser: 3.45 lei.
    const fd = formFor(PRICING, {
      "extras.nightstands": "1.200",
      "extras.led": " 1.300 ",
      "base.lada": "1.200",
      "grid.arcuit.180": " 3.600 ",
      "grid.capitonat.160": "3.450",
    });
    const parsed = parsePricingForm(fd);
    expect(parsed.ok && parsed.data.grid.capitonat["160"]).toBe(3.45);
    // What the two extras were saved as, under „Salvat.”, while only the grid and the bases were checked.
    expect(parsed.ok && parsed.data.extras).toEqual({ led: 1.3, nightstands: 1.2 });
    expect(fieldsUnderLeiFloor(fd)).toEqual([
      "grid.capitonat.160",
      "grid.arcuit.180",
      "base.lada",
      "extras.led",
      "extras.nightstands",
    ]);
  });

  it("holds a grid cell to the floor: every amount above zero and under it, whatever its decimals", () => {
    // No bed costs under 100 lei, so in the grid the size of the amount is enough to tell the slip.
    const fd = formFor(PRICING, { "grid.capitonat.90": "0.5", "grid.arcuit.160": "50", "grid.canale.160": "99.99" });
    expect(fieldsUnderLeiFloor(fd)).toEqual(["grid.capitonat.90", "grid.arcuit.160", "grid.canale.160"]);
  });

  it("holds a base and an extra to the shape of the slip only: under the floor they may be real amounts", () => {
    // Metal legs for 50 lei more are a price, not a slip: here the size cannot tell the two apart.
    const real = formFor(PRICING, {
      "base.metal": "50",
      "base.lada": "99.5",
      "base.sertare": "0.5",
      "extras.led": "50",
      "extras.nightstands": "99",
    });
    expect(parsePricingForm(real).ok).toBe(true);
    expect(fieldsUnderLeiFloor(real)).toEqual([]);

    // One to three digits, a point and exactly three digits: „1.200 lei” as the panel prints it, typed back.
    for (const slip of ["1.200", "12.500", "125.000", " 1.200 "]) {
      const fd = formFor(PRICING, { "base.metal": slip, "extras.nightstands": slip });
      expect(fieldsUnderLeiFloor(fd), slip).toEqual(["base.metal", "extras.nightstands"]);
    }
    // Decimals that are no group of thousands, and more than three digits before the point.
    for (const value of ["1.2", "1.20", "1.2000", "1200.000", "1200.50", "1200"]) {
      const fd = formFor(PRICING, { "base.metal": value, "extras.nightstands": value });
      expect(parsePricingForm(fd).ok, value).toBe(true);
      expect(fieldsUnderLeiFloor(fd), value).toEqual([]);
    }
  });

  it("passes 0 for a base, the floor itself, a price with decimals and an empty cell", () => {
    expect(LEI_FLOOR).toBe(100);
    expect(fieldsUnderLeiFloor(formFor(PRICING))).toEqual([]);
    const fd = formFor(PRICING, {
      "base.lemn": "0",
      "base.metal": "100",
      "grid.capitonat.90": "100",
      "grid.capitonat.160": "3450.50",
      "grid.arcuit.90": "",
    });
    expect(parsePricingForm(fd).ok).toBe(true);
    expect(fieldsUnderLeiFloor(fd)).toEqual([]);
  });

  it("leaves the percentages and the rounding step alone, whatever they hold, and inputs it does not know", () => {
    const fd = formFor(PRICING, {
      "categoryPct.B": "10",
      // The shape of the slip, but a percentage: the message speaks of a price in lei.
      "hbPct.120": "1.250",
      customPct: "15",
      roundTo: "50",
      "grid.pat5.160": "9",
      "base.altceva": "1.200",
      "extras.altceva": "1.200",
    });
    expect(parsePricingForm(fd).ok).toBe(true);
    expect(fieldsUnderLeiFloor(fd)).toEqual([]);
  });

  it("flags them in a post the parser refuses too, and never an input the parser already refused", () => {
    const fd = formFor(PRICING, {
      "grid.arcuit.160": "3.200",
      "grid.capitonat.160": "3.450,50", // not a number
      "grid.canale.160": "0", // not above zero
      "base.lada": "-800", // negative
      "extras.led": "1.300,50", // not a number
      "extras.nightstands": "1.200",
      roundTo: "",
    });
    fd.delete("base.metal"); // not posted
    const parsed = parsePricingForm(fd);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(Object.keys(parsed.fieldErrors).sort()).toEqual([
      "base.lada",
      "base.metal",
      "extras.led",
      "grid.canale.160",
      "grid.capitonat.160",
      "roundTo",
    ]);
    expect(fieldsUnderLeiFloor(fd)).toEqual(["grid.arcuit.160", "extras.nightstands"]);
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
