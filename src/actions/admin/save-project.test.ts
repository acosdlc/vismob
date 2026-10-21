// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NIL_UUID, PROJECT_MESSAGES } from "@/lib/admin/projects";
import type { AdminSession } from "@/lib/admin/session";
import { ADMIN_INITIAL_STATE, ADMIN_MESSAGES } from "@/lib/admin/types";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  session: null as AdminSession | null,
  createClient: vi.fn(),
  updateTag: vi.fn(),
  refresh: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next/cache", () => ({ updateTag: mocks.updateTag, refresh: mocks.refresh, cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/admin/auth", () => ({ getAdminSession: async () => mocks.session }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { saveProject } from "./save-project";

const ADMIN: AdminSession = { userId: "user-1", email: "atelier@example.com" };

type Result = { data?: unknown; error: { message: string } | null };

/** One `from(table)` chain: the methods called on it, in order, with their arguments. */
interface Call {
  table: string;
  ops: unknown[][];
}

interface FakeQuery {
  select(...args: unknown[]): FakeQuery;
  insert(...args: unknown[]): FakeQuery;
  update(...args: unknown[]): FakeQuery;
  eq(...args: unknown[]): FakeQuery;
  neq(...args: unknown[]): FakeQuery;
  maybeSingle(): Promise<Result>;
  then<R>(onOk: (value: Result) => R, onErr?: (reason: unknown) => R): Promise<R>;
}

/** What each chain answers; the defaults describe a healthy database that knows the form's model, material and base. */
interface Scenario {
  /** `from("models").select("id")` */
  models?: Result;
  /** `from("materials").select("id")` */
  materials?: Result;
  /** `from("bases").select("id")` */
  bases?: Result;
  /** `from("projects").select("slug")` */
  slugs?: Result;
  /** `from("projects").update({ hero: false }).eq("hero", true).neq("id", …).select("id")` */
  clearHero?: Result;
  /** `from("projects").insert(…).select("id")` */
  insert?: Result;
  /** `from("projects").select("id").eq("id", …).maybeSingle()` */
  row?: Result;
  /** `from("projects").update(…).eq("id", …).select("id")` */
  update?: Result;
}

const ROW_ID = "9a1b2c3d-0000-4000-8000-00000000abcd";
const NEW_ID = "9a1b2c3d-0000-4000-8000-00000000ef01";

const isHeroClear = (payload: unknown) => JSON.stringify(payload) === JSON.stringify({ hero: false });

function respond(scenario: Scenario, call: Call): Result {
  const [method, arg] = call.ops[0] ?? [];
  if (call.table === "models") return scenario.models ?? { data: [{ id: "capitonat" }, { id: "arcuit" }, { id: "canale" }, { id: "lamele" }], error: null };
  if (call.table === "materials") return scenario.materials ?? { data: [{ id: "ct-verde" }, { id: "bc-nisip" }], error: null };
  if (call.table === "bases") return scenario.bases ?? { data: [{ id: "lemn" }, { id: "lada" }], error: null };
  if (call.table === "projects") {
    if (method === "insert") return scenario.insert ?? { data: [{ id: NEW_ID }], error: null };
    if (method === "update") return isHeroClear(arg) ? (scenario.clearHero ?? { data: [], error: null }) : (scenario.update ?? { data: [{ id: ROW_ID }], error: null });
    if (method === "select") {
      if (arg === "slug") return scenario.slugs ?? { data: [], error: null };
      return scenario.row ?? { data: { id: ROW_ID }, error: null };
    }
  }
  throw new Error(`unexpected chain on ${call.table}: ${JSON.stringify(call.ops)}`);
}

/** Records every chain the action runs and answers each from the scenario. */
function fakeClient(scenario: Scenario = {}) {
  const calls: Call[] = [];
  const builder = (call: Call): FakeQuery => {
    const record =
      (method: string) =>
      (...args: unknown[]) => {
        call.ops.push([method, ...args]);
        return q;
      };
    const q: FakeQuery = {
      select: record("select"),
      insert: record("insert"),
      update: record("update"),
      eq: record("eq"),
      neq: record("neq"),
      maybeSingle: () => {
        call.ops.push(["maybeSingle"]);
        return Promise.resolve(respond(scenario, call));
      },
      then: (onOk, onErr) => Promise.resolve(respond(scenario, call)).then(onOk, onErr),
    };
    return q;
  };
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      return builder(call);
    },
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
  };
  return { client, calls };
}

