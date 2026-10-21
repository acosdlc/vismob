// @vitest-environment node
import { cacheLife, cacheTag } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getReviews, type ReviewRow, reviewsFromRows } from "./reviews";
import { SEED_REVIEWS } from "./reviews.seed";

interface Result {
  data: unknown;
  error: { message: string } | null;
}

const state = vi.hoisted(() => ({
  tables: {} as Record<string, { data: unknown; error: { message: string } | null }>,
  clientError: null as Error | null,
}));

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => {
    if (state.clientError) throw state.clientError;
    return { from: (table: string) => query(state.tables[table] ?? { data: [], error: null }) };
  },
}));

// A fake of the PostgREST builder: every filter returns the builder, awaiting it
// (or maybeSingle()) resolves to the table's { data, error }.
function query(result: Result) {
  const q = {
    select: () => q,
    eq: () => q,
    order: () => q,
    maybeSingle: async () => ({ ...result, data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data }),
    then: <R>(onOk: (value: Result) => R, onErr?: (reason: unknown) => R) => Promise.resolve(result).then(onOk, onErr),
  };
  return q;
}

const ROWS: ReviewRow[] = [
  { id: "b", first_name: "Ioana", city: "Brașov", body: "Patul a ajuns exact cum l-am configurat.", model_label: "Arcuit · 160 × 200", sort: 1 },
  { id: "a", first_name: "Andrei", city: null, body: "Lucrare curată, montaj rapid.", model_label: null, sort: 0 },
];

beforeEach(() => {
  state.tables = {};
  state.clientError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(cacheTag).mockClear();
  vi.mocked(cacheLife).mockClear();
});

describe("reviewsFromRows", () => {
  it("maps the rows in sort order, with empty strings for a missing city or model", () => {
    expect(reviewsFromRows(ROWS)).toEqual([
      { name: "Andrei", city: "", body: "Lucrare curată, montaj rapid.", modelLabel: "" },
      { name: "Ioana", city: "Brașov", body: "Patul a ajuns exact cum l-am configurat.", modelLabel: "Arcuit · 160 × 200" },
    ]);
  });

  it("maps nothing to nothing", () => {
    expect(reviewsFromRows([])).toEqual([]);
  });
});

describe("getReviews", () => {
  it("reads the published reviews, cached for days under the reviews tag", async () => {
    state.tables.reviews = { data: ROWS, error: null };
    expect((await getReviews()).map((r) => r.name)).toEqual(["Andrei", "Ioana"]);
    expect(cacheTag).toHaveBeenCalledWith("reviews");
    expect(cacheLife).toHaveBeenCalledWith("days");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("returns nothing, not the seed, when the database has no published reviews", async () => {
    state.tables.reviews = { data: [], error: null };
    expect(await getReviews()).toEqual([]);
    expect(cacheLife).toHaveBeenCalledWith("days");
  });

  it("serves the seed, briefly cached, when the client cannot be created (missing env)", async () => {
    state.clientError = new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL");
    expect(await getReviews()).toBe(SEED_REVIEWS);
    expect(cacheLife).toHaveBeenCalledWith("minutes");
    expect(vi.mocked(console.error).mock.calls[0][0]).toMatch(/getReviews.*NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("serves the seed on an API error", async () => {
    state.tables.reviews = { data: null, error: { message: "permission denied" } };
    expect(await getReviews()).toBe(SEED_REVIEWS);
    expect(vi.mocked(console.error).mock.calls[0][0]).toMatch(/permission denied/);
  });
});
