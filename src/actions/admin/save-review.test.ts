// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REVIEW_MESSAGES } from "@/lib/admin/reviews";
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

import { saveReview } from "./save-review";

const ADMIN: AdminSession = { userId: "user-1", email: "atelier@example.com" };

const ID = "11111111-2222-4333-8444-555555555555";
const NEW_ID = "66666666-7777-4888-9999-000000000000";

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
  maybeSingle(): Promise<Result>;
  then<R>(onOk: (value: Result) => R, onErr?: (reason: unknown) => R): Promise<R>;
}

/** What each chain answers; the defaults describe a healthy database holding the review ID. */
interface Scenario {
  /** `from("reviews").insert(…).select("id")` */
  insert?: Result;
  /** `from("reviews").select("id").eq("id", …).maybeSingle()` */
  row?: Result;
  /** `from("reviews").update(…).eq("id", …).select("id")` */
  update?: Result;
}

function respond(scenario: Scenario, call: Call): Result {
  const [method] = call.ops[0] ?? [];
  if (call.table === "reviews") {
    if (method === "insert") return scenario.insert ?? { data: [{ id: NEW_ID }], error: null };
    if (method === "update") return scenario.update ?? { data: [{ id: ID }], error: null };
    if (method === "select") return scenario.row ?? { data: { id: ID }, error: null };
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
  };
  return { client, calls };
}

/** The form's post; `id` "" is a new review. */
function form(overrides: Record<string, string | undefined> = {}): FormData {
  const values: Record<string, string | undefined> = {
    id: "",
    first_name: "Ana",
    city: "Cluj",
    body: "Patul a venit exact cum l-am configurat.",
    model_label: "Capitonat · 160 × 200",
    source: "google",
    consent: "on",
    published: "on",
    sort: "3",
    ...overrides,
  };
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) fd.set(key, value);
  }
  return fd;
}

/** What a valid default form() writes. */
const COLUMNS = {
  first_name: "Ana",
  city: "Cluj",
  body: "Patul a venit exact cum l-am configurat.",
  model_label: "Capitonat · 160 × 200",
  source: "google",
  consent: true,
  published: true,
  sort: 3,
};

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

