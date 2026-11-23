// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PHOTO_FIELDS } from "@/lib/admin/media";
import { NEW_PHOTO_ALT_FIELD, PHOTO_ROW_ID_FIELD, photoRowFields, PROJECT_MESSAGES } from "@/lib/admin/projects";
import type { AdminSession } from "@/lib/admin/session";
import { ADMIN_INITIAL_STATE, ADMIN_MESSAGES } from "@/lib/admin/types";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  session: null as AdminSession | null,
  createClient: vi.fn(),
  updateTag: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/cache", () => ({ updateTag: mocks.updateTag, refresh: mocks.refresh, cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ getAdminSession: async () => mocks.session }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { saveProjectPhotos } from "./save-project-photos";

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
  delete(...args: unknown[]): FakeQuery;
  eq(...args: unknown[]): FakeQuery;
  maybeSingle(): Promise<Result>;
  then<R>(onOk: (value: Result) => R, onErr?: (reason: unknown) => R): Promise<R>;
}

/** What each chain answers; the defaults describe a published project with two photos. */
interface Scenario {
  /** `from("projects").select("id, published").eq("id", …).maybeSingle()` */
  project?: Result;
  /** `from("project_photos").select("id, path, sort").eq("project_id", …)` */
  photos?: Result;
  /** `from("project_photos").delete().eq("id", …).eq("project_id", …).select("id")` */
  deleted?: Result;
  /** `from("project_photos").update(…).eq("id", …).eq("project_id", …).select("id")` */
  updated?: Result;
  /** `from("project_photos").insert(…).select("id")` */
  inserted?: Result;
}

const PROJECT_ID = "9a1b2c3d-0000-4000-8000-00000000abcd";
const PHOTO_A = { id: "3f2b1c4d-0000-4000-8000-000000000001", path: `projects/${PROJECT_ID}-1792569508760.webp`, sort: 0 };
const PHOTO_B = { id: "3f2b1c4d-0000-4000-8000-000000000002", path: `projects/${PROJECT_ID}-1792569508761.webp`, sort: 3 };
const FOREIGN_ID = "3f2b1c4d-0000-4000-8000-00000000ffff";
const NEW_PATH = `projects/${PROJECT_ID}-1792569600000.webp`;

/** The same project before it is published: it may have no photo at all. */
const UNPUBLISHED = { project: { data: { id: PROJECT_ID, published: false }, error: null } } satisfies Scenario;

function respond(scenario: Scenario, call: Call): Result {
  const [method] = call.ops[0] ?? [];
  if (call.table === "projects") return scenario.project ?? { data: { id: PROJECT_ID, published: true }, error: null };
  if (call.table === "project_photos") {
    if (method === "select") return scenario.photos ?? { data: [PHOTO_A, PHOTO_B], error: null };
    // A delete or update reads back the row it touched (`.select("id")`), as PostgREST does.
    const rowId = call.ops.find((op) => op[0] === "eq" && op[1] === "id")?.[2];
    if (method === "delete") return scenario.deleted ?? { data: [{ id: rowId }], error: null };
    if (method === "update") return scenario.updated ?? { data: [{ id: rowId }], error: null };
    if (method === "insert") return scenario.inserted ?? { data: [{ id: "3f2b1c4d-0000-4000-8000-000000000003" }], error: null };
  }
  throw new Error(`unexpected chain on ${call.table}: ${JSON.stringify(call.ops)}`);
}

/** Records every chain the action runs and answers each from the scenario. */
function fakeClient(scenario: Scenario = {}) {
  const calls: Call[] = [];
  const removed: [bucket: string, paths: string[]][] = [];
  /** Every event in order, so a test can see the row went before the object. */
  const timeline: string[] = [];
  const builder = (call: Call): FakeQuery => {
    const record =
      (method: string) =>
      (...args: unknown[]) => {
        call.ops.push([method, ...args]);
        return q;
      };
    const settle = () => {
      timeline.push(`${call.table}.${String(call.ops[0]?.[0])}`);
      return respond(scenario, call);
    };
    const q: FakeQuery = {
      select: record("select"),
      insert: record("insert"),
      update: record("update"),
      delete: record("delete"),
      eq: record("eq"),
      maybeSingle: () => {
        call.ops.push(["maybeSingle"]);
        return Promise.resolve(settle());
      },
      then: (onOk, onErr) => Promise.resolve().then(settle).then(onOk, onErr),
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
            timeline.push(`storage.remove:${paths.join(",")}`);
            return { error: null };
          },
        };
      },
    },
  };
  return { client, calls, removed, timeline };
}

