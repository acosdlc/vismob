// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, HEIGHTS, SEED_CATALOG, SIZES } from "./catalog.seed";
import { priceFor, type Pricing } from "./pricing";
import {
  LEI_CEILING,
  LEI_FLOOR,
  PERCENT_CEILING,
  PREVIEW_CONFIGS,
  PRICING_FIELD_ORDER,
  PRICING_FIELDS,
  PRICING_MESSAGES,
  PRICING_WIDTHS,
  ROUND_CEILING,
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

  it("says under an amount above its ceiling which ceiling it passed, with the figure of the constant", () => {
    // The figures are decisions, pinned here. 100 000 lei is loose on purpose: no document
    // gives a price range, and a real price refused would block the workshop.
    expect({ lei: LEI_CEILING, percent: PERCENT_CEILING, roundTo: ROUND_CEILING }).toEqual({ lei: 100_000, percent: 1_000, roundTo: 1_000 });
    expect(PRICING_MESSAGES.ceiling).toBe("Preț peste 100000 lei. Verifică suma: poate are cifre în plus.");
    expect(PRICING_MESSAGES.percentCeiling).toBe("Procent peste 1000. Verifică numărul.");
    expect(PRICING_MESSAGES.roundCeiling).toBe("Pas de rotunjire peste 1000 lei. Scrie un pas mai mic, de exemplu 50.");
    // Built from the constants, like the floor's: a ceiling that moves takes its sentence along.
    expect(PRICING_MESSAGES.ceiling).toContain(`peste ${LEI_CEILING} lei`);
    expect(PRICING_MESSAGES.percentCeiling).toContain(`peste ${PERCENT_CEILING}.`);
    expect(PRICING_MESSAGES.roundCeiling).toContain(`peste ${ROUND_CEILING} lei`);
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

  it("reads a decimal comma as the decimal point: the fields ask for the decimal keypad, which offers the comma", () => {
    // „17,5” is how a percentage is written in Romanian and what the decimal keypad of a phone
    // set to Romanian types; the Excel import already reads it so (numberText in
    // scripts/catalog-workbook.ts). The form answered „Scrie un număr.” under each of these.
    const fd = formFor(PRICING, {
      "categoryPct.C": "17,5",
      "grid.capitonat.160": " 3650,50 ",
      "extras.led": "99,5",
      customPct: "12,5",
    });
    expect(parsePricingForm(fd)).toEqual({
      ok: true,
      data: {
        ...PRICING,
        grid: { ...PRICING.grid, capitonat: { ...PRICING.grid.capitonat, "160": 3650.5 } },
        categoryPct: { ...PRICING.categoryPct, C: 17.5 },
        extras: { ...PRICING.extras, led: 99.5 },
        customPct: 12.5,
      },
    });
    expect(fieldsUnderLeiFloor(fd)).toEqual([]);

    // The same number whichever mark it is typed with, so the form's preview (previewPrices
    // over this parser's output) follows a comma as it follows a point.
    const typed = (mark: string) => parsePricingForm(formFor(PRICING, { "hbPct.120": `5${mark}9`, "base.metal": `99${mark}5` }));
    const comma = typed(",");
    expect(comma).toEqual(typed("."));
    // Tăblie 120 → 5,9 %: 3000 × 1.059 = 3177, rounded to 3200 (3150 with the fixture's 5 %).
    expect(comma.ok && previewPrices(SEED_CATALOG, comma.data)[0].price).toBe(3200);

    // One mark only, with digits on both sides; the rounding step stays a whole number.
    for (const text of ["1.750,5", "1,750.5", "17,5,5", ",5", "17,", "17 ,5", "17,5%"]) {
      expect(parsePricingForm(formFor(PRICING, { "categoryPct.C": text })), text).toEqual({
        ok: false,
        fieldErrors: { "categoryPct.C": PRICING_MESSAGES.number },
      });
    }
    expect(parsePricingForm(formFor(PRICING, { roundTo: "50,5" }))).toEqual({
      ok: false,
      fieldErrors: { roundTo: PRICING_MESSAGES.number },
    });
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

describe("parsePricingForm: the ceilings", () => {
  /** The ceiling an input is held to and the sentence under it, by the input's name: the rounding step, a percentage, otherwise lei. */
  const ceilingOf = (name: string) =>
    name === "roundTo"
      ? { max: ROUND_CEILING, message: PRICING_MESSAGES.roundCeiling }
      : /^(categoryPct|hbPct)\.|^customPct$/.test(name)
        ? { max: PERCENT_CEILING, message: PRICING_MESSAGES.percentCeiling }
        : { max: LEI_CEILING, message: PRICING_MESSAGES.ceiling };

  it("refuses a lei amount above the ceiling, keyed by the input: a pasted number, a stuck key, digits without end", () => {
    // Twenty nines in a cell were saved under „Salvat.” as 100000000000000000000 and printed on
    // the site; from then on every request for that bed failed with „Nu am putut trimite
    // cererea”: leads.price_estimate_ron is an int. A mobile number pasted into a cell
    // (0740123456) was a price too.
    const ceiling = "Preț peste 100000 lei. Verifică suma: poate are cifre în plus.";
    for (const typed of ["100000.01", "100000,01", "100001", "0740123456", "2147483648", "9".repeat(20), "9".repeat(400)]) {
      for (const name of ["grid.capitonat.160", "grid.lamele.90", "base.lada", "extras.led", "extras.nightstands"]) {
        const fd = formFor(PRICING, { [name]: typed });
        expect(parsePricingForm(fd), `${name} = ${typed.slice(0, 24)}`).toEqual({ ok: false, fieldErrors: { [name]: ceiling } });
        // savePricing lays the floor's sentence over the parser's: it must not land on this input.
        expect(fieldsUnderLeiFloor(fd), `${name} = ${typed.slice(0, 24)}`).toEqual([]);
      }
    }

    // The ceiling itself is a price, and so is everything under it.
    const atCeiling = parsePricingForm(
      formFor(PRICING, { "grid.capitonat.200": "100000", "base.sertare": " 100000.00 ", "extras.led": "99999,99" }),
    );
    expect(atCeiling.ok && [atCeiling.data.grid.capitonat["200"], atCeiling.data.base.sertare, atCeiling.data.extras.led]).toEqual([
      100000, 100000, 99999.99,
    ]);

    // Far above any bed price on purpose: the ceiling does not judge a price. A zero too many
    // (36500 for 3650) is under it and still parses; the preview and the site are where it shows.
    const zeroTooMany = parsePricingForm(formFor(PRICING, { "grid.capitonat.160": "36500" }));
    expect(zeroTooMany.ok && zeroTooMany.data.grid.capitonat["160"]).toBe(36500);
  });

  it("refuses a percentage or a rounding step far above any real one, each with its own sentence", () => {
    // +99999999999999999999 % was saved; a rounding step of 10000 printed „0 lei” for every bed under 5000 lei.
    for (const name of ["categoryPct.C", "hbPct.140", "customPct"]) {
      for (const typed of ["1000.5", "1000,5", "1001", "1750", "9".repeat(20)]) {
        expect(parsePricingForm(formFor(PRICING, { [name]: typed })), `${name} = ${typed}`).toEqual({
          ok: false,
          fieldErrors: { [name]: "Procent peste 1000. Verifică numărul." },
        });
      }
    }
    for (const typed of ["1001", "10000", "9".repeat(20)]) {
      expect(parsePricingForm(formFor(PRICING, { roundTo: typed })), `roundTo = ${typed}`).toEqual({
        ok: false,
        fieldErrors: { roundTo: "Pas de rotunjire peste 1000 lei. Scrie un pas mai mic, de exemplu 50." },
      });
    }
    const atCeiling = parsePricingForm(formFor(PRICING, { "categoryPct.C": "1000", "hbPct.140": "999,5", customPct: "17.5", roundTo: "1000" }));
    expect(atCeiling.ok && [atCeiling.data.categoryPct.C, atCeiling.data.hbPct["140"], atCeiling.data.customPct, atCeiling.data.roundTo]).toEqual([
      1000, 999.5, 17.5, 1000,
    ]);
  });

  it("holds every one of the 38 inputs to its ceiling: digits without end are refused under the input, the ceiling itself is not", () => {
    for (const name of PRICING_FIELD_ORDER) {
      const { max, message } = ceilingOf(name);
      expect(parsePricingForm(formFor(PRICING, { [name]: "9".repeat(20) })), `${name}: twenty nines`).toEqual({
        ok: false,
        fieldErrors: { [name]: message },
      });
      expect(parsePricingForm(formFor(PRICING, { [name]: String(max + 1) })), `${name} = ${max + 1}`).toEqual({
        ok: false,
        fieldErrors: { [name]: message },
      });
      expect(parsePricingForm(formFor(PRICING, { [name]: String(max) })).ok, `${name} = ${max}`).toBe(true);
    }
  });

  it("never hands over a number JSON cannot write: 309 digits and more parse as Infinity", () => {
    // Infinity is `null` in the JSON the row is sent as. The stored grid then fails
    // pricingSchema: the site drops every price and the form opens empty, under „Grila
    // salvată nu e validă; completează-o din nou.”, after a save that answered „Salvat.”.
    const digits = "9".repeat(309);
    expect(Number(digits)).toBe(Infinity);
    expect(JSON.stringify({ lei: Number(digits) })).toBe('{"lei":null}');
    const accepted = PRICING_FIELD_ORDER.filter((name) => parsePricingForm(formFor(PRICING, { [name]: digits })).ok);
    expect(accepted).toEqual([]);
  });

  it("cannot price a bed above what leads.price_estimate_ron holds: with every input at its ceiling the dearest bed fits a Postgres integer", () => {
    const POSTGRES_INT_MAX = 2_147_483_647;
    const price = (config: Config, pricing: Pricing) => priceFor(resolve(config, SEED_CATALOG), pricing) ?? 0;

    // What the form let through: twenty nines in one cell priced the default bed at 1.05e20 lei,
    // and submitQuote stores the price it computes whatever the visitor's page showed.
    const reported = parsePricingForm(formFor(PRICING, { "grid.capitonat.160": "9".repeat(20) }));
    expect(reported.ok && price(DEFAULT_CONFIG, reported.data) > POSTGRES_INT_MAX).toBe(false);

    // Every input at its ceiling (the test above: none goes over it). A price only grows with a
    // cell, a markup, a base or an extra (estimatePrice), so no form the parser accepts prices
    // a bed higher than this one does.
    const ceilings = Object.fromEntries(PRICING_FIELD_ORDER.map((name) => [name, String(ceilingOf(name).max)]));
    const atCeilings = (roundTo: number): Pricing => {
      const parsed = parsePricingForm(formFor(PRICING, { ...ceilings, roundTo: String(roundTo) }));
      if (!parsed.ok) throw new Error(`the ceilings must parse (rounding step ${roundTo})`);
      return parsed.data;
    };

    // Every configuration the seed catalogue offers, priced with a step of 1 lei (no rounding):
    // the dearest takes every markup and both extras, a non-standard size with LED and nightstands.
    const sizes: Config["size"][] = [...SIZES, "custom"];
    const configs: Config[] = SEED_CATALOG.models.flatMap((model) =>
      SEED_CATALOG.bases.flatMap((base) =>
        HEIGHTS.flatMap((hb) =>
          sizes.flatMap((size) =>
            [false, true].flatMap((led) =>
              [false, true].map((nightstands) => ({ ...DEFAULT_CONFIG, model: model.id, base: base.id, hb, size, led, nightstands })),
            ),
          ),
        ),
      ),
    );
    const dearest: Config = { ...DEFAULT_CONFIG, size: "custom", led: true, nightstands: true };
    const unrounded = atCeilings(1);
    // 100 000 × (1 + 3 × 1000 / 100) + a base, LED and nightstands at 100 000 each.
    expect(price(dearest, unrounded)).toBe(3_400_000);
    expect(Math.max(...configs.map((config) => price(config, unrounded)))).toBe(3_400_000);

    // Rounding moves a price by up to half a step, either way and not evenly: every whole
    // step the form accepts is tried. A whole step also keeps the price a whole number,
    // which the column needs as much as the size.
    let largest = { lei: 0, roundTo: 0 };
    const fractional: number[] = [];
    for (let roundTo = 1; roundTo <= ROUND_CEILING; roundTo += 1) {
      const lei = price(dearest, atCeilings(roundTo));
      if (!Number.isInteger(lei)) fractional.push(roundTo);
      if (lei > largest.lei) largest = { lei, roundTo };
    }
    expect(fractional).toEqual([]);
    expect(largest).toEqual({ lei: 3_400_474, roundTo: 994 });
    expect(largest.lei).toBeLessThanOrEqual(POSTGRES_INT_MAX);
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

  it("takes a comma between thousands for the same slip as a point", () => {
    // With the comma read as the decimal mark, "3,450" is 3.45 lei and "1,200" under a base or
    // an extra is 1.2 lei to the parser, exactly as "3.450" and "1.200" are: they must not be
    // saved under „Salvat.” either.
    const fd = formFor(PRICING, {
      "grid.capitonat.160": "3,450",
      "base.lada": "1,200",
      "extras.nightstands": " 12,500 ",
      // The shape of the slip, but a percentage: 1.25 %, left alone like "1.250".
      "hbPct.120": "1,250",
    });
    const parsed = parsePricingForm(fd);
    expect(
      parsed.ok && [parsed.data.grid.capitonat["160"], parsed.data.base.lada, parsed.data.extras.nightstands, parsed.data.hbPct["120"]],
    ).toEqual([3.45, 1.2, 12.5, 1.25]);
    expect(fieldsUnderLeiFloor(fd)).toEqual(["grid.capitonat.160", "base.lada", "extras.nightstands"]);

    // The largest text of that shape is far under the ceiling, so the parser never refuses
    // a slip: the floor's sentence is the only one under it.
    for (const slip of ["999,999", "999.999"]) {
      const largest = formFor(PRICING, { "base.metal": slip, "extras.led": slip });
      expect(parsePricingForm(largest).ok, slip).toBe(true);
      expect(fieldsUnderLeiFloor(largest), slip).toEqual(["base.metal", "extras.led"]);
    }

    // A comma before one, two or four decimals is an amount, as with a point.
    for (const value of ["1,2", "1,20", "1,2000", "1200,50"]) {
      const real = formFor(PRICING, { "base.metal": value, "extras.led": value });
      expect(parsePricingForm(real).ok, value).toBe(true);
      expect(fieldsUnderLeiFloor(real), value).toEqual([]);
    }
  });

  it("gives a text typed with a comma the answer of the same text typed with a point, in every kind of input", () => {
    // The comma opens nothing the point did not: a number, the floor's sentence or a refusal,
    // whatever the point gets. "125,000" is in the list for that reason: in a cell it is 125 lei,
    // not under the floor, and it parses unflagged exactly as "125.000" does (a cell is held to
    // the size of the amount, not to the shape of the slip).
    for (const text of ["3,450", "1,200", "12,500", "125,000", "999,999", "0,5", "17,5", "3450,50", "1,2000", "100000,01", ",5", "5,"]) {
      for (const name of ["grid.capitonat.160", "base.lada", "extras.led", "categoryPct.C", "customPct", "roundTo"]) {
        const comma = formFor(PRICING, { [name]: text });
        const point = formFor(PRICING, { [name]: text.replace(",", ".") });
        expect(parsePricingForm(comma), `${name} = ${text}`).toEqual(parsePricingForm(point));
        expect(fieldsUnderLeiFloor(comma), `${name} = ${text}`).toEqual(fieldsUnderLeiFloor(point));
      }
    }
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
