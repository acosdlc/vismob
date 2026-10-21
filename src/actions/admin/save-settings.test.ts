// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminSession } from "@/lib/admin/session";
import { SETTINGS_MESSAGES } from "@/lib/admin/settings-schema";
import { ADMIN_INITIAL_STATE, ADMIN_MESSAGES } from "@/lib/admin/types";
import { SEED_SETTINGS, type Settings } from "@/lib/data/settings.seed";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  session: null as AdminSession | null,
  createClient: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("next/cache", () => ({ updateTag: mocks.updateTag, cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ getAdminSession: async () => mocks.session }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { saveSettings } from "./save-settings";

const ADMIN: AdminSession = { userId: "user-1", email: "atelier@example.com" };

/** The one chain the action runs: from("settings").update({ data }).eq("id", 1).select("id"). */
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

/** The form's post for a Settings object: every text as a string, a ticked checkbox as "on". */
function formFor(settings: Settings): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value === "boolean") {
      if (value) fd.set(key, "on");
    } else {
      fd.set(key, value);
    }
  }
  return fd;
}

const SAVED: Settings = { ...SEED_SETTINGS, workshop_name: "Atelierul", show_prices: true, whatsapp_number: "40722123456" };

beforeEach(() => {
  mocks.session = ADMIN;
  mocks.createClient.mockReset();
  mocks.updateTag.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveSettings", () => {
  it("refuses without an admin session, before touching data", async () => {
    mocks.session = null;
    const state = await saveSettings(ADMIN_INITIAL_STATE, formFor(SAVED));
    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("answers the field errors of an invalid form without writing", async () => {
    const fd = formFor({ ...SAVED, instagram_url: "instagram.com/atelier", whatsapp_number: "+40722" });
    const state = await saveSettings(ADMIN_INITIAL_STATE, fd);
    expect(state).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { instagram_url: SETTINGS_MESSAGES.url, whatsapp_number: SETTINGS_MESSAGES.digits },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("writes the whole object to settings row 1, then expires the settings tag", async () => {
    const { client, calls } = fakeClient({ data: [{ id: 1 }], error: null });
    mocks.createClient.mockResolvedValue(client);

    const state = await saveSettings(ADMIN_INITIAL_STATE, formFor(SAVED));

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(calls).toEqual({ table: "settings", update: { data: SAVED }, eq: ["id", 1], select: "id" });
    expect(mocks.updateTag).toHaveBeenCalledTimes(1);
    expect(mocks.updateTag).toHaveBeenCalledWith("settings");
  });

  it("treats an update of 0 rows as a missing role (RLS filters silently)", async () => {
    const { client } = fakeClient({ data: [], error: null });
    mocks.createClient.mockResolvedValue(client);

    const state = await saveSettings(ADMIN_INITIAL_STATE, formFor(SAVED));

    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("answers the generic message on a Supabase error and logs the real one", async () => {
    const { client } = fakeClient({ data: null, error: { message: "permission denied for table settings" } });
    mocks.createClient.mockResolvedValue(client);

    const state = await saveSettings(ADMIN_INITIAL_STATE, formFor(SAVED));

    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("permission denied for table settings"));
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("answers the unavailable message when the client cannot be created (no env)", async () => {
    mocks.createClient.mockRejectedValue(new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL"));

    const state = await saveSettings(ADMIN_INITIAL_STATE, formFor(SAVED));

    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.unavailable });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });
});