/** One existing photo's row as the form posts it. */
function row(id: string, alt: string, sort: string, remove = false): [string, string][] {
  const names = photoRowFields(id);
  const entries: [string, string][] = [
    [PHOTO_ROW_ID_FIELD, id],
    [names.alt, alt],
    [names.sort, sort],
  ];
  if (remove) entries.push([names.delete, "on"]);
  return entries;
}

function form(entries: [string, string][], projectId: string = PROJECT_ID): FormData {
  const fd = new FormData();
  fd.set("project_id", projectId);
  for (const [key, value] of entries) fd.append(key, value);
  return fd;
}

const KEEP_BOTH = [...row(PHOTO_A.id, "Patul din față", "0"), ...row(PHOTO_B.id, "Detaliu tăblie", "1")];

/** The chains as `[table, first method, …its arguments]`. */
const summary = (calls: Call[]) => calls.map((call) => [call.table, ...(call.ops[0] ?? [])]);

beforeEach(() => {
  mocks.session = ADMIN;
  mocks.refresh.mockReset();
  mocks.createClient.mockReset();
  mocks.updateTag.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveProjectPhotos", () => {
  it("refuses without an admin session, before touching data", async () => {
    mocks.session = null;
    const state = await saveProjectPhotos(ADMIN_INITIAL_STATE, form(KEEP_BOTH));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("refuses a project id that is not a uuid", async () => {
    const state = await saveProjectPhotos(ADMIN_INITIAL_STATE, form(KEEP_BOTH, "pat-capitonat"));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.invalid });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("answers the field errors of an empty alt text without writing", async () => {
    const state = await saveProjectPhotos(ADMIN_INITIAL_STATE, form([...row(PHOTO_A.id, "", "0"), ...row(PHOTO_B.id, "Ok", "1")]));
    expect(state).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { [photoRowFields(PHOTO_A.id).alt]: PROJECT_MESSAGES.photos },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("requires the alt text of a new photo", async () => {
    const state = await saveProjectPhotos(ADMIN_INITIAL_STATE, form([[PHOTO_FIELDS.path, NEW_PATH]]));
    expect(state).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { [NEW_PHOTO_ALT_FIELD]: PROJECT_MESSAGES.photos },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("answers the unavailable message when the client cannot be created (no env)", async () => {
    mocks.createClient.mockRejectedValue(new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL"));
    const state = await saveProjectPhotos(ADMIN_INITIAL_STATE, form(KEEP_BOTH));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.unavailable });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("writes the alt text and the order of every kept row, scoped to the project, then refreshes and expires the tag", async () => {
    const { client, calls, removed } = fakeClient();
    mocks.createClient.mockResolvedValue(client);

    const state = await saveProjectPhotos(ADMIN_INITIAL_STATE, form(KEEP_BOTH));

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(calls[0]).toEqual({ table: "projects", ops: [["select", "id, published"], ["eq", "id", PROJECT_ID], ["maybeSingle"]] });
    expect(calls[1]).toEqual({ table: "project_photos", ops: [["select", "id, path, sort"], ["eq", "project_id", PROJECT_ID]] });
    expect(calls[2]).toEqual({
      table: "project_photos",
      ops: [["update", { alt: "Patul din față", sort: 0 }], ["eq", "id", PHOTO_A.id], ["eq", "project_id", PROJECT_ID], ["select", "id"]],
    });
    expect(calls[3]).toEqual({
      table: "project_photos",
      ops: [["update", { alt: "Detaliu tăblie", sort: 1 }], ["eq", "id", PHOTO_B.id], ["eq", "project_id", PROJECT_ID], ["select", "id"]],
    });
    expect(calls).toHaveLength(4);
    expect(removed).toEqual([]);
    expect(mocks.updateTag).toHaveBeenCalledTimes(1);
    expect(mocks.updateTag).toHaveBeenCalledWith("projects");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("deletes a ticked row, then removes its object", async () => {
    const { client, calls, removed, timeline } = fakeClient();
    mocks.createClient.mockResolvedValue(client);

    const state = await saveProjectPhotos(ADMIN_INITIAL_STATE, form([...row(PHOTO_A.id, "", "", true), ...row(PHOTO_B.id, "Detaliu tăblie", "1")]));

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(calls[2]).toEqual({
      table: "project_photos",
      ops: [["delete"], ["eq", "id", PHOTO_A.id], ["eq", "project_id", PROJECT_ID], ["select", "id"]],
    });
    expect(removed).toEqual([["media", [PHOTO_A.path]]]);
    expect(timeline.indexOf("project_photos.delete")).toBeLessThan(timeline.indexOf(`storage.remove:${PHOTO_A.path}`));
    expect(summary(calls).map((c) => c[1])).toEqual(["select", "select", "delete", "update"]);
  });

  it("treats a delete of 0 rows as a missing role and keeps the object (RLS filters silently)", async () => {
    const { client, removed } = fakeClient({ deleted: { data: [], error: null } });
    mocks.createClient.mockResolvedValue(client);

    const state = await saveProjectPhotos(ADMIN_INITIAL_STATE, form(row(PHOTO_A.id, "", "", true)));

    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(removed).toEqual([]);
    expect(mocks.updateTag).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("treats an update of 0 rows as a missing role", async () => {
    const { client, calls } = fakeClient({ updated: { data: [], error: null } });
    mocks.createClient.mockResolvedValue(client);

    const state = await saveProjectPhotos(ADMIN_INITIAL_STATE, form(KEEP_BOTH));

    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    // The first refused row stops the save.
    expect(summary(calls).map((c) => c[1])).toEqual(["select", "select", "update"]);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("appends the new photo after the highest existing sort, before it writes the rows", async () => {
    const { client, calls } = fakeClient();
    mocks.createClient.mockResolvedValue(client);

    const state = await saveProjectPhotos(
      ADMIN_INITIAL_STATE,
      form([...KEEP_BOTH, [PHOTO_FIELDS.path, NEW_PATH], [PHOTO_FIELDS.before, ""], [NEW_PHOTO_ALT_FIELD, " Patul în cameră "]]),
    );

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    // The sort follows the rows as they were read (0 and 3), not the order this save gives them.
    expect(calls[2]).toEqual({
      table: "project_photos",
      ops: [["insert", { project_id: PROJECT_ID, path: NEW_PATH, alt: "Patul în cameră", sort: 4 }], ["select", "id"]],
    });
    expect(summary(calls).map((c) => c[1])).toEqual(["select", "select", "insert", "update", "update"]);
  });

  it("does not insert again a photo whose path one of the project's rows already stores", async () => {
    const { client, calls } = fakeClient();
    mocks.createClient.mockResolvedValue(client);

    // The second submit after a save: PhotoField still posts the path the first one stored.
    const state = await saveProjectPhotos(
      ADMIN_INITIAL_STATE,
      form([...KEEP_BOTH, [PHOTO_FIELDS.path, PHOTO_B.path], [PHOTO_FIELDS.before, ""], [NEW_PHOTO_ALT_FIELD, "Detaliu tăblie"]]),
    );

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(summary(calls).map((c) => c[1])).toEqual(["select", "select", "update", "update"]);
    expect(mocks.updateTag).toHaveBeenCalledWith("projects");
  });

  it("gives the first photo of a project the sort 0", async () => {
    const { client, calls } = fakeClient({ photos: { data: [], error: null } });
    mocks.createClient.mockResolvedValue(client);

    await saveProjectPhotos(ADMIN_INITIAL_STATE, form([[PHOTO_FIELDS.path, NEW_PATH], [NEW_PHOTO_ALT_FIELD, "Patul în cameră"]]));

    expect(calls.at(-1)?.ops[0]).toEqual(["insert", { project_id: PROJECT_ID, path: NEW_PATH, alt: "Patul în cameră", sort: 0 }]);
  });

  it("ignores a posted id that is not one of the project's photos", async () => {
    const { client, calls, removed } = fakeClient();
    mocks.createClient.mockResolvedValue(client);

    const state = await saveProjectPhotos(ADMIN_INITIAL_STATE, form([...row(FOREIGN_ID, "Străină", "0", true), ...row(PHOTO_A.id, "Patul din față", "2")]));

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(summary(calls).map((c) => c[1])).toEqual(["select", "select", "update"]);
    expect(calls[2].ops[1]).toEqual(["eq", "id", PHOTO_A.id]);
    expect(removed).toEqual([]);
  });

  it("saves nothing but still refreshes when the form posts no change", async () => {
    const { client, calls } = fakeClient();
    mocks.createClient.mockResolvedValue(client);

    const state = await saveProjectPhotos(ADMIN_INITIAL_STATE, form([]));

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(summary(calls).map((c) => c[1])).toEqual(["select", "select"]);
    expect(mocks.updateTag).toHaveBeenCalledWith("projects");
  });

  it("answers notFound for a project the table does not have, without writing", async () => {
    const { client, calls } = fakeClient({ project: { data: null, error: null } });
    mocks.createClient.mockResolvedValue(client);

    const state = await saveProjectPhotos(ADMIN_INITIAL_STATE, form(KEEP_BOTH));

    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.notFound });
    expect(calls).toHaveLength(1);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("treats an insert of 0 rows as a missing role (RLS filters silently)", async () => {
    const { client } = fakeClient({ inserted: { data: [], error: null } });
    mocks.createClient.mockResolvedValue(client);

    const state = await saveProjectPhotos(ADMIN_INITIAL_STATE, form([[PHOTO_FIELDS.path, NEW_PATH], [NEW_PHOTO_ALT_FIELD, "Patul în cameră"]]));

    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("answers the generic message on a Supabase error and logs the real one", async () => {
    for (const scenario of [
      { project: { data: null, error: { message: "timeout reading projects" } } },
      { photos: { data: null, error: { message: "timeout reading photos" } } },
      { updated: { data: null, error: { message: "permission denied for table project_photos" } } },
    ] satisfies Scenario[]) {
      const { client } = fakeClient(scenario);
      mocks.createClient.mockResolvedValue(client);
      expect(await saveProjectPhotos(ADMIN_INITIAL_STATE, form(KEEP_BOTH))).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
    }
    expect(console.error).toHaveBeenCalledWith("saveProjectPhotos", expect.objectContaining({ message: expect.stringContaining("permission denied") }));

    const deleted = fakeClient({ deleted: { data: null, error: { message: "permission denied" } } });
    mocks.createClient.mockResolvedValue(deleted.client);
    expect(await saveProjectPhotos(ADMIN_INITIAL_STATE, form(row(PHOTO_A.id, "", "", true)))).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
    // The object stays while the row could not be removed.
    expect(deleted.removed).toEqual([]);

    const inserted = fakeClient({ inserted: { data: null, error: { message: "permission denied" } } });
    mocks.createClient.mockResolvedValue(inserted.client);
    expect(await saveProjectPhotos(ADMIN_INITIAL_STATE, form([[PHOTO_FIELDS.path, NEW_PATH], [NEW_PHOTO_ALT_FIELD, "Ok"]]))).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.generic,
    });
    expect(mocks.updateTag).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  describe("the photo a published project keeps", () => {
    const DELETE_BOTH = [...row(PHOTO_A.id, "", "", true), ...row(PHOTO_B.id, "", "", true)];
    const newPhoto = (path: string): [string, string][] => [
      [PHOTO_FIELDS.path, path],
      [PHOTO_FIELDS.before, ""],
      [NEW_PHOTO_ALT_FIELD, "Patul în cameră"],
    ];

    it("refuses a save that would delete every photo of a published project, before any write", async () => {
      const { client, calls, removed } = fakeClient();
      mocks.createClient.mockResolvedValue(client);

      const state = await saveProjectPhotos(ADMIN_INITIAL_STATE, form(DELETE_BOTH));

      expect(state).toEqual({ status: "error", message: PROJECT_MESSAGES.lastPhoto });
      // The two reads and nothing after them: no row deleted, no object removed.
      expect(summary(calls).map((c) => c[1])).toEqual(["select", "select"]);
      expect(removed).toEqual([]);
      expect(mocks.updateTag).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });

    it("refuses the same for the one photo a published project has", async () => {
      const { client, calls, removed } = fakeClient({ photos: { data: [PHOTO_A], error: null } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveProjectPhotos(ADMIN_INITIAL_STATE, form(row(PHOTO_A.id, "", "", true)));

      expect(state).toEqual({ status: "error", message: PROJECT_MESSAGES.lastPhoto });
      expect(summary(calls).map((c) => c[1])).toEqual(["select", "select"]);
      expect(removed).toEqual([]);
    });

    it("lets every photo of a published project go when a new one comes with the same save, the new one written first", async () => {
      const { client, calls, removed, timeline } = fakeClient();
      mocks.createClient.mockResolvedValue(client);

      const state = await saveProjectPhotos(ADMIN_INITIAL_STATE, form([...DELETE_BOTH, ...newPhoto(NEW_PATH)]));

      expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
      // The insert comes before the first delete: at every step in between the project has a photo.
      expect(summary(calls).map((c) => c[1])).toEqual(["select", "select", "insert", "delete", "delete"]);
      expect(timeline).toEqual([
        "projects.select",
        "project_photos.select",
        "project_photos.insert",
        "project_photos.delete",
        `storage.remove:${PHOTO_A.path}`,
        "project_photos.delete",
        `storage.remove:${PHOTO_B.path}`,
      ]);
      expect(removed).toEqual([
        ["media", [PHOTO_A.path]],
        ["media", [PHOTO_B.path]],
      ]);
      expect(mocks.updateTag).toHaveBeenCalledWith("projects");
    });

    it("leaves a published project the photo it had when the new one cannot be written: no row deleted, no file removed", async () => {
      // The only photo is replaced, and the insert fails (the connection to the database
      // drops) or is filtered out (no admin role): neither may cost the project its photo.
      for (const [inserted, message] of [
        [{ data: null, error: { message: "timeout writing the photo" } }, ADMIN_MESSAGES.generic],
        [{ data: [], error: null }, ADMIN_MESSAGES.forbidden],
      ] satisfies [Result, string][]) {
        const { client, removed, timeline } = fakeClient({ photos: { data: [PHOTO_A], error: null }, inserted });
        mocks.createClient.mockResolvedValue(client);

        const state = await saveProjectPhotos(ADMIN_INITIAL_STATE, form([...row(PHOTO_A.id, "", "", true), ...newPhoto(NEW_PATH)]));

        expect(state).toEqual({ status: "error", message });
        expect(timeline).toEqual(["projects.select", "project_photos.select", "project_photos.insert"]);
        expect(removed).toEqual([]);
      }
      expect(console.error).toHaveBeenCalledWith("saveProjectPhotos", expect.objectContaining({ message: expect.stringContaining("timeout writing the photo") }));
      expect(mocks.updateTag).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it("finishes on the next press a save that stopped after the new photo was written, without writing it twice", async () => {
      // The first press wrote the new row, then a delete failed: the screen was not refreshed,
      // so the form posts the same thing again, the ticked old photo and the uploaded path.
      const NEW_ROW = { id: "3f2b1c4d-0000-4000-8000-000000000003", path: NEW_PATH, sort: 1 };
      const { client, removed, timeline } = fakeClient({ photos: { data: [PHOTO_A, NEW_ROW], error: null } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveProjectPhotos(ADMIN_INITIAL_STATE, form([...row(PHOTO_A.id, "", "", true), ...newPhoto(NEW_PATH)]));

      expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
      expect(timeline).toEqual(["projects.select", "project_photos.select", "project_photos.delete", `storage.remove:${PHOTO_A.path}`]);
      expect(removed).toEqual([["media", [PHOTO_A.path]]]);
    });

    it("does not take for a new photo a path one of the deleted rows stores: nothing would be inserted", async () => {
      const { client, calls, removed } = fakeClient();
      mocks.createClient.mockResolvedValue(client);

      const state = await saveProjectPhotos(ADMIN_INITIAL_STATE, form([...DELETE_BOTH, ...newPhoto(PHOTO_B.path)]));

      expect(state).toEqual({ status: "error", message: PROJECT_MESSAGES.lastPhoto });
      expect(summary(calls).map((c) => c[1])).toEqual(["select", "select"]);
      expect(removed).toEqual([]);
    });

    it("lets an unpublished project lose every photo", async () => {
      const { client, calls, removed } = fakeClient(UNPUBLISHED);
      mocks.createClient.mockResolvedValue(client);

      const state = await saveProjectPhotos(ADMIN_INITIAL_STATE, form(DELETE_BOTH));

      expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
      expect(summary(calls).map((c) => c[1])).toEqual(["select", "select", "delete", "delete"]);
      expect(removed).toEqual([
        ["media", [PHOTO_A.path]],
        ["media", [PHOTO_B.path]],
      ]);
    });

    it("refuses a save without a photo for a project published before the rule, and takes its first photo", async () => {
      const none = { photos: { data: [], error: null } } satisfies Scenario;

      const empty = fakeClient(none);
      mocks.createClient.mockResolvedValue(empty.client);
      expect(await saveProjectPhotos(ADMIN_INITIAL_STATE, form([]))).toEqual({ status: "error", message: PROJECT_MESSAGES.lastPhoto });
      expect(summary(empty.calls).map((c) => c[1])).toEqual(["select", "select"]);
      expect(mocks.updateTag).not.toHaveBeenCalled();

      const first = fakeClient(none);
      mocks.createClient.mockResolvedValue(first.client);
      expect(await saveProjectPhotos(ADMIN_INITIAL_STATE, form(newPhoto(NEW_PATH)))).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
      expect(summary(first.calls).map((c) => c[1])).toEqual(["select", "select", "insert"]);
    });

    it("answers notFound, not the photo rule, for a project the table does not have", async () => {
      const { client, calls } = fakeClient({ project: { data: null, error: null } });
      mocks.createClient.mockResolvedValue(client);

      const state = await saveProjectPhotos(ADMIN_INITIAL_STATE, form(DELETE_BOTH));

      expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.notFound });
      expect(calls).toHaveLength(1);
    });
  });
});
