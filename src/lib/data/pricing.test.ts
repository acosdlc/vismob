// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import type { Pricing } from "@/lib/configurator/pricing";

vi.mock("server-only", () => ({}));

// next/cache throws outside a Next render; the reader only needs the calls recorded.
const mocks = vi.hoisted(() => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
  /** What the `pricing` row query answers. null → the real createAdminClient() runs (and needs env). */
  row: null as { data: unknown; error: { message: string } | null } | null,
  queries: [] as { table: string; columns: string; filters: [column: string, value: unknown][] }[],
}));
vi.mock("next/cache", () => ({ cacheTag: mocks.cacheTag, cacheLife: mocks.cacheLife, revalidateTag: vi.fn() }));
vi.mock("@/lib/supabase/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/admin")>();
  return {
    createAdminClient: () => {
      const result = mocks.row;
      if (!result) return actual.createAdminClient();
      return {
        from: (table: string) => ({
          select: (columns: string) => {
            const query = { table, columns, filters: [] as [string, unknown][] };
            mocks.queries.push(query);
            const builder = {
              eq(column: string, value: unknown) {
                query.filters.push([column, value]);
                return builder;
              },
              maybeSingle: async () => result,
            };
            return builder;
          },
        }),
      };
    },
  };
});
vi.mock("@/lib/data/catalog", () => ({ getCatalog: async () => SEED_CATALOG }));

import { getPricing, getStartingPrices } from "./pricing";

// A fixture only (the style of src/lib/configurator/pricing.test.ts): the real grid arrives in PR-7.
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

const row = (data: unknown) => ({ data: data === null ? null : { data }, error: null });

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.row = null;
  mocks.queries.length = 0;
  mocks.cacheTag.mockClear();
  mocks.cacheLife.mockClear();
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getPricing", () => {
  it("reads pricing id=1 with the admin client and returns the validated grid under the pricing tag", async () => {
    mocks.row = row(PRICING);
    expect(await getPricing()).toEqual(PRICING);
    expect(mocks.queries).toEqual([{ table: "pricing", columns: "data", filters: [["id", 1]] }]);
    expect(mocks.cacheTag).toHaveBeenCalledWith("pricing");
    expect(mocks.cacheLife).toHaveBeenCalledWith("days");
    expect(errors).not.toHaveBeenCalled();
  });

  it("returns exactly the Pricing shape: keys the type does not have are dropped", async () => {
    mocks.row = row({ ...PRICING, note: "from the workshop", extras: { ...PRICING.extras, cover: 1 } });
    const pricing = await getPricing();
    expect(pricing).toEqual(PRICING);
    expect(pricing).not.toHaveProperty("note");
  });

  it("returns null and logs the issues for an invalid row", async () => {
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
    for (const data of invalid) {
      errors.mockClear();
      mocks.row = { data: { data }, error: null };
      expect(await getPricing()).toBeNull();
      expect(errors).toHaveBeenCalledTimes(1);
      expect(String(errors.mock.calls[0][0])).toContain("getPricing");
    }
  });

  it("returns null quietly when there is no row yet, cached for days", async () => {
    mocks.row = row(null);
    expect(await getPricing()).toBeNull();
    expect(errors).not.toHaveBeenCalled();
    expect(mocks.cacheLife).toHaveBeenCalledWith("days");
  });

  it("returns null and logs on a request error", async () => {
    mocks.row = { data: null, error: { message: "permission denied for table pricing" } };
    expect(await getPricing()).toBeNull();
    // An error is cached only minutes, so prices are not off for a day after a transient failure.
    expect(mocks.cacheLife).toHaveBeenCalledWith("minutes");
    expect(mocks.cacheLife).not.toHaveBeenCalledWith("days");
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0][0])).toContain("getPricing");
    expect(String(errors.mock.calls[0][1])).toContain("permission denied");
  });

  it("returns null and logs without the environment (no secret key, no URL)", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(await getPricing()).toBeNull();
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0][0])).toContain("getPricing");
    expect(String(errors.mock.calls[0][1])).toContain("Missing environment variable");
  });
});

describe("getStartingPrices", () => {
  it("is startingPrices(catalog, pricing) with a grid", async () => {
    mocks.row = row(PRICING);
    expect(await getStartingPrices()).toEqual({ capitonat: 3000, arcuit: 3200, canale: 3300 });
  });

  it("is empty without a grid", async () => {
    mocks.row = row(null);
    expect(await getStartingPrices()).toEqual({});
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    mocks.row = null;
    expect(await getStartingPrices()).toEqual({});
  });
});
