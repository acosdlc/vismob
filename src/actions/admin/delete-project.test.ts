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

import { deleteProject } from "./delete-project";

const ADMIN: AdminSession = { userId: "user-1", email: "atelier@example.com" };

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
  maybeSingle(): Promise<Result>;
  then<R>(onOk: (value: Result) => R, onErr?: (reason: unknown) => R): Promise<R>;
}

/** What each chain answers; the defaults describe a project with two photos. */
interface Scenario {
  /** `from("projects").select("id").eq("id", …).maybeSingle()` */
  project?: Result;
  /** `from("project_photos").select("path").eq("project_id", …)` */
  photos?: Result;
  /** `from("projects").delete().eq("id", …).select("id")` */
  deleted?: Result;
  /** `storage.from("media").remove(paths)` */
  removed?: { error: { message: string } | null };
}

const PROJECT_ID = "9a1b2c3d-0000-4000-8000-00000000abcd";
const PATH_A = `projects/${PROJECT_ID}-1792569508760.webp`;
const PATH_B = `projects/${PROJECT_ID}-1792569508761.webp`;

function respond(scenario: Scenario, call: Call): Result {
  const [method] = call.ops[0] ?? [];
  if (call.table === "project_photos") return scenario.photos ?? { data: [{ path: PATH_A }, { path: PATH_B }], error: null };
  if (call.table === "projects") {
    if (method === "delete") return scenario.deleted ?? { data: [{ id: PROJECT_ID }], error: null };
    return scenario.project ?? { data: { id: PROJECT_ID }, error: null };
  }
  throw new Error(`unexpected chain on ${call.table}: ${JSON.stringify(call.ops)}`);
}

/** Records every chain the action runs and answers each from the scenario. */
function fakeClient(scenario: Scenario = {}) {
  const calls: Call[] = [];
  const removed: [bucket: string, paths: string[]][] = [];
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
            return scenario.removed ?? { error: null };
          },
        };
      },
    },
  };
  return { client, calls, removed, timeline };
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

describe("deleteProject", () => {
  it("refuses without an admin session, before touching data", async () => {
    mocks.session = null;
    const state = await deleteProject(ADMIN_INITIAL_STATE, form(PROJECT_ID));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("refuses a missing or malformed id", async () => {
    expect(await deleteProject(ADMIN_INITIAL_STATE, form())).toEqual({ status: "error", message: ADMIN_MESSAGES.invalid });
    expect(await deleteProject(ADMIN_INITIAL_STATE, form("pat-capitonat"))).toEqual({ status: "error", message: ADMIN_MESSAGES.invalid });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("answers the unavailable message when the client cannot be created (no env)", async () => {
    mocks.createClient.mockRejectedValue(new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL"));
    const state = await deleteProject(ADMIN_INITIAL_STATE, form(PROJECT_ID));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.unavailable });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("deletes the row, then removes every photo object, expires the tag and redirects to the overview", async () => {
    const { client, calls, removed, timeline } = fakeClient();
    mocks.createClient.mockResolvedValue(client);

    await expect(deleteProject(ADMIN_INITIAL_STATE, form(PROJECT_ID))).rejects.toThrow("NEXT_REDIRECT:/admin/lucrari?sters=1");

    expect(calls).toEqual([
      { table: "projects", ops: [["select", "id"], ["eq", "id", PROJECT_ID], ["maybeSingle"]] },
      { table: "project_photos", ops: [["select", "path"], ["eq", "project_id", PROJECT_ID]] },
      { table: "projects", ops: [["delete"], ["eq", "id", PROJECT_ID], ["select", "id"]] },
    ]);
    expect(removed).toEqual([
      ["media", [PATH_A]],
      ["media", [PATH_B]],
    ]);
    expect(timeline).toEqual(["projects.select", "project_photos.select", "projects.delete", `storage.remove:${PATH_A}`, `storage.remove:${PATH_B}`]);
    expect(mocks.updateTag).toHaveBeenCalledTimes(1);
    expect(mocks.updateTag).toHaveBeenCalledWith("projects");
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/lucrari?sters=1");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("deletes a project without photos", async () => {
    const { client, removed } = fakeClient({ photos: { data: [], error: null } });
    mocks.createClient.mockResolvedValue(client);
    await expect(deleteProject(ADMIN_INITIAL_STATE, form(PROJECT_ID))).rejects.toThrow("NEXT_REDIRECT");
    expect(removed).toEqual([]);
    expect(mocks.updateTag).toHaveBeenCalledWith("projects");
  });

  it("still redirects when an object cannot be removed, and logs it", async () => {
    const { client } = fakeClient({ removed: { error: { message: "Object not found" } } });
    mocks.createClient.mockResolvedValue(client);
    await expect(deleteProject(ADMIN_INITIAL_STATE, form(PROJECT_ID))).rejects.toThrow("NEXT_REDIRECT");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Object not found"));
    expect(mocks.updateTag).toHaveBeenCalledWith("projects");
  });

  it("answers notFound for an id the table does not have, without deleting", async () => {
    const { client, calls, removed } = fakeClient({ project: { data: null, error: null } });
    mocks.createClient.mockResolvedValue(client);

    const state = await deleteProject(ADMIN_INITIAL_STATE, form(PROJECT_ID));

    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.notFound });
    expect(calls).toHaveLength(1);
    expect(removed).toEqual([]);
    expect(mocks.updateTag).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("treats a delete of 0 rows as a missing role and keeps the photos", async () => {
    const { client, removed } = fakeClient({ deleted: { data: [], error: null } });
    mocks.createClient.mockResolvedValue(client);

    const state = await deleteProject(ADMIN_INITIAL_STATE, form(PROJECT_ID));

    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(removed).toEqual([]);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("answers the generic message on a Supabase error and logs the real one, keeping the photos", async () => {
    const deleted = fakeClient({ deleted: { data: null, error: { message: "permission denied for table projects" } } });
    mocks.createClient.mockResolvedValue(deleted.client);
    expect(await deleteProject(ADMIN_INITIAL_STATE, form(PROJECT_ID))).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("permission denied for table projects"));
    expect(deleted.removed).toEqual([]);

    const project = fakeClient({ project: { data: null, error: { message: "timeout" } } });
    mocks.createClient.mockResolvedValue(project.client);
    expect(await deleteProject(ADMIN_INITIAL_STATE, form(PROJECT_ID))).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });

    const photos = fakeClient({ photos: { data: null, error: { message: "timeout" } } });
    mocks.createClient.mockResolvedValue(photos.client);
    expect(await deleteProject(ADMIN_INITIAL_STATE, form(PROJECT_ID))).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
    expect(photos.calls).toHaveLength(2);
    expect(mocks.updateTag).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
