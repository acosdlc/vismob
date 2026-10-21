// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MATERIAL_MESSAGES } from "@/lib/admin/materials";
import { PHOTO_FIELDS } from "@/lib/admin/media";
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

import { saveMaterial } from "./save-material";

const ADMIN: AdminSession = { userId: "user-1", email: "atelier@example.com" };

type Result = { data?: unknown; error: { message: string } | null; count?: number | null };

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

/** What each chain answers; the defaults describe a healthy database with one family and no materials. */
interface Scenario {
  /** `from("material_families").select("id, code").eq("id", …).maybeSingle()` */
  family?: Result;
  /** `from("materials").select("id, code")` */
  existing?: Result;
  /** `from("materials").insert(…).select("id")` */
  insert?: Result;
  /** `from("materials").select("id, family_id, code, active").eq("id", …).maybeSingle()` */
  row?: Result;
  /** `from("materials").select("id", { count }).eq(…).eq(…).neq(…)` */
  others?: Result;
  /** `from("materials").update(…).eq("id", …).select("id")` */
  update?: Result;
}

const ROW = { id: "ct-verde", family_id: "catifea", code: "CT01", active: true };

function respond(scenario: Scenario, call: Call): Result {
  const [method, columns, options] = call.ops[0] ?? [];
  if (call.table === "material_families") return scenario.family ?? { data: { id: "catifea", code: "CT" }, error: null };
  if (call.table === "materials") {
    if (method === "insert") return scenario.insert ?? { data: [{ id: "new" }], error: null };
    if (method === "update") return scenario.update ?? { data: [{ id: ROW.id }], error: null };
    if (method === "select") {
      if (options && typeof options === "object" && "count" in options) return scenario.others ?? { count: 1, data: null, error: null };
      if (columns === "id, code") return scenario.existing ?? { data: [], error: null };
      return scenario.row ?? { data: ROW, error: null };
    }
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
    storage: {
      from(bucket: string) {
        return {
          remove: async (paths: string[]) => {
            removed.push([bucket, paths]);
            return { error: null };
          },
        };
      },
    },
  };
  return { client, calls, removed };
}

const OLD_PHOTO = "materials/ct-verde-1792569508760.webp";
const NEW_PHOTO = "materials/ct-verde-1792569600000.webp";

/** The form's post; `id` "" is a new material. */
function form(overrides: Record<string, string | undefined> = {}): FormData {
  const values: Record<string, string | undefined> = {
    id: "",
    family_id: "catifea",
    name: "Verde sticlă",
    hex: "#2f4b3c",
    supplier: "Textil SRL",
    supplier_code: "VS-220",
    price_category: "B",
    featured: "on",
    active: "on",
    sort: "7",
    [PHOTO_FIELDS.path]: "",
    [PHOTO_FIELDS.before]: "",
    ...overrides,
  };
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) fd.set(key, value);
  }
  return fd;
}

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

