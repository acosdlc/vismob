// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminSession } from "@/lib/admin/session";
import { ADMIN_INITIAL_STATE, ADMIN_MESSAGES } from "@/lib/admin/types";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  session: null as AdminSession | null,
  createClient: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next/cache", () => ({ updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/admin/auth", () => ({ getAdminSession: async () => mocks.session }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { deleteLead } from "./delete-lead";

const ADMIN: AdminSession = { userId: "user-1", email: "atelier@example.com" };
const LEAD_ID = "11111111-2222-4333-8444-555555555555";

type Result = { data: unknown; error: { message: string } | null };

interface FakeOptions {
  /** `from("lead_files").select("path").eq("lead_id", id)` */
  files?: Result;
  /** `from("leads").delete().eq("id", id).select("id")` */
  deleted?: Result;
  /** `storage.from(bucket).remove(paths)` */
  removed?: Result;
}

/** Records the three chains the action runs, in order. */
function fakeClient(options: FakeOptions = {}) {
  const calls: unknown[] = [];
  const files = options.files ?? { data: [], error: null };
  const deleted = options.deleted ?? { data: [{ id: LEAD_ID }], error: null };
  const removed = options.removed ?? { data: [], error: null };
  const client = {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq: async (column: string, value: unknown) => {
              calls.push(["select", table, columns, column, value]);
              return files;
            },
          };
        },
        delete() {
          return {
            eq(column: string, value: unknown) {
              return {
                select: async (columns: string) => {
                  calls.push(["delete", table, column, value, columns]);
                  return deleted;
                },
              };
            },
          };
        },
      };
    },
    storage: {
      from(bucket: string) {
        return {
          remove: async (paths: string[]) => {
            calls.push(["remove", bucket, paths]);
            return removed;
          },
        };
      },
    },
  };
  return { client, calls };
}

function form(leadId?: string): FormData {
  const fd = new FormData();
  if (leadId !== undefined) fd.set("leadId", leadId);
  return fd;
}

beforeEach(() => {
  mocks.session = ADMIN;
  mocks.createClient.mockReset();
  mocks.redirect.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("deleteLead", () => {
  it("refuses without an admin session, before touching data", async () => {
    mocks.session = null;
    const state = await deleteLead(ADMIN_INITIAL_STATE, form(LEAD_ID));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a UUID", async () => {
    expect(await deleteLead(ADMIN_INITIAL_STATE, form("nope"))).toEqual({ status: "error", message: ADMIN_MESSAGES.invalid });
    expect(await deleteLead(ADMIN_INITIAL_STATE, form())).toEqual({ status: "error", message: ADMIN_MESSAGES.invalid });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("removes the photos, deletes the lead and redirects to the list", async () => {
    const { client, calls } = fakeClient({
      files: { data: [{ path: `leads/${LEAD_ID}/a.jpg` }, { path: `leads/${LEAD_ID}/b.jpg` }], error: null },
    });
    mocks.createClient.mockResolvedValue(client);

    await expect(deleteLead(ADMIN_INITIAL_STATE, form(LEAD_ID))).rejects.toThrow("NEXT_REDIRECT:/admin/cereri");

    expect(calls).toEqual([
      ["select", "lead_files", "path", "lead_id", LEAD_ID],
      ["remove", "lead-uploads", [`leads/${LEAD_ID}/a.jpg`, `leads/${LEAD_ID}/b.jpg`]],
      ["delete", "leads", "id", LEAD_ID, "id"],
    ]);
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/cereri");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("skips the storage call when the lead has no photos", async () => {
    const { client, calls } = fakeClient();
    mocks.createClient.mockResolvedValue(client);
    await expect(deleteLead(ADMIN_INITIAL_STATE, form(LEAD_ID))).rejects.toThrow("NEXT_REDIRECT");
    expect(calls.map((c) => (c as unknown[])[0])).toEqual(["select", "delete"]);
  });

  it("logs a storage failure and still deletes the lead", async () => {
    const { client, calls } = fakeClient({
      files: { data: [{ path: "leads/x/a.jpg" }], error: null },
      removed: { data: null, error: { message: "object not found" } },
    });
    mocks.createClient.mockResolvedValue(client);
    await expect(deleteLead(ADMIN_INITIAL_STATE, form(LEAD_ID))).rejects.toThrow("NEXT_REDIRECT");
    expect(calls.map((c) => (c as unknown[])[0])).toEqual(["select", "remove", "delete"]);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("object not found"));
  });

  it("logs a lead_files read failure and still deletes the lead", async () => {
    const { client, calls } = fakeClient({ files: { data: null, error: { message: "timeout" } } });
    mocks.createClient.mockResolvedValue(client);
    await expect(deleteLead(ADMIN_INITIAL_STATE, form(LEAD_ID))).rejects.toThrow("NEXT_REDIRECT");
    expect(calls.map((c) => (c as unknown[])[0])).toEqual(["select", "delete"]);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("timeout"));
  });

  it("treats a delete of 0 rows as a missing role (RLS filters silently) and does not redirect", async () => {
    const { client } = fakeClient({ deleted: { data: [], error: null } });
    mocks.createClient.mockResolvedValue(client);
    const state = await deleteLead(ADMIN_INITIAL_STATE, form(LEAD_ID));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("answers the generic message on a Supabase error and logs the real one", async () => {
    const { client } = fakeClient({ deleted: { data: null, error: { message: "permission denied for table leads" } } });
    mocks.createClient.mockResolvedValue(client);
    const state = await deleteLead(ADMIN_INITIAL_STATE, form(LEAD_ID));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("permission denied for table leads"));
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("answers the unavailable message when the client cannot be created (no env)", async () => {
    mocks.createClient.mockRejectedValue(new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL"));
    const state = await deleteLead(ADMIN_INITIAL_STATE, form(LEAD_ID));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.unavailable });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
