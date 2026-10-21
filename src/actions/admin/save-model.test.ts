// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG_MESSAGES } from "@/lib/admin/catalog-schemas";
import type { AdminSession } from "@/lib/admin/session";
import { ADMIN_INITIAL_STATE, ADMIN_MESSAGES } from "@/lib/admin/types";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  session: null as AdminSession | null,
  createClient: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("next/cache", () => ({ updateTag: mocks.updateTag, refresh: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ getAdminSession: async () => mocks.session }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { saveModel } from "./save-model";

const ADMIN: AdminSession = { userId: "user-1", email: "atelier@example.com" };

// A recording fake of the PostgREST builder: every call to from() opens a Call whose
// chained methods are logged as ops; awaiting the chain (or maybeSingle) asks `respond`.
type Op = [method: string, ...args: unknown[]];
interface Call {
  table: string;
  ops: Op[];
}
interface Result {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
}
type Respond = (call: Call) => Result;

function fakeClient(respond: Respond) {
  const calls: Call[] = [];
  function builder(call: Call) {
    const q: Record<string, unknown> = {
      maybeSingle: async () => {
        call.ops.push(["maybeSingle"]);
        const result = respond(call);
        return { ...result, data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data };
      },
      then: <R>(onOk: (value: Result) => R, onErr?: (reason: unknown) => R) =>
        new Promise<Result>((resolve) => resolve(respond(call))).then(onOk, onErr),
    };
    for (const method of ["select", "eq", "neq", "not", "order", "update", "upsert", "delete"]) {
      q[method] = (...args: unknown[]) => {
        call.ops.push([method, ...args]);
        return q;
      };
    }
    return q;
  }
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      return builder(call);
    },
  };
  return { client, calls };
}

const FAMILIES = [{ id: "catifea" }, { id: "boucle" }, { id: "stofa" }, { id: "piele" }, { id: "lemn" }];

const firstOp = (call: Call) => call.ops[0][0];
/** The count of the other active models (the last-model guard), told apart from the row read by its `neq`. */
const isCount = (call: Call) => firstOp(call) === "select" && call.ops.some((op) => op[0] === "neq");

/** The happy path: the model exists and is active, another one is too, the families are known, every write touches its rows. */
const happy: Respond = (call) => {
  const op = firstOp(call);
  if (call.table === "models" && isCount(call)) return { data: null, error: null, count: 1 };
  if (call.table === "models" && op === "select") return { data: [{ id: "capitonat", active: true }], error: null };
  if (call.table === "material_families") return { data: FAMILIES, error: null };
  if (call.table === "models" && op === "update") return { data: [{ id: "capitonat" }], error: null };
  if (call.table === "model_families" && op === "upsert") {
    return { data: (call.ops[0][1] as unknown[]).map(() => ({ model_id: "capitonat" })), error: null };
  }
  if (call.table === "model_families" && op === "delete") return { data: null, error: null };
  throw new Error(`unexpected ${call.table}.${op}`);
};

function withOverride(override: (call: Call) => Result | undefined): Respond {
  return (call) => override(call) ?? happy(call);
}

function formFor(over: Record<string, string | undefined> = {}, families: string[] = ["catifea", "boucle"]): FormData {
  const fd = new FormData();
  fd.set("id", "capitonat");
  fd.set("name", "Capitonat");
  fd.set("note", "Tapițat, cu nasturi");
  fd.set("description", "Textul cardului.");
  fd.set("active", "on");
  fd.set("sort", "2");
  for (const family of families) fd.append("families", family);
  for (const [key, value] of Object.entries(over)) {
    if (value === undefined) fd.delete(key);
    else fd.set(key, value);
  }
  return fd;
}

