"use server";

import { updateTag } from "next/cache";
import { getAdminSession } from "@/lib/admin/auth";
import { isMediaPath, photoFieldNames, removeMediaObject } from "@/lib/admin/media";
import { SETTINGS_FINGERPRINT_FIELD } from "@/lib/admin/settings-fields";
import { settingsFingerprint } from "@/lib/admin/settings-fingerprint";
import { parseSettingsForm, SETTINGS_MESSAGES } from "@/lib/admin/settings-schema";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import type { Json } from "@/lib/supabase/database.types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

/** The hidden inputs of the FOTO 08 PhotoField in Setări (PLAN PR-9): `atelier_photo_path` / `…_before`. */
const ATELIER_PHOTO = photoFieldNames("atelier_photo_path");

/**
 * „Salvează” on /admin/setari (PLAN PR-7), for `useActionState`. Re-checks the admin
 * role, validates the whole form, writes `settings.data` through the signed-in
 * user's cookie client (RLS: `admin_all`), then expires the "settings" tag so the
 * site reads the new values on its next request (ARHITECTURA §8). The workshop photo
 * (PR-9) arrives as a path the browser already uploaded; once the row is saved, the
 * object the save replaced is removed, best effort.
 *
 * The form posts every value the open page holds, so a page opened before someone
 * else's save would put its old values back over that save. The form therefore also
 * posts the fingerprint of the row it was filled from (settings-fingerprint.ts), and
 * nothing is written unless the stored row still has that fingerprint. The answer to a
 * save carries the fingerprint of the row as the save left it; the form posts that one
 * next, so the same page can save again.
 */
export async function saveSettings(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await getAdminSession();
  if (!admin) return { status: "error", message: ADMIN_MESSAGES.forbidden };

  const parsed = parseSettingsForm(formData);
  if (!parsed.ok) return { status: "error", message: ADMIN_MESSAGES.invalid, fieldErrors: parsed.fieldErrors };
  // The path the form loaded with; anything that is not a `site/` PhotoField path is ignored,
  // so a tampered post can never remove another folder's object.
  const before = formData.get(ATELIER_PHOTO.before);
  const replaced = isMediaPath(before, "site") && before !== parsed.data.atelier_photo_path ? before : null;

  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error("saveSettings: createClient", err);
    return { status: "error", message: ADMIN_MESSAGES.unavailable };
  }

  let fingerprint: string;
  try {
    // The check and the write are two statements: `settings` has no version column, and
    // none is added, so nothing ties them into one. Two saves that arrive at the same
    // moment can both pass the check, and the later write wins, as it did before. What
    // the check stops is the case that does happen: a page left open while someone saved.
    const stored = await supabase.from("settings").select("data").eq("id", 1).maybeSingle();
    if (stored.error) {
      console.error(`saveSettings: ${stored.error.message}`);
      return { status: "error", message: ADMIN_MESSAGES.generic };
    }
    // A missing row counts as changed too: the reloaded page then says it cannot read the
    // settings. So does a post without the input, or from a page that could not read the row ("").
    if (!stored.data || settingsFingerprint(stored.data.data) !== formData.get(SETTINGS_FINGERPRINT_FIELD)) {
      return { status: "error", message: SETTINGS_MESSAGES.stale };
    }

    const { data, error } = await supabase
      .from("settings")
      // Settings is an interface (no index signature), so it needs the cast into Json.
      .update({ data: parsed.data as unknown as Json })
      .eq("id", 1)
      // `data` comes back as the table now holds it: the next save is compared with that row.
      .select("id, data");
    if (error) {
      console.error(`saveSettings: ${error.message}`);
      return { status: "error", message: ADMIN_MESSAGES.generic };
    }
    // RLS does not refuse an update it filters out: without the admin role the
    // statement touches 0 rows and comes back without an error. A missing row 1 gives the
    // same 0 rows and is reported as forbidden on purpose: the seed migration inserts it.
    if (!data || data.length !== 1) return { status: "error", message: ADMIN_MESSAGES.forbidden };
    fingerprint = settingsFingerprint(data[0].data);
    // Only once the row points elsewhere: a failure here is logged, never fatal.
    await removeMediaObject(supabase.storage, replaced);
  } catch (err) {
    console.error("saveSettings", err);
    return { status: "error", message: ADMIN_MESSAGES.generic };
  }

  updateTag("settings");
  return { status: "ok", message: ADMIN_MESSAGES.saved, fingerprint };
}