describe("saveMaterial", () => {
  it("refuses without an admin session, before touching data", async () => {
    mocks.session = null;
    const state = await saveMaterial(ADMIN_INITIAL_STATE, form());
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("answers the field errors of an invalid form without writing", async () => {
    const state = await saveMaterial(ADMIN_INITIAL_STATE, form({ name: "", hex: "verde" }));
    expect(state).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { name: ADMIN_MESSAGES.required, hex: MATERIAL_MESSAGES.hex },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("refuses a photo path that PhotoField could not have produced", async () => {
    const state = await saveMaterial(ADMIN_INITIAL_STATE, form({ [PHOTO_FIELDS.path]: "bases/x-1792569508760.webp" }));
    expect(state).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { photo_path: ADMIN_MESSAGES.invalid },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("answers the unavailable message when the client cannot be created (no env)", async () => {
    mocks.createClient.mockRejectedValue(new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL"));
    const state = await saveMaterial(ADMIN_INITIAL_STATE, form());
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.unavailable });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  describe("a new material", () => {
    it("gets its id and code from the family, is inserted, expires the catalog tag and opens its screen", async () => {
      const { client, calls, removed } = fakeClient({ insert: { data: [{ id: "ct-verde-sticla" }], error: null } });
      mocks.createClient.mockResolvedValue(client);

      await expect(saveMaterial(ADMIN_INITIAL_STATE, form({ [PHOTO_FIELDS.path]: NEW_PHOTO }))).rejects.toThrow(
        "NEXT_REDIRECT:/admin/catalog/materiale/ct-verde-sticla?creat=1",
      );

      expect(calls[0]).toEqual({
        table: "material_families",
        ops: [["select", "id, code"], ["eq", "id", "catifea"], ["maybeSingle"]],
      });
      expect(calls[1]).toEqual({ table: "materials", ops: [["select", "id, code"]] });
      expect(calls[2]).toEqual({
        table: "materials",
        ops: [
          [
            "insert",
            {
              id: "ct-verde-sticla",
              family_id: "catifea",
              name: "Verde sticlă",
              code: "CT01",
              hex: "#2F4B3C",
              supplier: "Textil SRL",
              supplier_code: "VS-220",
              price_category: "B",
              photo_path: NEW_PHOTO,
              featured: true,
              active: true,
              sort: 7,
            },
          ],
          ["select", "id"],
        ],
      });
      expect(calls).toHaveLength(3);
      expect(removed).toEqual([]);
      expect(mocks.updateTag).toHaveBeenCalledTimes(1);
      expect(mocks.updateTag).toHaveBeenCalledWith("catalog");
      expect(mocks.redirect).toHaveBeenCalledWith("/admin/catalog/materiale/ct-verde-sticla?creat=1");
      expect(console.error).not.toHaveBeenCalled();
    });

    it("steps past a taken id and continues the family's numbering, ignoring other families", async () => {
      const { client, calls } = fakeClient({
        existing: {
          data: [
            { id: "ct-verde-sticla", code: "CT01" },
            { id: "ct-verde-sticla-2", code: "CT05" },
            { id: "bc-alb", code: "BC09" },
          ],
          error: null,
        },
      });
      mocks.createClient.mockResolvedValue(client);

      await expect(saveMaterial(ADMIN_INITIAL_STATE, form())).rejects.toThrow("NEXT_REDIRECT:/admin/catalog/materiale/ct-verde-sticla-3?creat=1");

      const insert = calls[2].ops[0][1] as { id: string; code: string };
      expect(insert.id).toBe("ct-verde-sticla-3");
      expect(insert.code).toBe("CT06");
    });

    it("stores an empty supplier as null and an unticked box as false", async () => {
      const { client, calls } = fakeClient();
      mocks.createClient.mockResolvedValue(client);

      await expect(
        saveMaterial(ADMIN_INITIAL_STATE, form({ supplier: "", supplier_code: "", featured: undefined, active: undefined, sort: "" })),
      ).rejects.toThrow("NEXT_REDIRECT");

      expect(calls[2].ops[0][1]).toMatchObject({ supplier: null, supplier_code: null, featured: false, active: false, sort: 0, photo_path: null });
    });

    it("refuses a family the table does not have, without inserting", async () => {
      const { client, calls } = fakeClient({ family: { data: null, error: null } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveMaterial(ADMIN_INITIAL_STATE, form({ family_id: "matase" }));

      expect(state).toEqual({
        status: "error",
        message: ADMIN_MESSAGES.invalid,
        fieldErrors: { family_id: MATERIAL_MESSAGES.familyUnknown },
      });
      expect(summary(calls)).toEqual([["material_families", "select", "id, code"]]);
      expect(mocks.updateTag).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it("treats an insert of 0 rows as a missing role (RLS filters silently)", async () => {
      const { client } = fakeClient({ insert: { data: [], error: null } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveMaterial(ADMIN_INITIAL_STATE, form());

      expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
      expect(mocks.updateTag).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it("answers the generic message on a Supabase error and logs the real one", async () => {
      const { client } = fakeClient({ insert: { data: null, error: { message: 'duplicate key value violates unique constraint "materials_code_key"' } } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveMaterial(ADMIN_INITIAL_STATE, form());

      expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("materials_code_key"));
      expect(mocks.updateTag).not.toHaveBeenCalled();
    });

    it("answers the generic message when the family or the materials cannot be read", async () => {
      const family = fakeClient({ family: { data: null, error: { message: "timeout" } } });
      mocks.createClient.mockResolvedValue(family.client);
      expect(await saveMaterial(ADMIN_INITIAL_STATE, form())).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });

      const existing = fakeClient({ existing: { data: null, error: { message: "timeout" } } });
      mocks.createClient.mockResolvedValue(existing.client);
      expect(await saveMaterial(ADMIN_INITIAL_STATE, form())).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
      expect(mocks.updateTag).not.toHaveBeenCalled();
    });
  });

  describe("an existing material", () => {
    const edit = (overrides: Record<string, string | undefined> = {}) =>
      form({ id: ROW.id, family_id: "boucle", [PHOTO_FIELDS.path]: NEW_PHOTO, [PHOTO_FIELDS.before]: OLD_PHOTO, ...overrides });

    it("updates the editable columns only, removes the replaced photo and expires the catalog tag", async () => {
      const { client, calls, removed } = fakeClient();
      mocks.createClient.mockResolvedValue(client);

      const state = await saveMaterial(ADMIN_INITIAL_STATE, edit());

      expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
      // The screen re-renders with the saved row; a create redirects instead (no refresh).
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
      expect(calls[0]).toEqual({
        table: "materials",
        ops: [["select", "id, family_id, code, active"], ["eq", "id", ROW.id], ["maybeSingle"]],
      });
      // The posted family_id ("boucle") and any code are ignored: neither is in the payload.
      expect(calls[1]).toEqual({
        table: "materials",
        ops: [
          [
            "update",
            {
              name: "Verde sticlă",
              hex: "#2F4B3C",
              supplier: "Textil SRL",
              supplier_code: "VS-220",
              price_category: "B",
              photo_path: NEW_PHOTO,
              featured: true,
              active: true,
              sort: 7,
            },
          ],
          ["eq", "id", ROW.id],
          ["select", "id"],
        ],
      });
      expect(calls).toHaveLength(2);
      expect(removed).toEqual([["media", [OLD_PHOTO]]]);
      expect(mocks.updateTag).toHaveBeenCalledTimes(1);
      expect(mocks.updateTag).toHaveBeenCalledWith("catalog");
      expect(mocks.redirect).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });

    it("removes nothing when the photo did not change, and the old one when it was cleared", async () => {
      const same = fakeClient();
      mocks.createClient.mockResolvedValue(same.client);
      await saveMaterial(ADMIN_INITIAL_STATE, edit({ [PHOTO_FIELDS.path]: OLD_PHOTO }));
      expect(same.removed).toEqual([]);

      const cleared = fakeClient();
      mocks.createClient.mockResolvedValue(cleared.client);
      await saveMaterial(ADMIN_INITIAL_STATE, edit({ [PHOTO_FIELDS.path]: "" }));
      expect(cleared.calls[1].ops[0][1]).toMatchObject({ photo_path: null });
      expect(cleared.removed).toEqual([["media", [OLD_PHOTO]]]);
    });

    it("refuses to deactivate the last active colour of its family", async () => {
      const { client, calls, removed } = fakeClient({ others: { count: 0, data: null, error: null } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveMaterial(ADMIN_INITIAL_STATE, edit({ active: undefined }));

      expect(state).toEqual({
        status: "error",
        message: MATERIAL_MESSAGES.lastColor,
        fieldErrors: { active: MATERIAL_MESSAGES.lastColor },
      });
      expect(calls[1]).toEqual({
        table: "materials",
        ops: [["select", "id", { count: "exact", head: true }], ["eq", "family_id", "catifea"], ["eq", "active", true], ["neq", "id", ROW.id]],
      });
      expect(calls).toHaveLength(2);
      expect(removed).toEqual([]);
      expect(mocks.updateTag).not.toHaveBeenCalled();
    });

    it("deactivates a colour when the family keeps another active one", async () => {
      const { client, calls } = fakeClient({ others: { count: 2, data: null, error: null } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveMaterial(ADMIN_INITIAL_STATE, edit({ active: undefined }));

      expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
      expect(summary(calls).map((c) => c[1])).toEqual(["select", "select", "update"]);
      expect(calls[2].ops[0][1]).toMatchObject({ active: false });
    });

    it("does not count the family when the material was already inactive", async () => {
      const { client, calls } = fakeClient({ row: { data: { ...ROW, active: false }, error: null } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveMaterial(ADMIN_INITIAL_STATE, edit({ active: undefined }));

      expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
      expect(summary(calls).map((c) => c[1])).toEqual(["select", "update"]);
    });

    it("answers notFound for an id the table does not have", async () => {
      const { client, calls } = fakeClient({ row: { data: null, error: null } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveMaterial(ADMIN_INITIAL_STATE, edit({ id: "ct-nimic" }));

      expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.notFound });
      expect(calls).toHaveLength(1);
      expect(mocks.updateTag).not.toHaveBeenCalled();
    });

    it("treats an update of 0 rows as a missing role and keeps the photos", async () => {
      const { client, removed } = fakeClient({ update: { data: [], error: null } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveMaterial(ADMIN_INITIAL_STATE, edit());

      expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
      expect(removed).toEqual([]);
      expect(mocks.updateTag).not.toHaveBeenCalled();
    });

    it("answers the generic message on a Supabase error and logs the real one", async () => {
      const { client, removed } = fakeClient({ update: { data: null, error: { message: "permission denied for table materials" } } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveMaterial(ADMIN_INITIAL_STATE, edit());

      expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("permission denied for table materials"));
      expect(removed).toEqual([]);
      expect(mocks.updateTag).not.toHaveBeenCalled();
    });

    it("answers the generic message when the row or the family count cannot be read", async () => {
      const row = fakeClient({ row: { data: null, error: { message: "timeout" } } });
      mocks.createClient.mockResolvedValue(row.client);
      expect(await saveMaterial(ADMIN_INITIAL_STATE, edit())).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });

      const others = fakeClient({ others: { count: null, data: null, error: { message: "timeout" } } });
      mocks.createClient.mockResolvedValue(others.client);
      expect(await saveMaterial(ADMIN_INITIAL_STATE, edit({ active: undefined }))).toEqual({
        status: "error",
        message: ADMIN_MESSAGES.generic,
      });
      expect(mocks.updateTag).not.toHaveBeenCalled();
    });
  });
});
