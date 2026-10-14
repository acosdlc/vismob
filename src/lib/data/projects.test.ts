// @vitest-environment node
import { cacheLife, cacheTag } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  allProjects,
  deliveredLabel,
  getHeroProject,
  getProjects,
  projectCaption,
  type ProjectRow,
  type ProjectRows,
  projectsFromRows,
} from "./projects";
import { SEED_PROJECTS } from "./projects.seed";

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

const FULL: ProjectRow = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "capitonat-cluj",
  title: "Pat capitonat pentru un dormitor din Cluj",
  ticket_no: "0123",
  model_id: "capitonat",
  width_cm: 180,
  length_cm: 200,
  material_id: "ct-verde",
  base_id: "lada",
  extras: ["LED sub pat"],
  city: "Cluj-Napoca",
  delivered_on: "2026-03-14",
  featured: true,
  hero: true,
  sort: 0,
};

const BARE: ProjectRow = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "arcuit-fara-detalii",
  title: "Pat arcuit",
  ticket_no: null,
  model_id: "arcuit",
  width_cm: 160,
  length_cm: 200,
  material_id: null,
  base_id: null,
  extras: [],
  city: null,
  delivered_on: null,
  featured: false,
  hero: false,
  sort: 1,
};

function rows(projects: ProjectRow[], photos: ProjectRows["photos"] = []): ProjectRows {
  return {
    projects,
    photos,
    materials: [{ id: "ct-verde", name: "Verde sticlă", family_id: "catifea" }],
    families: [{ id: "catifea", name: "Catifea" }],
    bases: [{ id: "lada", name: "Ladă de depozitare" }],
  };
}

function tablesFrom(r: ProjectRows) {
  return {
    projects: { data: r.projects, error: null },
    project_photos: { data: r.photos, error: null },
    materials: { data: r.materials, error: null },
    material_families: { data: r.families, error: null },
    bases: { data: r.bases, error: null },
  };
}

beforeEach(() => {
  state.tables = {};
  state.clientError = null;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.mocked(cacheTag).mockClear();
  vi.mocked(cacheLife).mockClear();
});

describe("deliveredLabel", () => {
  it("formats the city and the Romanian month in lower case", () => {
    expect(deliveredLabel("Cluj-Napoca", "2026-03-14")).toBe("Cluj-Napoca, martie 2026");
    expect(deliveredLabel("Iași", "2025-12-01")).toBe("Iași, decembrie 2025");
    expect(deliveredLabel("", "2026-01-31")).toBe("ianuarie 2026");
  });

  it("is empty without a date or with one it cannot read", () => {
    expect(deliveredLabel("Cluj-Napoca", null)).toBe("");
    expect(deliveredLabel("Cluj-Napoca", "martie")).toBe("");
    expect(deliveredLabel("Cluj-Napoca", "2026-13-01")).toBe("");
  });
});