describe("saveReview", () => {
  it("refuses without an admin session, before touching data", async () => {
    mocks.session = null;
    const state = await saveReview(ADMIN_INITIAL_STATE, form());
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("answers the field errors of an invalid form without writing", async () => {
    const state = await saveReview(ADMIN_INITIAL_STATE, form({ first_name: "", source: "instagram" }));
    expect(state).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { first_name: ADMIN_MESSAGES.required, source: ADMIN_MESSAGES.invalid },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("refuses to publish without the consent, before any write", async () => {
    const state = await saveReview(ADMIN_INITIAL_STATE, form({ consent: undefined, published: "on" }));
    expect(state).toEqual({
      status: "error",
      message: REVIEW_MESSAGES.consent,
      fieldErrors: { published: REVIEW_MESSAGES.consent },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("saves an unpublished review without the consent", async () => {
    const { client, calls } = fakeClient();
    mocks.createClient.mockResolvedValue(client);

    await expect(saveReview(ADMIN_INITIAL_STATE, form({ consent: undefined, published: undefined }))).rejects.toThrow("NEXT_REDIRECT");

    expect(calls[0]?.ops[0]).toEqual(["insert", { ...COLUMNS, consent: false, published: false }]);
  });

  it("answers notFound for a hidden id that is not a uuid, without a query", async () => {
    const state = await saveReview(ADMIN_INITIAL_STATE, form({ id: "ct-verde" }));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.notFound });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("answers the unavailable message when the client cannot be created (no env)", async () => {
    mocks.createClient.mockRejectedValue(new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL"));
    const state = await saveReview(ADMIN_INITIAL_STATE, form());
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.unavailable });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  describe("a new review", () => {
    it("is inserted with every column, expires the reviews tag and opens its screen", async () => {
      const { client, calls } = fakeClient();
      mocks.createClient.mockResolvedValue(client);

      await expect(saveReview(ADMIN_INITIAL_STATE, form())).rejects.toThrow(`NEXT_REDIRECT:/admin/recenzii/${NEW_ID}?creat=1`);

      expect(calls).toEqual([{ table: "reviews", ops: [["insert", COLUMNS], ["select", "id"]] }]);
      expect(mocks.updateTag).toHaveBeenCalledTimes(1);
      expect(mocks.updateTag).toHaveBeenCalledWith("reviews");
      expect(mocks.redirect).toHaveBeenCalledWith(`/admin/recenzii/${NEW_ID}?creat=1`);
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });

    it("writes null for the empty optional columns", async () => {
      const { client, calls } = fakeClient();
      mocks.createClient.mockResolvedValue(client);

      await expect(saveReview(ADMIN_INITIAL_STATE, form({ city: "", model_label: "", source: "" }))).rejects.toThrow("NEXT_REDIRECT");

      expect(calls[0]?.ops[0]).toEqual(["insert", { ...COLUMNS, city: null, model_label: null, source: null }]);
    });

    it("answers forbidden when the insert writes 0 rows (RLS without the admin role)", async () => {
      const { client } = fakeClient({ insert: { data: [], error: null } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveReview(ADMIN_INITIAL_STATE, form());

      expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
      expect(mocks.updateTag).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it("answers the generic error when the insert fails, and logs it", async () => {
      const { client } = fakeClient({ insert: { data: null, error: { message: "new row violates check constraint" } } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveReview(ADMIN_INITIAL_STATE, form());

      expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("new row violates check constraint"));
      expect(mocks.updateTag).not.toHaveBeenCalled();
    });

    it("answers the generic error when the request itself throws", async () => {
      mocks.createClient.mockResolvedValue({
        from() {
          throw new Error("fetch failed");
        },
      });

      const state = await saveReview(ADMIN_INITIAL_STATE, form());

      expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
      expect(mocks.updateTag).not.toHaveBeenCalled();
    });
  });

  describe("an existing review", () => {
    it("reads the row, updates every column, expires the reviews tag and refreshes", async () => {
      const { client, calls } = fakeClient();
      mocks.createClient.mockResolvedValue(client);

      const state = await saveReview(ADMIN_INITIAL_STATE, form({ id: ID, first_name: "Maria", published: undefined }));

      expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
      expect(calls).toEqual([
        { table: "reviews", ops: [["select", "id"], ["eq", "id", ID], ["maybeSingle"]] },
        { table: "reviews", ops: [["update", { ...COLUMNS, first_name: "Maria", published: false }], ["eq", "id", ID], ["select", "id"]] },
      ]);
      expect(mocks.updateTag).toHaveBeenCalledTimes(1);
      expect(mocks.updateTag).toHaveBeenCalledWith("reviews");
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
      expect(mocks.redirect).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });

    it("answers notFound for an id the table does not have, without writing", async () => {
      const { client, calls } = fakeClient({ row: { data: null, error: null } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveReview(ADMIN_INITIAL_STATE, form({ id: NEW_ID }));

      expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.notFound });
      expect(calls).toHaveLength(1);
      expect(mocks.updateTag).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it("answers the generic error when the read fails", async () => {
      const { client, calls } = fakeClient({ row: { data: null, error: { message: "connection reset" } } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveReview(ADMIN_INITIAL_STATE, form({ id: ID }));

      expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
      expect(calls).toHaveLength(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("connection reset"));
    });

    it("answers forbidden when the update writes 0 rows", async () => {
      const { client } = fakeClient({ update: { data: [], error: null } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveReview(ADMIN_INITIAL_STATE, form({ id: ID }));

      expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
      expect(mocks.updateTag).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it("answers the generic error when the update fails, and logs it", async () => {
      const { client } = fakeClient({ update: { data: null, error: { message: "permission denied" } } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveReview(ADMIN_INITIAL_STATE, form({ id: ID }));

      expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("permission denied"));
      expect(mocks.updateTag).not.toHaveBeenCalled();
    });

    it("applies the consent rule to an edit too", async () => {
      const state = await saveReview(ADMIN_INITIAL_STATE, form({ id: ID, consent: undefined, published: "on" }));
      expect(state).toEqual({
        status: "error",
        message: REVIEW_MESSAGES.consent,
        fieldErrors: { published: REVIEW_MESSAGES.consent },
      });
      expect(mocks.createClient).not.toHaveBeenCalled();
    });
  });
});
