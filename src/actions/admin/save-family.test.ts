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

import { saveFamily } from "./save-family";

const ADMIN: AdminSession = { userId: "user-1", email: "atelier@example.com" };

// A recording fake of the PostgREST builder (see save-model.test.ts).
type Op = [method: string, ...args: unknown[]];
interface Call {
  table: string;
  ops: Op[];
}
interface Result {
  data: unknown;
  error: { message: string } | null;
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
    for (const method of ["select", "eq", "neq", "order", "update", "insert", "delete"]) {
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

const firstOp = (call: Call) => call.ops[0][0];

const happy: Respond = (call) => {
  if (call.table === "material_families" && firstOp(call) === "select") return { data: [{ id: "catifea" }], error: null };
  if (call.table === "material_families" && firstOp(call) === "update") return { data: [{ id: "catifea" }], error: null };
  throw new Error(`unexpected ${call.table}.${firstOp(call)}`);
};

function formFor(over: Record<string, string | undefined> = {}): FormData {
  const fd = new FormData();
  fd.set("id", "catifea");
  fd.set("name", "Catifea");
  fd.set("description", "Moale, cu un luciu discret.");
  fd.set("spec_k_1", "Compoziție");
  fd.set("spec_v_1", "100% poliester");
  fd.set("spec_k_2", "");
  fd.set("spec_v_2", "");
  fd.set("spec_k_3", "Animale");
  fd.set("spec_v_3", "potrivit");
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

describe("saveFamily", () => {
  it("refuses without an admin session, before touching data", async () => {
    mocks.session = null;
    expect(await saveFamily(ADMIN_INITIAL_STATE, formFor())).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("answers not found for a missing id, without a query", async () => {
    expect(await saveFamily(ADMIN_INITIAL_STATE, formFor({ id: undefined }))).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.notFound,
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("answers the field errors of an invalid form (a half-filled row) without writing", async () => {
    const state = await saveFamily(ADMIN_INITIAL_STATE, formFor({ name: " ", spec_v_3: "" }));
    expect(state).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { name: ADMIN_MESSAGES.required, specs: CATALOG_MESSAGES.specs },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("writes name, description and the specs as a JSON array (empty rows dropped), then expires the catalog tag", async () => {
    const { client, calls } = fakeClient(happy);
    mocks.createClient.mockResolvedValue(client);

    const state = await saveFamily(ADMIN_INITIAL_STATE, formFor());

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(calls).toEqual([
      { table: "material_families", ops: [["select", "id"], ["eq", "id", "catifea"], ["maybeSingle"]] },
      {
        table: "material_families",
        ops: [
          [
            "update",
            {
              name: "Catifea",
              description: "Moale, cu un luciu discret.",
              specs: [
                { k: "Compoziție", v: "100% poliester" },
                { k: "Animale", v: "potrivit" },
              ],
            },
          ],
          ["eq", "id", "catifea"],
          ["select", "id"],
        ],
      },
    ]);
    expect(mocks.updateTag).toHaveBeenCalledTimes(1);
    expect(mocks.updateTag).toHaveBeenCalledWith("catalog");
  });

  it("never writes the code or the tab, even when posted", async () => {
    const { client, calls } = fakeClient(happy);
    mocks.createClient.mockResolvedValue(client);

    await saveFamily(ADMIN_INITIAL_STATE, formFor({ code: "XX", tab: "lemn" }));

    expect(Object.keys(calls[1].ops[0][1] as object)).toEqual(["name", "description", "specs"]);
  });

  it("answers not found when the family row does not exist", async () => {
    const { client, calls } = fakeClient((call) => (firstOp(call) === "select" ? { data: [], error: null } : happy(call)));
    mocks.createClient.mockResolvedValue(client);

    expect(await saveFamily(ADMIN_INITIAL_STATE, formFor())).toEqual({ status: "error", message: ADMIN_MESSAGES.notFound });
    expect(calls).toHaveLength(1);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("treats an update of 0 rows as a missing role (RLS filters silently)", async () => {
    const { client } = fakeClient((call) => (firstOp(call) === "update" ? { data: [], error: null } : happy(call)));
    mocks.createClient.mockResolvedValue(client);

    expect(await saveFamily(ADMIN_INITIAL_STATE, formFor())).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("answers the generic message on a Supabase error and logs the real one", async () => {
    const { client } = fakeClient((call) =>
      firstOp(call) === "update" ? { data: null, error: { message: "permission denied for table material_families" } } : happy(call),
    );
    mocks.createClient.mockResolvedValue(client);

    expect(await saveFamily(ADMIN_INITIAL_STATE, formFor())).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
    expect(vi.mocked(console.error).mock.calls[0][1]).toMatchObject({ message: expect.stringContaining("permission denied") });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("answers the unavailable message when the client cannot be created (no env)", async () => {
    mocks.createClient.mockRejectedValue(new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL"));

    expect(await saveFamily(ADMIN_INITIAL_STATE, formFor())).toEqual({ status: "error", message: ADMIN_MESSAGES.unavailable });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });
});
