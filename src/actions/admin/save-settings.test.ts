// @vitest-environment node
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminSession } from "@/lib/admin/session";
import { SETTINGS_FINGERPRINT_FIELD } from "@/lib/admin/settings-fields";
import { settingsFingerprint } from "@/lib/admin/settings-fingerprint";
import { SETTINGS_MESSAGES } from "@/lib/admin/settings-schema";
import { ADMIN_INITIAL_STATE, ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
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
// The Setări page is read in the last tests, for what it hands the form; the form is not rendered.
vi.mock("@/components/admin/SettingsForm", () => ({ SettingsForm: () => null }));

import SetariPage from "@/app/admin/(panel)/setari/page";
import { SettingsForm, type SettingsFormProps } from "@/components/admin/SettingsForm";
import { saveSettings } from "./save-settings";

const ADMIN: AdminSession = { userId: "user-1", email: "atelier@example.com" };

/** An object as jsonb gives it back: the keys by length, then by bytes, whatever order they were written in. */
function asStored(data: unknown): unknown {
  const entries = Object.entries(data as object).sort(([a], [b]) => a.length - b.length || (a < b ? -1 : 1));
  return JSON.parse(JSON.stringify(Object.fromEntries(entries)));
}

/** `settings.data` of row 1 when a test starts, and its fingerprint: what an open Setări page was filled from. */
const STORED = asStored(SEED_SETTINGS);
const LOADED = settingsFingerprint(STORED);

type Failure = { message: string };

/**
 * The two statements the action runs on `settings`, as it ran them: the read,
 * from("settings").select("data").eq("id", 1).maybeSingle(), then the write,
 * from("settings").update({ data }).eq("id", 1).select("id, data").
 */
interface FakeCalls {
  order: ("read" | "write")[];
  read?: { table: string; select: string; eq: [string, unknown] };
  write?: { table: string; update: unknown; eq: [string, unknown]; select: string };
}

interface FakeOptions {
  /** `settings.data` of row 1; null when the row is missing. STORED when left out. */
  row?: unknown;
  /** The read fails with this. */
  readError?: Failure;
  /** The write answers this and stores nothing. Left out, it stores the payload and returns the row. */
  write?: { data: unknown; error: Failure | null };
}

/** A `settings` table of one row that keeps what the action writes, so one save can follow another. */
function fakeClient(options: FakeOptions = {}) {
  let row = "row" in options ? options.row : STORED;
  const calls: FakeCalls = { order: [] };
  /** Every storage removal, in order: [bucket, paths]. */
  const removed: [string, string[]][] = [];
  const client = {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(column: string, value: unknown) {
              return {
                maybeSingle: async () => {
                  calls.order.push("read");
                  calls.read = { table, select: columns, eq: [column, value] };
                  if (options.readError) return { data: null, error: options.readError };
                  return { data: row === null ? null : { data: row }, error: null };
                },
              };
            },
          };
        },
        update(payload: { data: unknown }) {
          return {
            eq(column: string, value: unknown) {
              return {
                select: async (columns: string) => {
                  calls.order.push("write");
                  calls.write = { table, update: payload, eq: [column, value], select: columns };
                  if (options.write) return options.write;
                  row = asStored(payload.data);
                  return { data: [{ id: 1, data: row }], error: null };
                },
              };
            },
          };
        },
      };
    },
    storage: {
      from(bucket: string): { remove(paths: string[]): Promise<{ error: Failure | null }> } {
        return {
          remove: async (paths: string[]) => {
            removed.push([bucket, paths]);
            return { error: null };
          },
        };
      },
    },
  };
  return { client, calls, removed, stored: () => row };
}

const OLD_PHOTO = "site/atelier-1792569508000.webp";
const NEW_PHOTO = "site/atelier-1792569508760.webp";

/**
 * The form's post for a Settings object: every text as a string, a ticked checkbox as "on",
 * and the hidden input with the fingerprint of the row the page loaded (null leaves it out).
 */
function formFor(settings: Settings, fingerprint: string | null = LOADED): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value === "boolean") {
      if (value) fd.set(key, "on");
    } else {
      fd.set(key, value);
    }
  }
  if (fingerprint !== null) fd.set(SETTINGS_FINGERPRINT_FIELD, fingerprint);
  return fd;
}

const SAVED: Settings = { ...SEED_SETTINGS, workshop_name: "Atelierul", show_prices: true, whatsapp_number: "40722123456" };

/** The answer to a save that stored `data`: the notice and the fingerprint of the row as it now is. */
const saved = (data: Settings): AdminActionState => ({
  status: "ok",
  message: ADMIN_MESSAGES.saved,
  fingerprint: settingsFingerprint(data),
});