/** The form's post; `id` "" is a new project. */
function form(overrides: Record<string, string | string[] | undefined> = {}): FormData {
  const values: Record<string, string | string[] | undefined> = {
    id: "",
    title: "Pat capitonat pentru un dormitor mic",
    ticket_no: "0412",
    model_id: "capitonat",
    width_cm: "160",
    length_cm: "200",
    material_id: "ct-verde",
    base_id: "lada",
    extras: ["nightstands", "led"],
    city: "Cluj-Napoca",
    delivered_on: "2026-03-14",
    client_consent: "on",
    published: "on",
    featured: "on",
    hero: undefined,
    sort: "3",
    ...overrides,
  };
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => fd.append(key, v));
    else fd.set(key, value);
  }
  return fd;
}

/** What the insert and the update both write for the default form. */
const COLUMNS = {
  title: "Pat capitonat pentru un dormitor mic",
  ticket_no: "0412",
  model_id: "capitonat",
  width_cm: 160,
  length_cm: 200,
  material_id: "ct-verde",
  base_id: "lada",
  extras: ["LED sub pat", "2 noptiere"],
  city: "Cluj-Napoca",
  delivered_on: "2026-03-14",
  featured: true,
  hero: false,
  published: true,
  client_consent: true,
  sort: 3,
};

/** The chains as `[table, first method, …its arguments]`, for a quick look at the order. */
const summary = (calls: Call[]) => calls.map((call) => [call.table, ...(call.ops[0] ?? [])]);

