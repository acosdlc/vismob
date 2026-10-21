// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG_MESSAGES } from "@/lib/admin/catalog-schemas";
import { PHOTO_FIELDS } from "@/lib/admin/media";
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

import { saveBase } from "./save-base";

const ADMIN: AdminSession = { userId: "user-1", email: "atelier@example.com" };

const OLD_PHOTO = "bases/lemn-1792569508760.webp";
const NEW_PHOTO = "bases/lemn-1792569600000.webp";

// A recording fake of the PostgREST builder (see save-model.test.ts), plus the
// storage remove the action calls once the row is saved (the row's old photo path).
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
  const removed: string[][] = [];
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
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          removed.push([bucket, ...paths]);
          return { error: null };
        },
      }),
    },
  };
  return { client, calls, removed };
}

const firstOp = (call: Call) => call.ops[0][0];
const isCount = (call: Call) => firstOp(call) === "select" && call.ops.some((op) => op[0] === "neq");

/** The row is active with the old photo, one other base is active, the update touches its row. */
function happyWith(row: { active: boolean; photo_path: string | null }, othersActive = 1): Respond {
  return (call) => {
    if (call.table !== "bases") throw new Error(`unexpected table ${call.table}`);
    if (isCount(call)) return { data: null, error: null, count: othersActive };
    if (firstOp(call) === "select") return { data: [{ id: "lemn", ...row }], error: null };
    if (firstOp(call) === "update") return { data: [{ id: "lemn" }], error: null };
    throw new Error(`unexpected bases.${firstOp(call)}`);
  };
}

function formFor(over: Record<string, string | undefined> = {}): FormData {
  const fd = new FormData();
  fd.set("id", "lemn");
  fd.set("name", "Picioare din lemn");
  fd.set("note", "Stejar, 12 cm");
  fd.set("active", "on");
  fd.set("sort", "0");
  fd.set(PHOTO_FIELDS.path, OLD_PHOTO);
  fd.set(PHOTO_FIELDS.before, OLD_PHOTO);
  for (const [key, value] of Object.entries(over)) {
    if (value === undefined) fd.delete(key);
    else fd.set(key, value);
  }
  return fd;
}

const UPDATE = { name: "Picioare din lemn", note: "Stejar, 12 cm", active: true, sort: 0, photo_path: OLD_PHOTO };