describe("projectsFromRows", () => {
  it("maps a full row with its first photo", () => {
    const [p] = projectsFromRows(
      rows(
        [FULL],
        [
          { project_id: FULL.id, path: "lucrari/capitonat-cluj/detaliu.jpg", alt: "Detaliu de tăblie", sort: 1 },
          { project_id: FULL.id, path: "lucrari/capitonat-cluj/pat.jpg", alt: "Patul în dormitor", sort: 0 },
        ],
      ),
    );
    expect(p).toEqual({
      slug: "capitonat-cluj",
      ticketNo: "0123",
      title: "Pat capitonat pentru un dormitor din Cluj",
      modelId: "capitonat",
      widthCm: 180,
      lengthCm: 200,
      materialLabel: "Catifea, verde sticlă",
      baseLabel: "Ladă de depozitare",
      extras: ["LED sub pat"],
      city: "Cluj-Napoca",
      deliveredLabel: "Cluj-Napoca, martie 2026",
      photo: {
        src: "https://example.supabase.co/storage/v1/object/public/media/lucrari/capitonat-cluj/pat.jpg",
        alt: "Patul în dormitor",
        label: "",
        frame: "",
      },
      featured: true,
      hero: true,
    });
    expect(projectCaption(p)).toBe("Capitonat · 180 × 200 · Catifea, verde sticlă · Cluj-Napoca");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("maps a row without material, base, photo, city, ticket or date to empty labels", () => {
    const [p] = projectsFromRows(rows([BARE]));
    expect(p).toEqual({
      slug: "arcuit-fara-detalii",
      ticketNo: "",
      title: "Pat arcuit",
      modelId: "arcuit",
      widthCm: 160,
      lengthCm: 200,
      materialLabel: "",
      baseLabel: "",
      extras: [],
      city: "",
      deliveredLabel: "",
      photo: undefined,
      featured: false,
      hero: false,
    });
    expect(projectCaption(p)).toBe("Arcuit · 160 × 200");
  });

  it("leaves the material label empty when the material is not readable (inactive) or has no family", () => {
    const r = rows([FULL]);
    r.materials = [];
    expect(projectsFromRows(r)[0].materialLabel).toBe("");
    r.materials = [{ id: "ct-verde", name: "Verde sticlă", family_id: "catifea" }];
    r.families = [];
    expect(projectsFromRows(r)[0].materialLabel).toBe("");
  });

  it("skips a row with a model the site does not know or without a size, with a console.error", () => {
    const unknown = { ...BARE, id: "3", slug: "rotund", model_id: "rotund" };
    const noSize = { ...BARE, id: "4", slug: "fara-latime", width_cm: null };
    const noModel = { ...BARE, id: "5", slug: "fara-model", model_id: null };
    expect(projectsFromRows(rows([FULL, unknown, noSize, noModel])).map((p) => p.slug)).toEqual(["capitonat-cluj"]);
    const messages = vi.mocked(console.error).mock.calls.map((call) => String(call[0]));
    expect(messages).toHaveLength(3);
    expect(messages.join("\n")).toMatch(/"rotund" has model "rotund"/);
    expect(messages.join("\n")).toMatch(/"fara-latime" has no mattress size/);
    expect(messages.join("\n")).toMatch(/"fara-model" has model "null"/);
  });

  it("orders by sort, then slug", () => {
    const list = projectsFromRows(
      rows([
        { ...BARE, id: "b", slug: "b", sort: 1 },
        { ...BARE, id: "a", slug: "a", sort: 1 },
        { ...FULL, id: "c", slug: "c", sort: 2 },
        { ...BARE, id: "d", slug: "d", sort: 0 },
      ]),
    );
    expect(list.map((p) => p.slug)).toEqual(["d", "a", "b", "c"]);
  });
});

describe("getProjects / getHeroProject", () => {
  it("read the published projects, cached for days under the projects tag, and filter in memory", async () => {
    const arcuit = { ...BARE, id: "6", slug: "arcuit-2", featured: true, sort: 2 };
    state.tables = tablesFrom(rows([FULL, BARE, arcuit]));
    expect((await getProjects()).map((p) => p.slug)).toEqual(["capitonat-cluj", "arcuit-fara-detalii", "arcuit-2"]);
    expect((await getProjects({ featured: true })).map((p) => p.slug)).toEqual(["capitonat-cluj", "arcuit-2"]);
    expect((await getProjects({ model: "arcuit" })).map((p) => p.slug)).toEqual(["arcuit-fara-detalii", "arcuit-2"]);
    expect((await getProjects({ model: "arcuit", featured: false })).map((p) => p.slug)).toEqual(["arcuit-fara-detalii"]);
    expect((await getHeroProject())?.slug).toBe("capitonat-cluj");
    expect(cacheTag).toHaveBeenCalledWith("projects");
    expect(cacheLife).toHaveBeenCalledWith("days");
    expect(cacheLife).not.toHaveBeenCalledWith("minutes");
  });

  it("return nothing, not the seed, when the database has no published projects", async () => {
    state.tables = tablesFrom(rows([]));
    expect(await allProjects()).toEqual([]);
    expect(await getProjects({ featured: true })).toEqual([]);
    expect(await getHeroProject()).toBeNull();
    expect(cacheLife).toHaveBeenCalledWith("days");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("serve the seed, briefly cached, when the client cannot be created (missing env)", async () => {
    state.clientError = new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL");
    expect(await allProjects()).toBe(SEED_PROJECTS);
    expect((await getHeroProject())?.slug).toBe("foto-01");
    expect(cacheLife).toHaveBeenCalledWith("minutes");
    expect(vi.mocked(console.error).mock.calls[0][0]).toMatch(/getProjects.*NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("serve the seed on an API error", async () => {
    state.tables = { ...tablesFrom(rows([FULL])), project_photos: { data: null, error: { message: "timeout" } } };
    expect(await allProjects()).toBe(SEED_PROJECTS);
    expect(vi.mocked(console.error).mock.calls[0][0]).toMatch(/project_photos: timeout/);
  });
});
