// @vitest-environment node
import { cacheLife, cacheTag } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import type { Catalog } from "@/lib/configurator/types";
import {
  type BaseRow,
  type CatalogRows,
  catalogFromRows,
  type FamilyRow,
  getCatalog,
  isBaseId,
  isFamilyId,
  isModelId,
  type MaterialRow,
  type ModelRow,
} from "./catalog";

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

// The rows of supabase/migrations/20261014152142_seed_content.sql, which was
// generated from SEED_CATALOG: the same lists, `sort` = position, no photos.
function seedRows(): CatalogRows {
  return {
    models: SEED_CATALOG.models.map((m, sort) => ({
      id: m.id,
      name: m.name,
      note: m.note,
      code: m.code,
      description: null,
      sort,
    })),
    families: SEED_CATALOG.families.map((f, sort) => ({
      id: f.id,
      name: f.name,
      code: f.code,
      tab: f.tab,
      description: f.description ?? null,
      specs: (f.specs ?? []).map((s) => ({ ...s })),
      sort,
    })),
    materials: SEED_CATALOG.families.flatMap((f) =>
      f.colors.map((c, sort) => ({
        id: c.id,
        family_id: f.id,
        name: c.name,
        code: c.code,
        hex: c.hex,
        price_category: "A",
        supplier_code: null,
        featured: c.featured === true,
        photo_path: null,
        sort,
      })),
    ),
    modelFamilies: SEED_CATALOG.models.flatMap((m) => m.families.map((family_id) => ({ model_id: m.id, family_id }))),
    bases: SEED_CATALOG.bases.map((b, sort) => ({ id: b.id, name: b.name, note: b.note, code: b.code, photo_path: null, sort })),
  };
}

// The seed, plus the `price_category` default ('A') every materials row carries.
const EXPECTED: Catalog = {
  ...SEED_CATALOG,
  families: SEED_CATALOG.families.map((f) => ({ ...f, colors: f.colors.map((c) => ({ ...c, priceCategory: "A" })) })),
};

function tablesFrom(rows: CatalogRows) {
  return {
    models: { data: rows.models, error: null },
    material_families: { data: rows.families, error: null },
    materials: { data: rows.materials, error: null },
    model_families: { data: rows.modelFamilies, error: null },
    bases: { data: rows.bases, error: null },
  };
}

beforeEach(() => {
  state.tables = {};
  state.clientError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.mocked(cacheTag).mockClear();
  vi.mocked(cacheLife).mockClear();
});