beforeEach(() => {
  mocks.session = ADMIN;
  mocks.createClient.mockReset();
  mocks.updateTag.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveModel", () => {
  it("refuses without an admin session, before touching data", async () => {
    mocks.session = null;
    expect(await saveModel(ADMIN_INITIAL_STATE, formFor())).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("answers not found for a missing or malformed id, without a query", async () => {
    expect(await saveModel(ADMIN_INITIAL_STATE, formFor({ id: undefined }))).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.notFound,
    });
    expect(await saveModel(ADMIN_INITIAL_STATE, formFor({ id: "Capitonat; drop" }))).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.notFound,
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("answers the field errors of an invalid form (no family ticked) without writing", async () => {
    const state = await saveModel(ADMIN_INITIAL_STATE, formFor({ name: "" }, []));
    expect(state).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { name: ADMIN_MESSAGES.required, families: CATALOG_MESSAGES.noFamily },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("refuses a family the table does not hold, before any write", async () => {
    const { client, calls } = fakeClient(happy);
    mocks.createClient.mockResolvedValue(client);

    const state = await saveModel(ADMIN_INITIAL_STATE, formFor({}, ["catifea", "matase"]));

    expect(state).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { families: CATALOG_MESSAGES.noFamily },
    });
    expect(calls.map((c) => [c.table, firstOp(c)])).toEqual([
      ["models", "select"],
      ["material_families", "select"],
    ]);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("updates the columns, replaces the rules (upsert the ticked pairs, then delete the rest) and expires the catalog tag", async () => {
    const { client, calls } = fakeClient(happy);
    mocks.createClient.mockResolvedValue(client);

    const state = await saveModel(ADMIN_INITIAL_STATE, formFor({}, ["catifea", "piele"]));

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(calls).toEqual([
      { table: "models", ops: [["select", "id, active"], ["eq", "id", "capitonat"], ["maybeSingle"]] },
      { table: "material_families", ops: [["select", "id"]] },
      {
        table: "models",
        ops: [
          ["update", { name: "Capitonat", note: "Tapițat, cu nasturi", description: "Textul cardului.", active: true, sort: 2 }],
          ["eq", "id", "capitonat"],
          ["select", "id"],
        ],
      },
      {
        table: "model_families",
        ops: [
          [
            "upsert",
            [
              { model_id: "capitonat", family_id: "catifea" },
              { model_id: "capitonat", family_id: "piele" },
            ],
            { onConflict: "model_id,family_id" },
          ],
          ["select", "model_id"],
        ],
      },
      {
        table: "model_families",
        ops: [["delete"], ["eq", "model_id", "capitonat"], ["not", "family_id", "in", "(catifea,piele)"]],
      },
    ]);
    expect(mocks.updateTag).toHaveBeenCalledTimes(1);
    expect(mocks.updateTag).toHaveBeenCalledWith("catalog");
  });

  it("refuses to deactivate the last active model, before any write", async () => {
    const { client, calls } = fakeClient(
      withOverride((call) => (call.table === "models" && isCount(call) ? { data: null, error: null, count: 0 } : undefined)),
    );
    mocks.createClient.mockResolvedValue(client);

    const state = await saveModel(ADMIN_INITIAL_STATE, formFor({ active: undefined }));

    expect(state).toEqual({
      status: "error",
      message: CATALOG_MESSAGES.lastModel,
      fieldErrors: { active: CATALOG_MESSAGES.lastModel },
    });
    expect(calls).toHaveLength(2);
    expect(calls[1].ops).toEqual([
      ["select", "id", { count: "exact", head: true }],
      ["eq", "active", true],
      ["neq", "id", "capitonat"],
    ]);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("deactivates a model while another one stays active", async () => {
    const { client, calls } = fakeClient(happy);
    mocks.createClient.mockResolvedValue(client);

    const state = await saveModel(ADMIN_INITIAL_STATE, formFor({ active: undefined }));

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(calls.map((c) => [c.table, firstOp(c)])).toEqual([
      ["models", "select"],
      ["models", "select"],
      ["material_families", "select"],
      ["models", "update"],
      ["model_families", "upsert"],
      ["model_families", "delete"],
    ]);
    expect(calls[3].ops[0]).toEqual([
      "update",
      { name: "Capitonat", note: "Tapițat, cu nasturi", description: "Textul cardului.", active: false, sort: 2 },
    ]);
    expect(mocks.updateTag).toHaveBeenCalledWith("catalog");
  });

  it("does not count the others for a model that is already inactive", async () => {
    const { client, calls } = fakeClient(
      withOverride((call) => {
        if (call.table === "models" && isCount(call)) return { data: null, error: null, count: 0 };
        if (call.table === "models" && firstOp(call) === "select") return { data: [{ id: "capitonat", active: false }], error: null };
        return undefined;
      }),
    );
    mocks.createClient.mockResolvedValue(client);

    const state = await saveModel(ADMIN_INITIAL_STATE, formFor({ active: undefined }));

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(calls.filter(isCount)).toHaveLength(0);
    expect(calls.map((c) => c.table)).toEqual(["models", "material_families", "models", "model_families", "model_families"]);
  });

  it("answers not found when the model row does not exist", async () => {
    const { client, calls } = fakeClient(
      withOverride((call) => (call.table === "models" && firstOp(call) === "select" ? { data: [], error: null } : undefined)),
    );
    mocks.createClient.mockResolvedValue(client);

    expect(await saveModel(ADMIN_INITIAL_STATE, formFor())).toEqual({ status: "error", message: ADMIN_MESSAGES.notFound });
    expect(calls).toHaveLength(1);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("treats an update of 0 rows as a missing role and leaves the rules alone", async () => {
    const { client, calls } = fakeClient(
      withOverride((call) => (call.table === "models" && firstOp(call) === "update" ? { data: [], error: null } : undefined)),
    );
    mocks.createClient.mockResolvedValue(client);

    expect(await saveModel(ADMIN_INITIAL_STATE, formFor())).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(calls.map((c) => c.table)).toEqual(["models", "material_families", "models"]);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("treats an upsert of 0 rules as a missing role and does not reach the delete, so the old rules stay", async () => {
    const { client, calls } = fakeClient(
      withOverride((call) =>
        call.table === "model_families" && firstOp(call) === "upsert" ? { data: [], error: null } : undefined,
      ),
    );
    mocks.createClient.mockResolvedValue(client);

    expect(await saveModel(ADMIN_INITIAL_STATE, formFor())).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(calls.map((c) => [c.table, firstOp(c)])).not.toContainEqual(["model_families", "delete"]);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("answers the generic message on a Supabase error of the upsert or the delete, and logs it", async () => {
    // The upsert fails: nothing was deleted, the model keeps every old rule.
    const upsertFails = fakeClient(
      withOverride((call) =>
        call.table === "model_families" && firstOp(call) === "upsert"
          ? { data: null, error: { message: "permission denied for table model_families" } }
          : undefined,
      ),
    );
    mocks.createClient.mockResolvedValue(upsertFails.client);

    expect(await saveModel(ADMIN_INITIAL_STATE, formFor())).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
    expect(upsertFails.calls.map((c) => [c.table, firstOp(c)])).not.toContainEqual(["model_families", "delete"]);
    expect(vi.mocked(console.error).mock.calls[0][1]).toMatchObject({ message: expect.stringContaining("permission denied") });
    expect(mocks.updateTag).not.toHaveBeenCalled();

    // The delete fails: the ticked pairs are already in, so the model is never without rules.
    const deleteFails = fakeClient(
      withOverride((call) =>
        call.table === "model_families" && firstOp(call) === "delete"
          ? { data: null, error: { message: "canceling statement due to statement timeout" } }
          : undefined,
      ),
    );
    mocks.createClient.mockResolvedValue(deleteFails.client);
    expect(await saveModel(ADMIN_INITIAL_STATE, formFor())).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
    expect(deleteFails.calls.map((c) => [c.table, firstOp(c)]).slice(-2)).toEqual([
      ["model_families", "upsert"],
      ["model_families", "delete"],
    ]);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("answers the unavailable message when the client cannot be created (no env)", async () => {
    mocks.createClient.mockRejectedValue(new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL"));

    expect(await saveModel(ADMIN_INITIAL_STATE, formFor())).toEqual({ status: "error", message: ADMIN_MESSAGES.unavailable });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });
});
