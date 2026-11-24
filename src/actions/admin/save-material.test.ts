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
  /** `from("materials").select("id, code, family_id, sort")` */
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
      // The read of every material starts with these two columns; the row read does not.
      if (typeof columns === "string" && columns.startsWith("id, code")) return scenario.existing ?? { data: [], error: null };
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

/** The catifea colours of the seed, numbered from 0 as the seed and the Excel import number them, and one of another family. */
const SEEDED = [
  { id: "ct-verde", code: "CT01", family_id: "catifea", sort: 0 },
  { id: "ct-bleumarin", code: "CT02", family_id: "catifea", sort: 1 },
  { id: "ct-mustar", code: "CT03", family_id: "catifea", sort: 2 },
  { id: "ct-roz", code: "CT04", family_id: "catifea", sort: 3 },
  { id: "ct-antracit", code: "CT05", family_id: "catifea", sort: 4 },
  { id: "ct-caramiziu", code: "CT06", family_id: "catifea", sort: 5 },
  { id: "lm-negru", code: "LM05", family_id: "lemn", sort: 40 },
];

/** The `sort` of the row the action inserted. */
const insertedSort = (calls: Call[]) => (calls.find((call) => call.ops[0]?.[0] === "insert")?.ops[0][1] as { sort: number }).sort;

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
    it("gets its id and code from the family, is inserted, expires the catalog and projects tags and opens its screen", async () => {
      const { client, calls, removed } = fakeClient({ insert: { data: [{ id: "ct-verde-sticla" }], error: null } });
      mocks.createClient.mockResolvedValue(client);

      await expect(saveMaterial(ADMIN_INITIAL_STATE, form({ [PHOTO_FIELDS.path]: NEW_PHOTO }))).rejects.toThrow(
        "NEXT_REDIRECT:/admin/catalog/materiale/ct-verde-sticla?creat=1",
      );

      expect(calls[0]).toEqual({
        table: "material_families",
        ops: [["select", "id, code"], ["eq", "id", "catifea"], ["maybeSingle"]],
      });
      // One read of every material serves the id, the code and the family's last order.
      expect(calls[1]).toEqual({ table: "materials", ops: [["select", "id, code, family_id, sort"]] });
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
      // "projects" too: the project captions and the hero ticket cache the colour's name under it.
      expect(mocks.updateTag.mock.calls).toEqual([["catalog"], ["projects"]]);
      expect(mocks.redirect).toHaveBeenCalledWith("/admin/catalog/materiale/ct-verde-sticla?creat=1");
      expect(console.error).not.toHaveBeenCalled();
    });

    it("steps past a taken id and continues the family's numbering, ignoring other families", async () => {
      const { client, calls } = fakeClient({
        existing: {
          data: [
            { id: "ct-verde-sticla", code: "CT01", family_id: "catifea", sort: 0 },
            { id: "ct-verde-sticla-2", code: "CT05", family_id: "catifea", sort: 1 },
            { id: "bc-alb", code: "BC09", family_id: "boucle", sort: 0 },
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

    it("puts a colour whose „Ordine” was left empty after the last colour of its family, ignoring other families", async () => {
      const { client, calls } = fakeClient({ existing: { data: SEEDED, error: null } });
      mocks.createClient.mockResolvedValue(client);

      // Stored as 0 it would tie with ct-verde, and `ct-albastru` sorts before it: the new
      // colour would become the family's first, the one the configurator selects.
      await expect(saveMaterial(ADMIN_INITIAL_STATE, form({ name: "Albastru", sort: "" }))).rejects.toThrow(
        "NEXT_REDIRECT:/admin/catalog/materiale/ct-albastru?creat=1",
      );

      expect(insertedSort(calls)).toBe(6);
      // No extra read for it.
      expect(calls).toHaveLength(3);
    });

    it("treats an „Ordine” that was not posted at all as left empty", async () => {
      const { client, calls } = fakeClient({ existing: { data: SEEDED, error: null } });
      mocks.createClient.mockResolvedValue(client);

      await expect(saveMaterial(ADMIN_INITIAL_STATE, form({ sort: undefined }))).rejects.toThrow("NEXT_REDIRECT");

      expect(insertedSort(calls)).toBe(6);
    });

    it("does not ask a new colour for its „Ordine”, also when another field is refused", async () => {
      // The empty box is an error only on an existing colour.
      const state = await saveMaterial(ADMIN_INITIAL_STATE, form({ name: "", sort: "" }));

      expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.invalid, fieldErrors: { name: ADMIN_MESSAGES.required } });
      expect(mocks.createClient).not.toHaveBeenCalled();
    });

    it("keeps a typed „Ordine”, 0 included", async () => {
      const zero = fakeClient({ existing: { data: SEEDED, error: null } });
      mocks.createClient.mockResolvedValue(zero.client);
      await expect(saveMaterial(ADMIN_INITIAL_STATE, form({ sort: "0" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(insertedSort(zero.calls)).toBe(0);

      const typed = fakeClient({ existing: { data: SEEDED, error: null } });
      mocks.createClient.mockResolvedValue(typed.client);
      await expect(saveMaterial(ADMIN_INITIAL_STATE, form({ sort: "2" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(insertedSort(typed.calls)).toBe(2);
    });

    it("counts the family's inactive colours too, and never stores an order past 999", async () => {
      // The signed-in admin reads every row, the switched-off ones included (RLS: admin_all).
      const inactive = fakeClient({
        existing: { data: [...SEEDED, { id: "ct-vechi", code: "CT07", family_id: "catifea", sort: 30 }], error: null },
      });
      mocks.createClient.mockResolvedValue(inactive.client);
      await expect(saveMaterial(ADMIN_INITIAL_STATE, form({ sort: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(insertedSort(inactive.calls)).toBe(31);
      // The read carries no filter, on `active` or anything else.
      expect(inactive.calls[1].ops).toEqual([["select", "id, code, family_id, sort"]]);

      const full = fakeClient({
        existing: { data: [...SEEDED, { id: "ct-ultim", code: "CT07", family_id: "catifea", sort: 999 }], error: null },
      });
      mocks.createClient.mockResolvedValue(full.client);
      await expect(saveMaterial(ADMIN_INITIAL_STATE, form({ sort: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(insertedSort(full.calls)).toBe(999);
    });

    it("starts a family that has no colour yet at 0", async () => {
      const { client, calls } = fakeClient({
        existing: { data: SEEDED.filter((row) => row.family_id !== "catifea"), error: null },
      });
      mocks.createClient.mockResolvedValue(client);

      await expect(saveMaterial(ADMIN_INITIAL_STATE, form({ sort: "" }))).rejects.toThrow("NEXT_REDIRECT");

      expect(insertedSort(calls)).toBe(0);
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

    it("updates the editable columns only, removes the replaced photo and expires the catalog and projects tags", async () => {
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
      // "projects" too: a renamed or switched-off colour must reach the project captions and
      // the hero ticket now, not when their one-day cache runs out.
      expect(mocks.updateTag.mock.calls).toEqual([["catalog"], ["projects"]]);
      expect(mocks.redirect).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });

    it("refuses an „Ordine” emptied on an existing colour, before touching data: last-in-family is for new colours only", async () => {
      const { client, calls, removed } = fakeClient();
      mocks.createClient.mockResolvedValue(client);

      // Stored as the schema's 0 it would tie with the family's first colour and could take
      // its place, under „Salvat.” and with the box still empty.
      const state = await saveMaterial(ADMIN_INITIAL_STATE, edit({ sort: "" }));

      expect(state).toEqual({
        status: "error",
        message: ADMIN_MESSAGES.invalid,
        fieldErrors: { sort: ADMIN_MESSAGES.required },
      });
      expect(state).toMatchObject({ message: "Verifică câmpurile marcate.", fieldErrors: { sort: "Completează acest câmp." } });
      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
      expect(removed).toEqual([]);
      expect(mocks.updateTag).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it("refuses it the same way when „Ordine” holds only spaces or was not posted at all", async () => {
      const refused = { status: "error", message: ADMIN_MESSAGES.invalid, fieldErrors: { sort: ADMIN_MESSAGES.required } };

      expect(await saveMaterial(ADMIN_INITIAL_STATE, edit({ sort: "   " }))).toEqual(refused);
      expect(await saveMaterial(ADMIN_INITIAL_STATE, edit({ sort: undefined }))).toEqual(refused);
      expect(mocks.createClient).not.toHaveBeenCalled();
    });

    it("names the emptied „Ordine” together with the other invalid fields, in one answer", async () => {
      const state = await saveMaterial(ADMIN_INITIAL_STATE, edit({ name: "", hex: "verde", sort: "" }));

      expect(state).toEqual({
        status: "error",
        message: ADMIN_MESSAGES.invalid,
        fieldErrors: { name: ADMIN_MESSAGES.required, hex: MATERIAL_MESSAGES.hex, sort: ADMIN_MESSAGES.required },
      });
      expect(mocks.createClient).not.toHaveBeenCalled();
    });

    it("keeps a typed „Ordine” on an existing colour, 0 included: first place is a choice when it is typed", async () => {
      const { client, calls } = fakeClient();
      mocks.createClient.mockResolvedValue(client);

      const state = await saveMaterial(ADMIN_INITIAL_STATE, edit({ sort: "0" }));

      expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
      // The row read and the update, nothing about the family's other colours.
      expect(summary(calls).map((c) => c[1])).toEqual(["select", "update"]);
      expect(calls[1].ops[0][1]).toMatchObject({ sort: 0 });
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