beforeEach(() => {
  mocks.session = ADMIN;
  mocks.refresh.mockReset();
  mocks.createClient.mockReset();
  mocks.updateTag.mockReset();
  mocks.redirect.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveProject", () => {
  it("refuses without an admin session, before touching data", async () => {
    mocks.session = null;
    const state = await saveProject(ADMIN_INITIAL_STATE, form());
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("answers the field errors of an invalid form without writing", async () => {
    const state = await saveProject(ADMIN_INITIAL_STATE, form({ title: "", width_cm: "20" }));
    expect(state).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { title: ADMIN_MESSAGES.required, width_cm: PROJECT_MESSAGES.size },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a uuid", async () => {
    const state = await saveProject(ADMIN_INITIAL_STATE, form({ id: "pat-capitonat" }));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.invalid });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("refuses to publish without the client's consent, on the published box", async () => {
    const state = await saveProject(ADMIN_INITIAL_STATE, form({ client_consent: undefined }));
    expect(state).toEqual({ status: "error", message: PROJECT_MESSAGES.consent, fieldErrors: { published: PROJECT_MESSAGES.consent } });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("lets an unpublished project be saved without consent", async () => {
    const { client } = fakeClient();
    mocks.createClient.mockResolvedValue(client);
    await expect(saveProject(ADMIN_INITIAL_STATE, form({ client_consent: undefined, published: undefined }))).rejects.toThrow("NEXT_REDIRECT");
  });

  it("refuses a hero that is not published, on the hero box", async () => {
    const state = await saveProject(ADMIN_INITIAL_STATE, form({ hero: "on", published: undefined }));
    expect(state).toEqual({
      status: "error",
      message: PROJECT_MESSAGES.heroUnpublished,
      fieldErrors: { hero: PROJECT_MESSAGES.heroUnpublished },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("answers the unavailable message when the client cannot be created (no env)", async () => {
    mocks.createClient.mockRejectedValue(new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL"));
    const state = await saveProject(ADMIN_INITIAL_STATE, form());
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.unavailable });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  describe("the references", () => {
    it("refuses a model, a material or a base the tables do not have, without writing", async () => {
      const model = fakeClient({ models: { data: [{ id: "arcuit" }], error: null } });
      mocks.createClient.mockResolvedValue(model.client);
      expect(await saveProject(ADMIN_INITIAL_STATE, form())).toEqual({
        status: "error",
        message: ADMIN_MESSAGES.invalid,
        fieldErrors: { model_id: ADMIN_MESSAGES.invalid },
      });
      expect(summary(model.calls)).toEqual([
        ["models", "select", "id"],
        ["materials", "select", "id"],
        ["bases", "select", "id"],
      ]);

      const material = fakeClient();
      mocks.createClient.mockResolvedValue(material.client);
      expect(await saveProject(ADMIN_INITIAL_STATE, form({ material_id: "ct-nimic" }))).toEqual({
        status: "error",
        message: ADMIN_MESSAGES.invalid,
        fieldErrors: { material_id: ADMIN_MESSAGES.invalid },
      });

      const base = fakeClient();
      mocks.createClient.mockResolvedValue(base.client);
      expect(await saveProject(ADMIN_INITIAL_STATE, form({ base_id: "roti" }))).toEqual({
        status: "error",
        message: ADMIN_MESSAGES.invalid,
        fieldErrors: { base_id: ADMIN_MESSAGES.invalid },
      });
      expect(mocks.updateTag).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it("does not read the materials or the bases when the project names none", async () => {
      const { client, calls } = fakeClient();
      mocks.createClient.mockResolvedValue(client);

      await expect(saveProject(ADMIN_INITIAL_STATE, form({ material_id: "", base_id: "" }))).rejects.toThrow("NEXT_REDIRECT");

      expect(summary(calls).map((c) => c[0])).toEqual(["models", "projects", "projects"]);
      expect(calls[2].ops[0][1]).toMatchObject({ material_id: null, base_id: null });
    });

    it("answers the generic message when a reference table cannot be read", async () => {
      for (const scenario of [
        { models: { data: null, error: { message: "timeout" } } },
        { materials: { data: null, error: { message: "timeout" } } },
        { bases: { data: null, error: { message: "timeout" } } },
      ] satisfies Scenario[]) {
        const { client } = fakeClient(scenario);
        mocks.createClient.mockResolvedValue(client);
        expect(await saveProject(ADMIN_INITIAL_STATE, form())).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
      }
      expect(mocks.updateTag).not.toHaveBeenCalled();
    });
  });

  describe("a new project", () => {
    it("gets its slug from the title, is inserted, expires the projects tag and opens its screen", async () => {
      const { client, calls } = fakeClient();
      mocks.createClient.mockResolvedValue(client);

      await expect(saveProject(ADMIN_INITIAL_STATE, form())).rejects.toThrow(`NEXT_REDIRECT:/admin/lucrari/${NEW_ID}?creat=1`);

      expect(summary(calls)).toEqual([
        ["models", "select", "id"],
        ["materials", "select", "id"],
        ["bases", "select", "id"],
        ["projects", "select", "slug"],
        ["projects", "insert", { slug: "pat-capitonat-pentru-un-dormitor-mic", ...COLUMNS }],
      ]);
      expect(calls[4].ops).toEqual([["insert", { slug: "pat-capitonat-pentru-un-dormitor-mic", ...COLUMNS }], ["select", "id"]]);
      expect(mocks.updateTag).toHaveBeenCalledTimes(1);
      expect(mocks.updateTag).toHaveBeenCalledWith("projects");
      expect(mocks.redirect).toHaveBeenCalledWith(`/admin/lucrari/${NEW_ID}?creat=1`);
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });

    it("steps past a taken slug", async () => {
      const { client, calls } = fakeClient({
        slugs: { data: [{ slug: "pat-capitonat-pentru-un-dormitor-mic" }, { slug: "pat-arcuit" }], error: null },
      });
      mocks.createClient.mockResolvedValue(client);

      await expect(saveProject(ADMIN_INITIAL_STATE, form())).rejects.toThrow("NEXT_REDIRECT");

      expect(calls[4].ops[0][1]).toMatchObject({ slug: "pat-capitonat-pentru-un-dormitor-mic-2" });
    });

    it("refuses a title that gives no slug, on the title field", async () => {
      const { client, calls } = fakeClient();
      mocks.createClient.mockResolvedValue(client);

      const state = await saveProject(ADMIN_INITIAL_STATE, form({ title: "***" }));

      expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.invalid, fieldErrors: { title: PROJECT_MESSAGES.slug } });
      expect(summary(calls).at(-1)).toEqual(["projects", "select", "slug"]);
      expect(mocks.updateTag).not.toHaveBeenCalled();
    });

    it("stores the empty optional fields as null and the unticked boxes as false", async () => {
      const { client, calls } = fakeClient();
      mocks.createClient.mockResolvedValue(client);

      await expect(
        saveProject(
          ADMIN_INITIAL_STATE,
          form({ ticket_no: "", material_id: "", base_id: "", extras: [], city: "", delivered_on: "", published: undefined, featured: undefined, sort: "" }),
        ),
      ).rejects.toThrow("NEXT_REDIRECT");

      expect(calls.at(-1)?.ops[0][1]).toMatchObject({
        ticket_no: null,
        material_id: null,
        base_id: null,
        extras: [],
        city: null,
        delivered_on: null,
        published: false,
        featured: false,
        sort: 0,
      });
    });

    it("clears every other hero before inserting a hero project", async () => {
      const { client, calls } = fakeClient();
      mocks.createClient.mockResolvedValue(client);

      await expect(saveProject(ADMIN_INITIAL_STATE, form({ hero: "on" }))).rejects.toThrow("NEXT_REDIRECT");

      expect(summary(calls).map((c) => [c[0], c[1]])).toEqual([
        ["models", "select"],
        ["materials", "select"],
        ["bases", "select"],
        ["projects", "select"],
        ["projects", "update"],
        ["projects", "insert"],
      ]);
      expect(calls[4].ops).toEqual([["update", { hero: false }], ["eq", "hero", true], ["neq", "id", NIL_UUID], ["select", "id"]]);
      expect(calls[5].ops[0][1]).toMatchObject({ hero: true });
    });

    it("does not touch the other projects when the new one is not the hero", async () => {
      const { client, calls } = fakeClient();
      mocks.createClient.mockResolvedValue(client);
      await expect(saveProject(ADMIN_INITIAL_STATE, form())).rejects.toThrow("NEXT_REDIRECT");
      expect(summary(calls).some((c) => c[1] === "update")).toBe(false);
    });

    it("answers the generic message when the hero flags cannot be cleared, and does not insert", async () => {
      const { client, calls } = fakeClient({ clearHero: { data: null, error: { message: "permission denied" } } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveProject(ADMIN_INITIAL_STATE, form({ hero: "on" }));

      expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
      expect(summary(calls).some((c) => c[1] === "insert")).toBe(false);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("permission denied"));
      expect(mocks.updateTag).not.toHaveBeenCalled();
    });

    it("treats an insert of 0 rows as a missing role (RLS filters silently)", async () => {
      const { client } = fakeClient({ insert: { data: [], error: null } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveProject(ADMIN_INITIAL_STATE, form());

      expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
      expect(mocks.updateTag).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it("answers the generic message on a Supabase error and logs the real one", async () => {
      const insert = fakeClient({ insert: { data: null, error: { message: 'duplicate key value violates unique constraint "projects_slug_key"' } } });
      mocks.createClient.mockResolvedValue(insert.client);
      expect(await saveProject(ADMIN_INITIAL_STATE, form())).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("projects_slug_key"));

      const slugs = fakeClient({ slugs: { data: null, error: { message: "timeout" } } });
      mocks.createClient.mockResolvedValue(slugs.client);
      expect(await saveProject(ADMIN_INITIAL_STATE, form())).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
      expect(mocks.updateTag).not.toHaveBeenCalled();
    });
  });

  describe("an existing project", () => {
    const edit = (overrides: Record<string, string | string[] | undefined> = {}) => form({ id: ROW_ID, ...overrides });

    it("updates the columns except the slug, refreshes the screen and expires the projects tag", async () => {
      const { client, calls } = fakeClient();
      mocks.createClient.mockResolvedValue(client);

      const state = await saveProject(ADMIN_INITIAL_STATE, edit({ slug: "altceva" }));

      expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
      expect(summary(calls).map((c) => [c[0], c[1]])).toEqual([
        ["models", "select"],
        ["materials", "select"],
        ["bases", "select"],
        ["projects", "select"],
        ["projects", "update"],
      ]);
      expect(calls[3].ops).toEqual([["select", "id"], ["eq", "id", ROW_ID], ["maybeSingle"]]);
      expect(calls[4].ops).toEqual([["update", COLUMNS], ["eq", "id", ROW_ID], ["select", "id"]]);
      expect(calls[4].ops[0][1]).not.toHaveProperty("slug");
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
      expect(mocks.updateTag).toHaveBeenCalledTimes(1);
      expect(mocks.updateTag).toHaveBeenCalledWith("projects");
      expect(mocks.redirect).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });

    it("clears every other hero, excluding itself, before updating a hero project", async () => {
      const { client, calls } = fakeClient();
      mocks.createClient.mockResolvedValue(client);

      const state = await saveProject(ADMIN_INITIAL_STATE, edit({ hero: "on" }));

      expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
      expect(summary(calls).map((c) => [c[0], c[1]])).toEqual([
        ["models", "select"],
        ["materials", "select"],
        ["bases", "select"],
        ["projects", "select"],
        ["projects", "update"],
        ["projects", "update"],
      ]);
      expect(calls[4].ops).toEqual([["update", { hero: false }], ["eq", "hero", true], ["neq", "id", ROW_ID], ["select", "id"]]);
      expect(calls[5].ops[0][1]).toMatchObject({ hero: true });
    });

    it("answers notFound for an id the table does not have", async () => {
      const { client, calls } = fakeClient({ row: { data: null, error: null } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveProject(ADMIN_INITIAL_STATE, edit());

      expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.notFound });
      expect(summary(calls).at(-1)).toEqual(["projects", "select", "id"]);
      expect(mocks.updateTag).not.toHaveBeenCalled();
    });

    it("treats an update of 0 rows as a missing role", async () => {
      const { client } = fakeClient({ update: { data: [], error: null } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveProject(ADMIN_INITIAL_STATE, edit());

      expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
      expect(mocks.updateTag).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it("answers the generic message on a Supabase error and logs the real one", async () => {
      const update = fakeClient({ update: { data: null, error: { message: "permission denied for table projects" } } });
      mocks.createClient.mockResolvedValue(update.client);
      expect(await saveProject(ADMIN_INITIAL_STATE, edit())).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("permission denied for table projects"));

      const row = fakeClient({ row: { data: null, error: { message: "timeout" } } });
      mocks.createClient.mockResolvedValue(row.client);
      expect(await saveProject(ADMIN_INITIAL_STATE, edit())).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });

      const clearHero = fakeClient({ clearHero: { data: null, error: { message: "timeout" } } });
      mocks.createClient.mockResolvedValue(clearHero.client);
      expect(await saveProject(ADMIN_INITIAL_STATE, edit({ hero: "on" }))).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
      expect(summary(clearHero.calls).filter((c) => c[1] === "update")).toHaveLength(1);
      expect(mocks.updateTag).not.toHaveBeenCalled();
    });

    it("answers the generic message when the client throws", async () => {
      mocks.createClient.mockResolvedValue({
        from: () => {
          throw new Error("socket hang up");
        },
      });
      expect(await saveProject(ADMIN_INITIAL_STATE, edit())).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
      expect(console.error).toHaveBeenCalledWith("saveProject", expect.any(Error));
    });
  });
});