beforeEach(() => {
  mocks.session = ADMIN;
  mocks.createClient.mockReset();
  mocks.updateTag.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveBase", () => {
  it("refuses without an admin session, before touching data", async () => {
    mocks.session = null;
    expect(await saveBase(ADMIN_INITIAL_STATE, formFor())).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("answers not found for a missing id, without a query", async () => {
    expect(await saveBase(ADMIN_INITIAL_STATE, formFor({ id: undefined }))).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.notFound,
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("answers the field errors of an invalid form, and refuses a photo path that is not a bases object", async () => {
    expect(await saveBase(ADMIN_INITIAL_STATE, formFor({ note: "" }))).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { note: ADMIN_MESSAGES.required },
    });
    expect(await saveBase(ADMIN_INITIAL_STATE, formFor({ [PHOTO_FIELDS.path]: "materials/x-1792569508760.webp" }))).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { [PHOTO_FIELDS.path]: ADMIN_MESSAGES.invalid },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("writes the columns with an unchanged photo, removes nothing and expires the catalog tag", async () => {
    const { client, calls, removed } = fakeClient(happyWith({ active: true, photo_path: OLD_PHOTO }));
    mocks.createClient.mockResolvedValue(client);

    const state = await saveBase(ADMIN_INITIAL_STATE, formFor());

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(calls).toEqual([
      { table: "bases", ops: [["select", "id, active, photo_path"], ["eq", "id", "lemn"], ["maybeSingle"]] },
      { table: "bases", ops: [["update", UPDATE], ["eq", "id", "lemn"], ["select", "id"]] },
    ]);
    expect(removed).toEqual([]);
    expect(mocks.updateTag).toHaveBeenCalledTimes(1);
    expect(mocks.updateTag).toHaveBeenCalledWith("catalog");
  });

  it("stores the new photo path and removes the replaced object from the media bucket, after the write", async () => {
    const { client, calls, removed } = fakeClient(happyWith({ active: true, photo_path: OLD_PHOTO }));
    mocks.createClient.mockResolvedValue(client);

    const state = await saveBase(ADMIN_INITIAL_STATE, formFor({ [PHOTO_FIELDS.path]: NEW_PHOTO }));

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(calls[1].ops[0]).toEqual(["update", { ...UPDATE, photo_path: NEW_PHOTO }]);
    expect(removed).toEqual([["media", OLD_PHOTO]]);
    expect(mocks.updateTag).toHaveBeenCalledWith("catalog");
  });

  it("removes the object the row points at, not the one a stale form says it loaded with", async () => {
    const LIVE_PHOTO = "bases/lemn-1792569550000.webp";
    const { client, removed } = fakeClient(happyWith({ active: true, photo_path: LIVE_PHOTO }));
    mocks.createClient.mockResolvedValue(client);

    // The form still carries OLD_PHOTO as `photo_path_before`; another save has since stored LIVE_PHOTO.
    const state = await saveBase(ADMIN_INITIAL_STATE, formFor({ [PHOTO_FIELDS.path]: NEW_PHOTO }));

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(removed).toEqual([["media", LIVE_PHOTO]]);
  });

  it("clears the photo and removes the old object when „Șterge poza” was used", async () => {
    const { client, calls, removed } = fakeClient(happyWith({ active: true, photo_path: OLD_PHOTO }));
    mocks.createClient.mockResolvedValue(client);

    await saveBase(ADMIN_INITIAL_STATE, formFor({ [PHOTO_FIELDS.path]: "" }));

    expect(calls[1].ops[0]).toEqual(["update", { ...UPDATE, photo_path: null }]);
    expect(removed).toEqual([["media", OLD_PHOTO]]);
  });

  it("refuses to deactivate the last active base, before any write", async () => {
    const { client, calls, removed } = fakeClient(happyWith({ active: true, photo_path: OLD_PHOTO }, 0));
    mocks.createClient.mockResolvedValue(client);

    const state = await saveBase(ADMIN_INITIAL_STATE, formFor({ active: undefined }));

    expect(state).toEqual({
      status: "error",
      message: CATALOG_MESSAGES.lastBase,
      fieldErrors: { active: CATALOG_MESSAGES.lastBase },
    });
    expect(calls).toHaveLength(2);
    expect(calls[1].ops).toEqual([
      ["select", "id", { count: "exact", head: true }],
      ["eq", "active", true],
      ["neq", "id", "lemn"],
    ]);
    expect(removed).toEqual([]);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("deactivates a base while another one stays active", async () => {
    const { client, calls } = fakeClient(happyWith({ active: true, photo_path: null }, 1));
    mocks.createClient.mockResolvedValue(client);

    const state = await saveBase(ADMIN_INITIAL_STATE, formFor({ active: undefined, [PHOTO_FIELDS.path]: "", [PHOTO_FIELDS.before]: "" }));

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(calls.map((c) => c.ops[0][0])).toEqual(["select", "select", "update"]);
    expect(calls[2].ops[0]).toEqual(["update", { ...UPDATE, active: false, photo_path: null }]);
  });

  it("does not count the others for a base that is already inactive", async () => {
    const { client, calls } = fakeClient(happyWith({ active: false, photo_path: null }, 0));
    mocks.createClient.mockResolvedValue(client);

    const state = await saveBase(ADMIN_INITIAL_STATE, formFor({ active: undefined, [PHOTO_FIELDS.path]: "", [PHOTO_FIELDS.before]: "" }));

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(calls.map((c) => c.ops[0][0])).toEqual(["select", "update"]);
  });

  it("answers not found when the base row does not exist", async () => {
    const { client } = fakeClient((call) =>
      firstOp(call) === "select" ? { data: [], error: null } : happyWith({ active: true, photo_path: null })(call),
    );
    mocks.createClient.mockResolvedValue(client);

    expect(await saveBase(ADMIN_INITIAL_STATE, formFor())).toEqual({ status: "error", message: ADMIN_MESSAGES.notFound });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("treats an update of 0 rows as a missing role and keeps the old photo object", async () => {
    const { client, removed } = fakeClient((call) =>
      firstOp(call) === "update" ? { data: [], error: null } : happyWith({ active: true, photo_path: OLD_PHOTO })(call),
    );
    mocks.createClient.mockResolvedValue(client);

    const state = await saveBase(ADMIN_INITIAL_STATE, formFor({ [PHOTO_FIELDS.path]: NEW_PHOTO }));

    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(removed).toEqual([]);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("answers the generic message on a Supabase error and logs the real one", async () => {
    const { client } = fakeClient((call) =>
      firstOp(call) === "update"
        ? { data: null, error: { message: "permission denied for table bases" } }
        : happyWith({ active: true, photo_path: OLD_PHOTO })(call),
    );
    mocks.createClient.mockResolvedValue(client);

    expect(await saveBase(ADMIN_INITIAL_STATE, formFor())).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
    expect(vi.mocked(console.error).mock.calls[0][1]).toMatchObject({ message: expect.stringContaining("permission denied") });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("answers the unavailable message when the client cannot be created (no env)", async () => {
    mocks.createClient.mockRejectedValue(new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL"));

    expect(await saveBase(ADMIN_INITIAL_STATE, formFor())).toEqual({ status: "error", message: ADMIN_MESSAGES.unavailable });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });
});
