// @vitest-environment node
import { cacheLife, cacheTag } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSettings, settingsFromData } from "./settings";
import { SEED_SETTINGS } from "./settings.seed";

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

describe("settingsFromData", () => {
  it("merges a partial object over the seed", () => {
    const s = settingsFromData({ workshop_name: "Atelierul X", offer_days: "3", show_prices: true });
    expect(s).toEqual({ ...SEED_SETTINGS, workshop_name: "Atelierul X", offer_days: "3", show_prices: true });
  });

  it("keeps the seed for a value of the wrong type and ignores unknown keys", () => {
    const s = settingsFromData({ offer_days: 5, show_prices: "da", city: 12, unknown_key: "x", phone_public: null });
    expect(s).toEqual(SEED_SETTINGS);
    expect("unknown_key" in s).toBe(false);
  });

  it("returns the seed for null, a string or an array", () => {
    expect(settingsFromData(null)).toEqual(SEED_SETTINGS);
    expect(settingsFromData("x")).toEqual(SEED_SETTINGS);
    expect(settingsFromData([])).toEqual(SEED_SETTINGS);
  });

  it("never mutates the seed", () => {
    const before = { ...SEED_SETTINGS };
    settingsFromData({ workshop_name: "Atelierul X" });
    expect(SEED_SETTINGS).toEqual(before);
  });
});

describe("getSettings", () => {
  it("reads row 1, merges it over the seed and caches it for days under the settings tag", async () => {
    state.tables.settings = { data: [{ data: { workshop_name: "Atelierul X", show_prices: true } }], error: null };
    const s = await getSettings();
    expect(s.workshop_name).toBe("Atelierul X");
    expect(s.show_prices).toBe(true);
    expect(s.city).toBe(SEED_SETTINGS.city);
    expect(cacheTag).toHaveBeenCalledWith("settings");
    expect(cacheLife).toHaveBeenCalledWith("days");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("serves the seed, briefly cached, when the client cannot be created (missing env)", async () => {
    state.clientError = new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL");
    expect(await getSettings()).toBe(SEED_SETTINGS);
    expect(cacheLife).toHaveBeenCalledWith("minutes");
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.error).mock.calls[0][0]).toMatch(/getSettings.*NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("serves the seed on an API error", async () => {
    state.tables.settings = { data: null, error: { message: "permission denied" } };
    expect(await getSettings()).toBe(SEED_SETTINGS);
    expect(cacheLife).toHaveBeenCalledWith("minutes");
    expect(vi.mocked(console.error).mock.calls[0][0]).toMatch(/permission denied/);
  });

  it("throws instead of serving the seed in production (docs/PLAN.md, principle 3)", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    state.clientError = new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL");
    await expect(getSettings()).rejects.toThrow("getSettings: Missing environment variable");
    vi.unstubAllEnvs();
  });

  it("serves the seed when row 1 is missing", async () => {
    state.tables.settings = { data: [], error: null };
    expect(await getSettings()).toBe(SEED_SETTINGS);
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
