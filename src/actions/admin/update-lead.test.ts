// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminSession } from "@/lib/admin/session";
import { ADMIN_INITIAL_STATE, ADMIN_MESSAGES } from "@/lib/admin/types";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  session: null as AdminSession | null,
  createClient: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/cache", () => ({ updateTag: vi.fn(), refresh: mocks.refresh, cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ getAdminSession: async () => mocks.session }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { updateLead } from "./update-lead";

const ADMIN: AdminSession = { userId: "user-1", email: "atelier@example.com" };
const LEAD_ID = "11111111-2222-4333-8444-555555555555";

/** The one chain the action runs: from("leads").update({...}).eq("id", leadId).select("id"). */
interface FakeCalls {
  table?: string;
  update?: unknown;
  eq?: [string, unknown];
  select?: string;
}

function fakeClient(result: { data: unknown; error: { message: string } | null }) {
  const calls: FakeCalls = {};
  const client = {
    from(table: string) {
      calls.table = table;
      return {
        update(payload: unknown) {
          calls.update = payload;
          return {
            eq(column: string, value: unknown) {
              calls.eq = [column, value];
              return {
                select: async (columns: string) => {
                  calls.select = columns;
                  return result;
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

function form(entries: Record<string, string | undefined>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) if (value !== undefined) fd.set(key, value);
  return fd;
}

const VALID = { leadId: LEAD_ID, status: "contactat", notes: "  Sunat marți, revine cu dimensiunile.  " };

beforeEach(() => {
  mocks.session = ADMIN;
  mocks.createClient.mockReset();
  mocks.refresh.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("updateLead", () => {
  it("refuses without an admin session, before touching data", async () => {
    mocks.session = null;
    const state = await updateLead(ADMIN_INITIAL_STATE, form(VALID));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("answers field errors for a bad id, an unknown status or notes over 4000 characters, without writing", async () => {
    const state = await updateLead(
      ADMIN_INITIAL_STATE,
      form({ leadId: "nope", status: "sters", notes: "x".repeat(4001) }),
    );
    expect(state).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { leadId: ADMIN_MESSAGES.invalid, status: ADMIN_MESSAGES.invalid, notes: ADMIN_MESSAGES.tooLong },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("requires the notes field to be posted (the form always does), accepting it empty", async () => {
    const missing = await updateLead(ADMIN_INITIAL_STATE, form({ leadId: LEAD_ID, status: "nou" }));
    expect(missing).toMatchObject({ status: "error", fieldErrors: { notes: ADMIN_MESSAGES.required } });

    const { client, calls } = fakeClient({ data: [{ id: LEAD_ID }], error: null });
    mocks.createClient.mockResolvedValue(client);
    const state = await updateLead(ADMIN_INITIAL_STATE, form({ leadId: LEAD_ID, status: "nou", notes: "   " }));
    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(calls.update).toEqual({ status: "nou", notes: null });
  });

  it("writes the status and the trimmed notes to the one lead, then refreshes the page", async () => {
    const { client, calls } = fakeClient({ data: [{ id: LEAD_ID }], error: null });
    mocks.createClient.mockResolvedValue(client);

    const state = await updateLead(ADMIN_INITIAL_STATE, form(VALID));

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(calls).toEqual({
      table: "leads",
      update: { status: "contactat", notes: "Sunat marți, revine cu dimensiunile." },
      eq: ["id", LEAD_ID],
      select: "id",
    });
    // The detail page renders the status badge from the row, so the action re-renders it.
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("treats an update of 0 rows as a missing role (RLS filters silently)", async () => {
    const { client } = fakeClient({ data: [], error: null });
    mocks.createClient.mockResolvedValue(client);
    const state = await updateLead(ADMIN_INITIAL_STATE, form(VALID));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("answers the generic message on a Supabase error and logs the real one", async () => {
    const { client } = fakeClient({ data: null, error: { message: "permission denied for table leads" } });
    mocks.createClient.mockResolvedValue(client);
    const state = await updateLead(ADMIN_INITIAL_STATE, form(VALID));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("permission denied for table leads"));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("answers the unavailable message when the client cannot be created (no env)", async () => {
    mocks.createClient.mockRejectedValue(new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL"));
    const state = await updateLead(ADMIN_INITIAL_STATE, form(VALID));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.unavailable });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
