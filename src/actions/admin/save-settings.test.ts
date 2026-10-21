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
  /** Every storage removal, in order: [bucket, paths]. */
  const removed: [string, string[]][] = [];
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
    storage: {
      from(bucket: string): { remove(paths: string[]): Promise<{ error: { message: string } | null }> } {
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

const OLD_PHOTO = "site/atelier-1792569508000.webp";
const NEW_PHOTO = "site/atelier-1792569508760.webp";

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
    const { client, calls, removed } = fakeClient({ data: [{ id: 1 }], error: null });
    mocks.createClient.mockResolvedValue(client);

    const state = await saveSettings(ADMIN_INITIAL_STATE, formFor(SAVED));

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(calls).toEqual({ table: "settings", update: { data: SAVED }, eq: ["id", 1], select: "id" });
    expect(removed).toEqual([]);
    expect(mocks.updateTag).toHaveBeenCalledTimes(1);
    expect(mocks.updateTag).toHaveBeenCalledWith("settings");
  });

  it("refuses a workshop photo path outside the site folder, without writing", async () => {
    const fd = formFor({ ...SAVED, atelier_photo_path: "materials/ct-verde-1792569508760.webp" });
    const state = await saveSettings(ADMIN_INITIAL_STATE, fd);
    expect(state).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { atelier_photo_path: SETTINGS_MESSAGES.photo },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("removes the workshop photo the save replaced, only after the write", async () => {
    const { client, calls, removed } = fakeClient({ data: [{ id: 1 }], error: null });
    mocks.createClient.mockResolvedValue(client);
    const fd = formFor({ ...SAVED, atelier_photo_path: NEW_PHOTO });
    fd.set("atelier_photo_path_before", OLD_PHOTO);

    const state = await saveSettings(ADMIN_INITIAL_STATE, fd);

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    // The `_before` input is not a Settings key: it never reaches the row.
    expect(calls.update).toEqual({ data: { ...SAVED, atelier_photo_path: NEW_PHOTO } });
    expect(removed).toEqual([["media", [OLD_PHOTO]]]);
    expect(mocks.updateTag).toHaveBeenCalledWith("settings");
  });

  it("removes the old photo when the admin deleted it (empty path)", async () => {
    const { client, calls, removed } = fakeClient({ data: [{ id: 1 }], error: null });
    mocks.createClient.mockResolvedValue(client);
    const fd = formFor({ ...SAVED, atelier_photo_path: "" });
    fd.set("atelier_photo_path_before", OLD_PHOTO);

    const state = await saveSettings(ADMIN_INITIAL_STATE, fd);

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(calls.update).toEqual({ data: { ...SAVED, atelier_photo_path: "" } });
    expect(removed).toEqual([["media", [OLD_PHOTO]]]);
  });

  it("removes nothing when the photo is unchanged", async () => {
    const { client, removed } = fakeClient({ data: [{ id: 1 }], error: null });
    mocks.createClient.mockResolvedValue(client);
    const fd = formFor({ ...SAVED, atelier_photo_path: OLD_PHOTO });
    fd.set("atelier_photo_path_before", OLD_PHOTO);

    const state = await saveSettings(ADMIN_INITIAL_STATE, fd);

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(removed).toEqual([]);
  });

  it("ignores a `_before` value that is not a site photo path", async () => {
    for (const before of ["materials/ct-verde-1792569508760.webp", "site/atelier.webp", "../x", "nu"]) {
      const { client, removed } = fakeClient({ data: [{ id: 1 }], error: null });
      mocks.createClient.mockResolvedValue(client);
      const fd = formFor({ ...SAVED, atelier_photo_path: NEW_PHOTO });
      fd.set("atelier_photo_path_before", before);

      const state = await saveSettings(ADMIN_INITIAL_STATE, fd);

      expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
      expect(removed).toEqual([]);
    }
  });

  it("removes nothing when the write fails or touches no row", async () => {
    for (const result of [
      { data: [], error: null },
      { data: null, error: { message: "permission denied for table settings" } },
    ]) {
      const { client, removed } = fakeClient(result);
      mocks.createClient.mockResolvedValue(client);
      const fd = formFor({ ...SAVED, atelier_photo_path: NEW_PHOTO });
      fd.set("atelier_photo_path_before", OLD_PHOTO);

      const state = await saveSettings(ADMIN_INITIAL_STATE, fd);

      expect(state.status).toBe("error");
      expect(removed).toEqual([]);
    }
  });

  it("still answers saved when the old photo cannot be removed, and logs it", async () => {
    const { client, calls } = fakeClient({ data: [{ id: 1 }], error: null });
    client.storage.from = () => ({ remove: async () => ({ error: { message: "object not found" } }) });
    mocks.createClient.mockResolvedValue(client);
    const fd = formFor({ ...SAVED, atelier_photo_path: NEW_PHOTO });
    fd.set("atelier_photo_path_before", OLD_PHOTO);

    const state = await saveSettings(ADMIN_INITIAL_STATE, fd);

    expect(state).toEqual({ status: "ok", message: ADMIN_MESSAGES.saved });
    expect(calls.update).toEqual({ data: { ...SAVED, atelier_photo_path: NEW_PHOTO } });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("object not found"));
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
