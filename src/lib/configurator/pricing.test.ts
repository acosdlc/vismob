// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, SEED_CATALOG } from "./catalog.seed";
import { estimatePrice, priceFor, startingPrices, type Pricing } from "./pricing";
import { resolve } from "./rules";
import type { Config } from "./types";

// A fixture only: the workshop's real grid arrives in PR-7 and is never in the code.
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

const res = (patch: Partial<Config> = {}) => resolve({ ...DEFAULT_CONFIG, ...patch }, SEED_CATALOG);

describe("estimatePrice", () => {
  it("prices the default configuration from the grid row and the headboard markup", () => {
    // 3000 × 1.05 = 3150
    expect(estimatePrice(res(), PRICING, "A")).toBe(3150);
  });

  it("applies the category percentage", () => {
    expect(estimatePrice(res({ hb: 100 }), PRICING, "A")).toBe(3000);
    expect(estimatePrice(res({ hb: 100 }), PRICING, "B")).toBe(3300);
    expect(estimatePrice(res({ hb: 100 }), PRICING, "C")).toBe(3600);
  });

  it("adds the percentages before applying them", () => {
    // 3000 × (1 + (20 + 10) / 100) = 3900
    expect(estimatePrice(res({ hb: 140 }), PRICING, "C")).toBe(3900);
  });

  it("adds the base and the extras in lei, after the percentage", () => {
    expect(estimatePrice(res({ hb: 100, base: "lada" }), PRICING, "A")).toBe(3800);
    expect(estimatePrice(res({ hb: 100, led: true }), PRICING, "A")).toBe(3300);
    expect(estimatePrice(res({ hb: 100, nightstands: true }), PRICING, "A")).toBe(4200);
    // 3000 × 1.20 + 600 + 300 + 1200 = 5700
    expect(estimatePrice(res({ hb: 100, base: "sertare", led: true, nightstands: true }), PRICING, "C")).toBe(5700);
  });

  it("a custom width rounds up to the next grid width and adds customPct", () => {
    // 150 → 160: 3000 × (1 + (0 + 0 + 15) / 100) = 3450
    expect(estimatePrice(res({ size: "custom", customW: 150, hb: 100 }), PRICING, "A")).toBe(3450);
    // 170 → 180: 3400 × 1.15 = 3910 → 3900
    expect(estimatePrice(res({ size: "custom", customW: 170, hb: 100 }), PRICING, "A")).toBe(3900);
    // 161 → 180, not 160
    expect(estimatePrice(res({ size: "custom", customW: 161, hb: 100 }), PRICING, "A")).toBe(3900);
    // an exact grid width uses its own row
    expect(estimatePrice(res({ size: "custom", customW: 180, hb: 100 }), PRICING, "A")).toBe(3900);
  });

  it("a width above the grid uses the last grid width", () => {
    // 220 → 200: 3800 × 1.15 = 4370 → 4350
    expect(estimatePrice(res({ size: "custom", customW: 220, hb: 100 }), PRICING, "A")).toBe(4350);
    // arcuit's grid stops at 180: a standard 200 uses the 180 row (no customPct)
    expect(estimatePrice(res({ model: "arcuit", size: "200", hb: 100 }), PRICING, "A")).toBe(3600);
  });

  it("rounds to roundTo", () => {
    // 2800 × 1.10 = 3080 → 3100
    expect(estimatePrice(res({ size: "140", hb: 100 }), PRICING, "B")).toBe(3100);
    // 3000 × 1.05 + 100 = 3250 is already a multiple
    expect(estimatePrice(res({ base: "metal" }), PRICING, "A")).toBe(3250);
    // 2800 × 1.05 + 100 = 3040 → 3050
    expect(estimatePrice(res({ size: "140", base: "metal" }), PRICING, "A")).toBe(3050);
    expect(estimatePrice(res({ size: "140", hb: 100 }), { ...PRICING, roundTo: 100 }, "B")).toBe(3100);
    expect(estimatePrice(res({ size: "140", hb: 100 }), { ...PRICING, roundTo: 10 }, "B")).toBe(3080);
  });

  it("returns null when the model has no grid row", () => {
    const lamele = res({ model: "lamele", family: "lemn", color: "lm-stejar" });
    expect(estimatePrice(lamele, PRICING, "A")).toBeNull();
    const missing = { ...PRICING, grid: { capitonat: PRICING.grid.capitonat } as Pricing["grid"] };
    expect(estimatePrice(res({ model: "canale" }), missing, "A")).toBeNull();
  });
});

describe("priceFor", () => {
  it("returns null without a grid and estimatePrice's result with one", () => {
    expect(priceFor(res(), null)).toBeNull();
    expect(priceFor(res(), PRICING)).toBe(3150);
    expect(priceFor(res({ model: "lamele", family: "lemn", color: "lm-stejar" }), PRICING)).toBeNull();
  });

  it("uses the colour's price category, A when the catalog gives none", () => {
    const r = res({ hb: 100 });
    expect(r.color.priceCategory).toBeUndefined();
    expect(priceFor(r, PRICING)).toBe(3000);
    const catB = { ...r, color: { ...r.color, priceCategory: "B" as const } };
    expect(priceFor(catB, PRICING)).toBe(3300);
  });
});

describe("startingPrices", () => {
  it("is the cheapest 160 × 200 in category A, no extras, over every base and headboard height", () => {
    // capitonat 3000 × 1.00 + 0 (H100, picioare din lemn); arcuit 3200; canale 3300; lamele has no row
    expect(startingPrices(SEED_CATALOG, PRICING)).toEqual({ capitonat: 3000, arcuit: 3200, canale: 3300 });
  });

  it("takes the minimum over bases and heights, not the default configuration", () => {
    // lemn is no longer free, so metal (100) wins; 120 becomes the cheapest height
    const p: Pricing = {
      ...PRICING,
      base: { lemn: 500, metal: 100, lada: 800, sertare: 600 },
      hbPct: { "100": 10, "120": 0, "140": 5 },
    };
    expect(startingPrices(SEED_CATALOG, p).capitonat).toBe(3100);
    expect(estimatePrice(res({ hb: 120, base: "metal" }), p, "A")).toBe(3100);
    expect(estimatePrice(res(), p, "A")).toBe(3500);
  });

  it("uses category A whatever the category of the first colour", () => {
    const catC = {
      ...SEED_CATALOG,
      families: SEED_CATALOG.families.map((f) => ({
        ...f,
        colors: f.colors.map((c) => ({ ...c, priceCategory: "C" as const })),
      })),
    };
    expect(startingPrices(catC, PRICING)).toEqual({ capitonat: 3000, arcuit: 3200, canale: 3300 });
  });

  it("rounds like the ticket", () => {
    // 3000 × 1.00 + 0 = 3000 stays; with a 30 lei base every base costs → 3030 → 3050
    const p: Pricing = { ...PRICING, base: { lemn: 30, metal: 30, lada: 30, sertare: 30 } };
    expect(startingPrices(SEED_CATALOG, p).capitonat).toBe(3050);
  });

  it("leaves out what cannot be priced: no grid row, no colours in the first family, no bases", () => {
    expect(startingPrices(SEED_CATALOG, PRICING).lamele).toBeUndefined();
    // catifea is the first family of the three upholstered models
    const noColors = {
      ...SEED_CATALOG,
      families: SEED_CATALOG.families.map((f) => (f.id === "catifea" ? { ...f, colors: [] } : f)),
    };
    expect(startingPrices(noColors, PRICING)).toEqual({});
    expect(startingPrices({ ...SEED_CATALOG, bases: [] }, PRICING)).toEqual({});
  });
});