const STALE: AdminActionState = { status: "error", message: SETTINGS_MESSAGES.stale };

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

  it("refuses an emptied text the site prints inside a sentence, without writing", async () => {
    const state = await saveSettings(ADMIN_INITIAL_STATE, formFor({ ...SAVED, cui: "", mattresses_note: "  ", story_text: "" }));
    expect(state).toEqual({
      status: "error",
      message: ADMIN_MESSAGES.invalid,
      fieldErrors: { cui: ADMIN_MESSAGES.required, mattresses_note: ADMIN_MESSAGES.required },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("reads the stored row, then writes the whole object to settings row 1 and expires the settings tag", async () => {
    const { client, calls, removed, stored } = fakeClient();
    mocks.createClient.mockResolvedValue(client);

    const state = await saveSettings(ADMIN_INITIAL_STATE, formFor(SAVED));

    expect(state).toEqual(saved(SAVED));
    expect(calls).toEqual({
      order: ["read", "write"],
      read: { table: "settings", select: "data", eq: ["id", 1] },
      write: { table: "settings", update: { data: SAVED }, eq: ["id", 1], select: "id, data" },
    });
    expect(stored()).toEqual(SAVED);
    expect(removed).toEqual([]);
    expect(mocks.updateTag).toHaveBeenCalledTimes(1);
    expect(mocks.updateTag).toHaveBeenCalledWith("settings");
  });

  it("writes nothing when the stored row is no longer the one the page loaded", async () => {
    // Someone else saved after this page was opened: the form still posts the fingerprint of the older row.
    const newer = asStored({ ...SEED_SETTINGS, city: "Cluj-Napoca", atelier_photo_path: OLD_PHOTO });
    const { client, calls, removed, stored } = fakeClient({ row: newer });
    mocks.createClient.mockResolvedValue(client);
    const fd = formFor({ ...SAVED, atelier_photo_path: NEW_PHOTO });
    fd.set("atelier_photo_path_before", OLD_PHOTO);

    const state = await saveSettings(ADMIN_INITIAL_STATE, fd);

    expect(state).toEqual(STALE);
    expect(SETTINGS_MESSAGES.stale).toBe(
      "Setările au fost schimbate între timp din altă fereastră. Reîncarcă pagina și reia modificarea.",
    );
    expect(calls.order).toEqual(["read"]);
    expect(calls.write).toBeUndefined();
    expect(stored()).toBe(newer);
    // The photo of the newer row stays in the bucket, and the site keeps its cached values.
    expect(removed).toEqual([]);
    expect(mocks.updateTag).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("writes nothing for a post that carries no fingerprint, an empty one or one that is not a text", async () => {
    const posts = [formFor(SAVED, null), formFor(SAVED, ""), formFor(SAVED, "nu"), formFor(SAVED, null)];
    // A file under the input's name is not the fingerprint, whatever its content.
    posts[3].set(SETTINGS_FINGERPRINT_FIELD, new File([LOADED], "amprenta.txt"));

    for (const fd of posts) {
      const { client, calls, stored } = fakeClient();
      mocks.createClient.mockResolvedValue(client);

      const state = await saveSettings(ADMIN_INITIAL_STATE, fd);

      expect(state).toEqual(STALE);
      expect(calls.order).toEqual(["read"]);
      expect(stored()).toBe(STORED);
    }
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("lets the same tab save again with the fingerprint its last save returned, and refuses the copy left open elsewhere", async () => {
    const { client, calls, stored } = fakeClient();
    mocks.createClient.mockResolvedValue(client);
    const posted = (state: AdminActionState) => (state.status === "ok" ? (state.fingerprint ?? null) : null);

    // Two windows opened on the same row. The first one saves.
    const first: Settings = { ...SEED_SETTINGS, city: "Cluj-Napoca" };
    const afterFirst = await saveSettings(ADMIN_INITIAL_STATE, formFor(first, LOADED));
    expect(afterFirst).toEqual(saved(first));
    expect(stored()).toEqual(first);

    // The second window still holds the old values and the old fingerprint: one changed field
    // would put every other old value back.
    const stale = await saveSettings(ADMIN_INITIAL_STATE, formFor({ ...SEED_SETTINGS, workshop_name: "Alt nume" }, LOADED));
    expect(stale).toEqual(STALE);
    expect(stored()).toEqual(first);

    // The first window saves again, posting what its own save returned.
    const second: Settings = { ...first, lead_time: "5 săptămâni" };
    const afterSecond = await saveSettings(afterFirst, formFor(second, posted(afterFirst)));
    expect(afterSecond).toEqual(saved(second));
    expect(stored()).toEqual(second);
    expect(posted(afterSecond)).not.toBe(posted(afterFirst));

    // And once more with nothing changed: the same row, the same fingerprint.
    const afterThird = await saveSettings(afterSecond, formFor(second, posted(afterSecond)));
    expect(afterThird).toEqual(afterSecond);

    expect(calls.order).toEqual(["read", "write", "read", "read", "write", "read", "write"]);
    expect(mocks.updateTag).toHaveBeenCalledTimes(3);
  });

  it("answers with the fingerprint of the row as the table returned it, not of what was posted", async () => {
    // The next save is compared with the stored row, so that row is what the answer has to describe.
    // No database changes a value on the way in; this one does, only to tell the two apart.
    const kept = { ...SAVED, city: "Cluj-Napoca" };
    const { client } = fakeClient({ write: { data: [{ id: 1, data: asStored(kept) }], error: null } });
    mocks.createClient.mockResolvedValue(client);

    const state = await saveSettings(ADMIN_INITIAL_STATE, formFor(SAVED));

    expect(state).toEqual(saved(kept));
  });

  it("takes a missing row as changed: the reloaded page then says it cannot read the settings", async () => {
    const { client, calls } = fakeClient({ row: null });
    mocks.createClient.mockResolvedValue(client);

    const state = await saveSettings(ADMIN_INITIAL_STATE, formFor(SAVED));

    expect(state).toEqual(STALE);
    expect(calls.order).toEqual(["read"]);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("answers the generic message when the stored row cannot be read, logs the real one and writes nothing", async () => {
    const { client, calls, removed } = fakeClient({ readError: { message: "canceling statement due to statement timeout" } });
    mocks.createClient.mockResolvedValue(client);
    const fd = formFor({ ...SAVED, atelier_photo_path: NEW_PHOTO });
    fd.set("atelier_photo_path_before", OLD_PHOTO);

    const state = await saveSettings(ADMIN_INITIAL_STATE, fd);

    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.generic });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("statement timeout"));
    expect(calls.order).toEqual(["read"]);
    expect(removed).toEqual([]);
    expect(mocks.updateTag).not.toHaveBeenCalled();
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
    const { client, calls, removed } = fakeClient();
    mocks.createClient.mockResolvedValue(client);
    const fd = formFor({ ...SAVED, atelier_photo_path: NEW_PHOTO });
    fd.set("atelier_photo_path_before", OLD_PHOTO);

    const state = await saveSettings(ADMIN_INITIAL_STATE, fd);

    expect(state).toEqual(saved({ ...SAVED, atelier_photo_path: NEW_PHOTO }));
    // Neither the `_before` input nor the fingerprint is a Settings key: they never reach the row.
    expect(calls.write?.update).toEqual({ data: { ...SAVED, atelier_photo_path: NEW_PHOTO } });
    expect(removed).toEqual([["media", [OLD_PHOTO]]]);
    expect(mocks.updateTag).toHaveBeenCalledWith("settings");
  });

  it("removes the old photo when the admin deleted it (empty path)", async () => {
    const { client, calls, removed } = fakeClient();
    mocks.createClient.mockResolvedValue(client);
    const fd = formFor({ ...SAVED, atelier_photo_path: "" });
    fd.set("atelier_photo_path_before", OLD_PHOTO);

    const state = await saveSettings(ADMIN_INITIAL_STATE, fd);

    expect(state).toEqual(saved({ ...SAVED, atelier_photo_path: "" }));
    expect(calls.write?.update).toEqual({ data: { ...SAVED, atelier_photo_path: "" } });
    expect(removed).toEqual([["media", [OLD_PHOTO]]]);
  });

  it("removes nothing when the photo is unchanged", async () => {
    const { client, removed } = fakeClient();
    mocks.createClient.mockResolvedValue(client);
    const fd = formFor({ ...SAVED, atelier_photo_path: OLD_PHOTO });
    fd.set("atelier_photo_path_before", OLD_PHOTO);

    const state = await saveSettings(ADMIN_INITIAL_STATE, fd);

    expect(state).toEqual(saved({ ...SAVED, atelier_photo_path: OLD_PHOTO }));
    expect(removed).toEqual([]);
  });

  it("ignores a `_before` value that is not a site photo path", async () => {
    for (const before of ["materials/ct-verde-1792569508760.webp", "site/atelier.webp", "../x", "nu"]) {
      const { client, removed } = fakeClient();
      mocks.createClient.mockResolvedValue(client);
      const fd = formFor({ ...SAVED, atelier_photo_path: NEW_PHOTO });
      fd.set("atelier_photo_path_before", before);

      const state = await saveSettings(ADMIN_INITIAL_STATE, fd);

      expect(state).toEqual(saved({ ...SAVED, atelier_photo_path: NEW_PHOTO }));
      expect(removed).toEqual([]);
    }
  });

  it("removes nothing when the write fails or touches no row", async () => {
    for (const write of [
      { data: [], error: null },
      { data: null, error: { message: "permission denied for table settings" } },
    ]) {
      const { client, calls, removed } = fakeClient({ write });
      mocks.createClient.mockResolvedValue(client);
      const fd = formFor({ ...SAVED, atelier_photo_path: NEW_PHOTO });
      fd.set("atelier_photo_path_before", OLD_PHOTO);

      const state = await saveSettings(ADMIN_INITIAL_STATE, fd);

      expect(state.status).toBe("error");
      expect(calls.order).toEqual(["read", "write"]);
      expect(removed).toEqual([]);
    }
  });

  it("still answers saved when the old photo cannot be removed, and logs it", async () => {
    const { client, calls } = fakeClient();
    client.storage.from = () => ({ remove: async () => ({ error: { message: "object not found" } }) });
    mocks.createClient.mockResolvedValue(client);
    const fd = formFor({ ...SAVED, atelier_photo_path: NEW_PHOTO });
    fd.set("atelier_photo_path_before", OLD_PHOTO);

    const state = await saveSettings(ADMIN_INITIAL_STATE, fd);

    expect(state).toEqual(saved({ ...SAVED, atelier_photo_path: NEW_PHOTO }));
    expect(calls.write?.update).toEqual({ data: { ...SAVED, atelier_photo_path: NEW_PHOTO } });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("object not found"));
    expect(mocks.updateTag).toHaveBeenCalledWith("settings");
  });

  it("treats an update of 0 rows as a missing role (RLS filters silently)", async () => {
    const { client } = fakeClient({ write: { data: [], error: null } });
    mocks.createClient.mockResolvedValue(client);

    const state = await saveSettings(ADMIN_INITIAL_STATE, formFor(SAVED));

    expect(state).toEqual({ status: "error", message: ADMIN_MESSAGES.forbidden });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("answers the generic message on a Supabase error and logs the real one", async () => {
    const { client } = fakeClient({ write: { data: null, error: { message: "permission denied for table settings" } } });
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

/** What the Setări page hands SettingsForm, read from the element tree the page returns (nothing is rendered). */
async function pageFormProps(): Promise<SettingsFormProps> {
  const page = await SetariPage();
  const children: unknown[] = [page.props.children].flat();
  const form = children.find(
    (child): child is ReactElement<SettingsFormProps> => isValidElement(child) && child.type === SettingsForm,
  );
  if (!form) throw new Error("The page has no SettingsForm.");
  return form.props;
}

// The two halves of the check have to name the same row the same way: were the page to
// fingerprint anything else (the merged view the form shows, say), every save would be refused.
describe("the Setări page and saveSettings", () => {
  it("give a stored row the same fingerprint, so a save from a page just loaded passes", async () => {
    // A row from before PR-6, with a key the form no longer knows and one of its keys missing:
    // the page shows it merged over the seed, and still fingerprints the row as it is stored.
    const older = Object.fromEntries(Object.entries(SEED_SETTINGS).filter(([key]) => key !== "city"));
    const row = asStored({ ...older, sample_limit: 5 });
    const { client, calls, stored } = fakeClient({ row });
    mocks.createClient.mockResolvedValue(client);

    const form = await pageFormProps();

    expect(calls.read).toEqual({ table: "settings", select: "data", eq: ["id", 1] });
    expect(form.locked).toBe(false);
    expect(form.settings).toEqual(SEED_SETTINGS);
    expect(form.fingerprint).toBe(settingsFingerprint(row));
    expect(form.fingerprint).not.toBe(settingsFingerprint(form.settings));

    const state = await saveSettings(ADMIN_INITIAL_STATE, formFor(SAVED, form.fingerprint));

    expect(state).toEqual(saved(SAVED));
    expect(stored()).toEqual(SAVED);
  });

  it("the page that could not read the row hands the form no fingerprint, and no stored row answers to that", async () => {
    for (const unread of [{ readError: { message: "connection refused" } }, { row: null }]) {
      const { client } = fakeClient(unread);
      mocks.createClient.mockResolvedValue(client);

      const form = await pageFormProps();

      // Locked on purpose: the fields show the seed.
      expect(form).toEqual({ settings: SEED_SETTINGS, fingerprint: "", locked: true });

      // Should a post leave that form all the same, the table keeps its row.
      const table = fakeClient();
      mocks.createClient.mockResolvedValue(table.client);
      const state = await saveSettings(ADMIN_INITIAL_STATE, formFor(SAVED, form.fingerprint));
      expect(state).toEqual(STALE);
      expect(table.calls.order).toEqual(["read"]);
      expect(table.stored()).toBe(STORED);
    }

    // The same when there is no client to read with (no Supabase variables on this environment).
    mocks.createClient.mockRejectedValue(new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL"));
    expect(await pageFormProps()).toEqual({ settings: SEED_SETTINGS, fingerprint: "", locked: true });
  });
});
