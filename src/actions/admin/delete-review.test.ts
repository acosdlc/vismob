// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

import { deleteReview } from "./delete-review";

const ADMIN: AdminSession = { userId: "user-1", email: "atelier@example.com" };

const ID = "11111111-2222-4333-8444-555555555555";

type Result = { data?: unknown; error: { message: string } | null };

/** One `from(table)` chain: the methods called on it, in order, with their arguments. */
interface Call {
  table: string;
  ops: unknown[][];
}

interface FakeQuery {
  select(...args: unknown[]): FakeQuery;
  delete(...args: unknown[]): FakeQuery;
  eq(...args: unknown[]): FakeQuery;
  then<R>(onOk: (value: Result) => R, onErr?: (reason: unknown) => R): Promise<R>;
}

/** Records every chain the action runs and answers each with `result`. */
function fakeClient(result: Result = { data: [{ id: ID }], error: null }) {
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
      delete: record("delete"),
      eq: record("eq"),
      then: (onOk, onErr) => Promise.resolve(result).then(onOk, onErr),
    };
    return q;
  };
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      return builder(call);
    },
  };
  return { client, calls };
}

function form(id?: string): FormData {
  const fd = new FormData();
  if (id !== undefined) fd.set("id", id);
  return fd;
}

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

describe("deleteReview", () => {
  it("refuses without an admin session, before touching data", async () => {
    mocks.session = null;
    const state = await deleteReview(ADMIN_INITIAL_STATE, form(ID));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("refuses a missing, empty or non-uuid id", async () => {
    expect(await deleteReview(ADMIN_INITIAL_STATE, form())).toEqual({ status: "error", message: ADMIN_MESSAGES.invalid });
    expect(await deleteReview(ADMIN_INITIAL_STATE, form(""))).toEqual({ status: "error", message: ADMIN_MESSAGES.invalid });
    expect(await deleteReview(ADMIN_INITIAL_STATE, form("ct-verde"))).toEqual({ status: "error", message: ADMIN_MESSAGES.invalid });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("answers the unavailable message when the client cannot be created (no env)", async () => {
    mocks.createClient.mockRejectedValue(new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL"));
    const state = await deleteReview(ADMIN_INITIAL_STATE, form(ID));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.unavailable });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("deletes the row, expires the reviews tag and redirects to the list", async () => {
    const { client, calls } = fakeClient();
    mocks.createClient.mockResolvedValue(client);

    await expect(deleteReview(ADMIN_INITIAL_STATE, form(ID))).rejects.toThrow("NEXT_REDIRECT:/admin/recenzii?sters=1");

    expect(calls).toEqual([{ table: "reviews", ops: [["delete"], ["eq", "id", ID], ["select", "id"]] }]);
    expect(mocks.updateTag).toHaveBeenCalledTimes(1);
    expect(mocks.updateTag).toHaveBeenCalledWith("reviews");
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/recenzii?sters=1");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("answers forbidden when 0 rows go (no admin role, or a review already gone)", async () => {
    const { client } = fakeClient({ data: [], error: null });
    mocks.createClient.mockResolvedValue(client);

    const state = await deleteReview(ADMIN_INITIAL_STATE, form(ID));

    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.updateTag).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("answers the generic error when the delete fails, and logs it", async () => {
    const { client } = fakeClient({ data: null, error: { message: "connection reset" } });
    mocks.createClient.mockResolvedValue(client);

    const state = await deleteReview(ADMIN_INITIAL_STATE, form(ID));

    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("connection reset"));
    expect(mocks.updateTag).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("answers the generic error when the request itself throws", async () => {
    mocks.createClient.mockResolvedValue({
      from() {
        throw new Error("fetch failed");
      },
    });

    const state = await deleteReview(ADMIN_INITIAL_STATE, form(ID));

    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });
});