describe("catalogFromRows", () => {
  it("maps the seed migration's rows to the seed catalogue", () => {
    const catalog = catalogFromRows(seedRows());
    expect(catalog).toEqual(EXPECTED);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("orders every list by sort, whatever the row order", () => {
    const rows = seedRows();
    rows.models.reverse();
    rows.families.reverse();
    rows.materials.reverse();
    rows.bases.reverse();
    rows.modelFamilies.reverse();
    expect(catalogFromRows(rows)).toEqual(EXPECTED);
  });

  it("carries the optional columns: descriptions, supplier codes, categories and photos", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    const rows = seedRows();
    rows.models[0].description = "Text nou pentru card.";
    rows.materials[0].supplier_code = "VEL-4471";
    rows.materials[0].price_category = "C";
    rows.materials[0].photo_path = "mostre/ct-verde.jpg";
    rows.bases[0].photo_path = "baze/picioare lemn.jpg";
    const catalog = catalogFromRows(rows);
    expect(catalog.models[0].description).toBe("Text nou pentru card.");
    expect(catalog.models[1].description).toBeUndefined();
    expect(catalog.families[0].colors[0]).toMatchObject({
      supplierCode: "VEL-4471",
      priceCategory: "C",
      photoSrc: "https://example.supabase.co/storage/v1/object/public/media/mostre/ct-verde.jpg",
    });
    expect(catalog.bases[0].photoSrc).toBe(
      "https://example.supabase.co/storage/v1/object/public/media/baze/picioare%20lemn.jpg",
    );
  });

  it("skips rows with ids the site does not know, with a console.error each", () => {
    const rows = seedRows();
    const model: ModelRow = { id: "rotund", name: "Rotund", note: "", code: "ROT", description: null, sort: 9 };
    const family: FamilyRow = { id: "in", name: "In", code: "IN", tab: "textile", description: null, specs: [], sort: 9 };
    const material: MaterialRow = {
      id: "in-alb",
      family_id: "in",
      name: "Alb",
      code: "IN01",
      hex: "#FFFFFF",
      price_category: "A",
      supplier_code: null,
      featured: false,
      photo_path: null,
      sort: 0,
    };
    const base: BaseRow = { id: "roti", name: "Roți", note: "", code: "RT", photo_path: null, sort: 9 };
    rows.models.push(model);
    rows.families.push(family);
    rows.materials.push(material);
    rows.bases.push(base);
    rows.modelFamilies.push({ model_id: "rotund", family_id: "catifea" }, { model_id: "capitonat", family_id: "in" });
    expect(catalogFromRows(rows)).toEqual(EXPECTED);
    expect(console.error).toHaveBeenCalledTimes(4);
  });

  it("skips a family with a tab the site does not know, and the materials left without a family", () => {
    const rows = seedRows();
    rows.families[4].tab = "metal";
    const catalog = catalogFromRows(rows);
    expect(catalog.families.map((f) => f.id)).toEqual(["catifea", "boucle", "stofa", "piele"]);
    // Lamele allowed only lemn, so it cannot be configured any more and goes too.
    expect(catalog.models.map((m) => m.id)).toEqual(["capitonat", "arcuit", "canale"]);
    expect(console.error).toHaveBeenCalledTimes(3);
  });

  it("skips a family without colours and a model without families", () => {
    const rows = seedRows();
    rows.materials = rows.materials.filter((m) => m.family_id !== "lemn");
    rows.modelFamilies = rows.modelFamilies.filter((mf) => mf.model_id !== "canale");
    const catalog = catalogFromRows(rows);
    expect(catalog.families.map((f) => f.id)).toEqual(["catifea", "boucle", "stofa", "piele"]);
    expect(catalog.models.map((m) => m.id)).toEqual(["capitonat", "arcuit"]);
  });

  it("turns anything but an array of {k, v} strings into empty specs", () => {
    const rows = seedRows();
    rows.families[0].specs = { k: "Frecare", v: "40.000" };
    rows.families[1].specs = [{ k: "Frecare", v: 40000 }];
    rows.families[2].specs = ["Frecare"];
    rows.families[3].specs = null;
    rows.families[4].specs = [{ k: "Esențe", v: "stejar, nuc, frasin", extra: true }];
    const catalog = catalogFromRows(rows);
    expect(catalog.families.slice(0, 4).map((f) => f.specs)).toEqual([[], [], [], []]);
    expect(catalog.families[4].specs).toEqual([{ k: "Esențe", v: "stejar, nuc, frasin" }]);
  });

  it("exposes the id guards", () => {
    expect(isModelId("lamele")).toBe(true);
    expect(isModelId("rotund")).toBe(false);
    expect(isFamilyId("piele")).toBe(true);
    expect(isFamilyId(null)).toBe(false);
    expect(isBaseId("sertare")).toBe(true);
    expect(isBaseId("")).toBe(false);
  });
});

describe("getCatalog", () => {
  it("reads the five tables and caches the catalogue for days under the catalog tag", async () => {
    state.tables = tablesFrom(seedRows());
    expect(await getCatalog()).toEqual(EXPECTED);
    expect(cacheTag).toHaveBeenCalledWith("catalog");
    expect(cacheLife).toHaveBeenCalledWith("days");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("serves the seed, briefly cached, when the client cannot be created (missing env)", async () => {
    state.clientError = new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL");
    expect(await getCatalog()).toBe(SEED_CATALOG);
    expect(cacheLife).toHaveBeenCalledWith("minutes");
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.error).mock.calls[0][0]).toMatch(/getCatalog.*NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("throws instead of serving the seed in production (docs/PLAN.md, principle 3)", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    state.clientError = new Error("fetch failed");
    await expect(getCatalog()).rejects.toThrow("getCatalog: fetch failed");
    vi.unstubAllEnvs();
  });

  it("serves the seed on an API error", async () => {
    state.tables = { ...tablesFrom(seedRows()), bases: { data: null, error: { message: "permission denied" } } };
    expect(await getCatalog()).toBe(SEED_CATALOG);
    expect(vi.mocked(console.error).mock.calls[0][0]).toMatch(/bases: permission denied/);
  });

  it("serves the seed when the tables are empty: a catalogue without models, families or bases is unusable", async () => {
    state.tables = {};
    expect(await getCatalog()).toBe(SEED_CATALOG);
    expect(cacheLife).toHaveBeenCalledWith("minutes");
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.error).mock.calls[0][0]).toMatch(/no usable models/);
  });
});
