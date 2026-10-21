// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MATERIAL_MESSAGES } from "@/lib/admin/materials";
import type { AdminSession } from "@/lib/admin/session";
import { ADMIN_INITIAL_STATE, ADMIN_MESSAGES } from "@/lib/admin/types";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  session: null as AdminSession | null,
  createClient: vi.fn(),
  updateTag: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next/cache", () => ({ updateTag: mocks.updateTag, refresh: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/admin/auth", () => ({ getAdminSession: async () => mocks.session }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { deleteMaterial } from "./delete-material";

const ADMIN: AdminSession = { userId: "user-1", email: "atelier@example.com" };

type Result = { data?: unknown; error: { message: string } | null; count?: number | null };

/** One `from(table)` chain: the methods called on it, in order, with their arguments. */
interface Call {
  table: string;
  ops: unknown[][];
}

interface FakeQuery {
  select(...args: unknown[]): FakeQuery;
  delete(...args: unknown[]): FakeQuery;
  eq(...args: unknown[]): FakeQuery;
  neq(...args: unknown[]): FakeQuery;
  ilike(...args: unknown[]): FakeQuery;
  maybeSingle(): Promise<Result>;
  then<R>(onOk: (value: Result) => R, onErr?: (reason: unknown) => R): Promise<R>;
}

/** What each chain answers; the defaults describe a material nothing references, with a sibling colour. */
interface Scenario {
  /** `from("materials").select("id, family_id, code, active, photo_path").eq("id", …).maybeSingle()` */
  row?: Result;
  /** `from("projects").select("id", { count }).eq("material_id", …)` */
  projects?: Result;
  /** `from("leads").select("id", { count }).ilike("config_code", …)` */
  leads?: Result;
  /** `from("materials").select("id", { count }).eq(…).eq(…).neq(…)` */
  others?: Result;
  /** `from("materials").delete().eq("id", …).select("id")` */
  deleted?: Result;
  /** `storage.from("media").remove(paths)` */
  removed?: { error: { message: string } | null };
}

const PHOTO = "materials/ct-verde-1792569508760.webp";
const ROW = { id: "ct-verde", family_id: "catifea", code: "CT01", active: true, photo_path: PHOTO };

function respond(scenario: Scenario, call: Call): Result {
  const [method] = call.ops[0] ?? [];
  if (call.table === "projects") return scenario.projects ?? { count: 0, data: null, error: null };
  if (call.table === "leads") return scenario.leads ?? { count: 0, data: null, error: null };
  if (call.table === "materials") {
    if (method === "delete") return scenario.deleted ?? { data: [{ id: ROW.id }], error: null };
    if (call.ops[0]?.[2]) return scenario.others ?? { count: 1, data: null, error: null };
    return scenario.row ?? { data: ROW, error: null };
  }
  throw new Error(`unexpected chain on ${call.table}: ${JSON.stringify(call.ops)}`);
}

/** Records every chain the action runs and answers each from the scenario. */
function fakeClient(scenario: Scenario = {}) {
  const calls: Call[] = [];
  const removed: [bucket: string, paths: string[]][] = [];
  const builder = (call: Call): FakeQuery => {
    const record =
      (method: string) =>
      (...args: unknown[]) => {
        call.ops.push([method, ...args]);
        return q;
      };
    const q: FakeQuery = {
      select: record("select"),
      delete: record("delete"),
      eq: record("eq"),
      neq: record("neq"),
      ilike: record("ilike"),
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
    storage: {
      from(bucket: string) {
        return {
          remove: async (paths: string[]) => {
            removed.push([bucket, paths]);
            return scenario.removed ?? { error: null };
          },
        };
      },
    },
  };
  return { client, calls, removed };
}

function form(id?: string): FormData {
  const fd = new FormData();
  if (id !== undefined) fd.set("id", id);
  return fd;
}

/** The chains as `[table, first method]`, for a quick look at the order. */
const summary = (calls: Call[]) => calls.map((call) => [call.table, call.ops[0]?.[0]]);

beforeEach(() => {
  mocks.session = ADMIN;
  mocks.createClient.mockReset();
  mocks.updateTag.mockReset();
  mocks.redirect.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("deleteMaterial", () => {
  it("refuses without an admin session, before touching data", async () => {
    mocks.session = null;
    const state = await deleteMaterial(ADMIN_INITIAL_STATE, form(ROW.id));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("refuses a missing or empty id", async () => {
    expect(await deleteMaterial(ADMIN_INITIAL_STATE, form())).toEqual({ status: "error", message: ADMIN_MESSAGES.invalid });
    expect(await deleteMaterial(ADMIN_INITIAL_STATE, form("  "))).toEqual({ status: "error", message: ADMIN_MESSAGES.invalid });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("answers the unavailable message when the client cannot be created (no env)", async () => {
    mocks.createClient.mockRejectedValue(new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL"));
    const state = await deleteMaterial(ADMIN_INITIAL_STATE, form(ROW.id));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.unavailable });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("checks the projects, the leads and the family, deletes the row and its photo, then redirects", async () => {
    const { client, calls, removed } = fakeClient();
    mocks.createClient.mockResolvedValue(client);

    await expect(deleteMaterial(ADMIN_INITIAL_STATE, form(ROW.id))).rejects.toThrow("NEXT_REDIRECT:/admin/catalog?sters=1");

    expect(calls).toEqual([
      { table: "materials", ops: [["select", "id, family_id, code, active, photo_path"], ["eq", "id", ROW.id], ["maybeSingle"]] },
      { table: "projects", ops: [["select", "id", { count: "exact", head: true }], ["eq", "material_id", ROW.id]] },
      { table: "leads", ops: [["select", "id", { count: "exact", head: true }], ["ilike", "config_code", "%-CT01-%"]] },
      {
        table: "materials",
        ops: [["select", "id", { count: "exact", head: true }], ["eq", "family_id", "catifea"], ["eq", "active", true], ["neq", "id", ROW.id]],
      },
      { table: "materials", ops: [["delete"], ["eq", "id", ROW.id], ["select", "id"]] },
    ]);
    expect(removed).toEqual([["media", [PHOTO]]]);
    expect(mocks.updateTag).toHaveBeenCalledTimes(1);
    expect(mocks.updateTag).toHaveBeenCalledWith("catalog");
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/catalog?sters=1");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("skips the family count for an inactive material and the storage call for one without a photo", async () => {
    const { client, calls, removed } = fakeClient({ row: { data: { ...ROW, active: false, photo_path: null }, error: null } });
    mocks.createClient.mockResolvedValue(client);

    await expect(deleteMaterial(ADMIN_INITIAL_STATE, form(ROW.id))).rejects.toThrow("NEXT_REDIRECT");

    expect(summary(calls)).toEqual([
      ["materials", "select"],
      ["projects", "select"],
      ["leads", "select"],
      ["materials", "delete"],
    ]);
    expect(removed).toEqual([]);
  });

  it("logs a storage failure and still finishes the delete", async () => {
    const { client } = fakeClient({ removed: { error: { message: "object not found" } } });
    mocks.createClient.mockResolvedValue(client);

    await expect(deleteMaterial(ADMIN_INITIAL_STATE, form(ROW.id))).rejects.toThrow("NEXT_REDIRECT");

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("object not found"));
    expect(mocks.updateTag).toHaveBeenCalledWith("catalog");
  });

  it("answers notFound for an id the table does not have", async () => {
    const { client, calls } = fakeClient({ row: { data: null, error: null } });
    mocks.createClient.mockResolvedValue(client);

    const state = await deleteMaterial(ADMIN_INITIAL_STATE, form("ct-nimic"));

    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.notFound });
    expect(calls).toHaveLength(1);
    expect(mocks.updateTag).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("refuses a material a project shows", async () => {
    const { client, calls, removed } = fakeClient({ projects: { count: 2, data: null, error: null } });
    mocks.createClient.mockResolvedValue(client);

    const state = await deleteMaterial(ADMIN_INITIAL_STATE, form(ROW.id));

    expect(state).toEqual({ status: "error", message: MATERIAL_MESSAGES.inProject });
    expect(summary(calls)).toEqual([
      ["materials", "select"],
      ["projects", "select"],
    ]);
    expect(removed).toEqual([]);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("refuses a material a request's configuration code carries", async () => {
    const { client, calls } = fakeClient({ leads: { count: 1, data: null, error: null } });
    mocks.createClient.mockResolvedValue(client);

    const state = await deleteMaterial(ADMIN_INITIAL_STATE, form(ROW.id));

    expect(state).toEqual({ status: "error", message: MATERIAL_MESSAGES.inLead });
    expect(summary(calls)).toEqual([
      ["materials", "select"],
      ["projects", "select"],
      ["leads", "select"],
    ]);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("refuses the last active colour of its family", async () => {
    const { client, calls } = fakeClient({ others: { count: 0, data: null, error: null } });
    mocks.createClient.mockResolvedValue(client);

    const state = await deleteMaterial(ADMIN_INITIAL_STATE, form(ROW.id));

    expect(state).toEqual({ status: "error", message: MATERIAL_MESSAGES.lastColor });
    expect(summary(calls).map((c) => c[1])).toEqual(["select", "select", "select", "select"]);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("treats a delete of 0 rows as a missing role (RLS filters silently) and keeps the photo", async () => {
    const { client, removed } = fakeClient({ deleted: { data: [], error: null } });
    mocks.createClient.mockResolvedValue(client);

    const state = await deleteMaterial(ADMIN_INITIAL_STATE, form(ROW.id));

    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(removed).toEqual([]);
    expect(mocks.updateTag).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("answers the generic message on a Supabase error and logs the real one", async () => {
    const { client } = fakeClient({ deleted: { data: null, error: { message: "permission denied for table materials" } } });
    mocks.createClient.mockResolvedValue(client);

    const state = await deleteMaterial(ADMIN_INITIAL_STATE, form(ROW.id));

    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("permission denied for table materials"));
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("answers the generic message when one of the checks cannot be read", async () => {
    for (const scenario of [
      { row: { data: null, error: { message: "timeout" } } },
      { projects: { count: null, data: null, error: { message: "timeout" } } },
      { leads: { count: null, data: null, error: { message: "timeout" } } },
      { others: { count: null, data: null, error: { message: "timeout" } } },
    ] satisfies Scenario[]) {
      const { client } = fakeClient(scenario);
      mocks.createClient.mockResolvedValue(client);
      expect(await deleteMaterial(ADMIN_INITIAL_STATE, form(ROW.id))).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
    }
    expect(mocks.updateTag).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
