import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { AdminPage, Notice } from "@/components/admin/ui";
import { settingsFingerprint } from "@/lib/admin/settings-fingerprint";
import { ADMIN_MESSAGES } from "@/lib/admin/types";
import { settingsFromData } from "@/lib/data/settings";
import { SEED_SETTINGS, type Settings } from "@/lib/data/settings.seed";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Setări" };

/** Shown over the form when the current row cannot be read; the form then starts from the seed. */
const READ_FAILED = "Nu am putut citi setările salvate. Formularul pornește de la valorile implicite.";

// PLAN PR-7 „Setări”: one form over every Settings key. The row is read through the
// signed-in user's cookie client (ARHITECTURA §8), never through the site's cached
// reader, so a form that is opened shows what was last saved. The (panel) layout wraps
// this page in the guard's <Suspense>, so cookies() may be read at the top level.
//
// The router renders this page again under a form that is already open: with the answer
// of a save, and when the admin returns to the screen, which the router keeps mounted
// meanwhile. The form fills its boxes and takes its fingerprint on its first render only,
// so one first rendered without the row would go on showing the seed and posting an
// empty fingerprint that no save gets past. Its key therefore says whether the row was
// read, and nothing else: once the row is read, that form is replaced by one filled from
// it. Every row that was read gives the same key, so a newer row never takes the open
// form down. The key works the other way too: a form rendered again without the row
// starts over from the seed, locked, as the notice above it then says, and text typed in
// it and not yet saved goes with it.
export default async function SetariPage() {
  const { settings, fingerprint, problem } = await readCurrentSettings();

  return (
    <AdminPage title="Setări" lead="Textele și datele care apar pe site. Salvarea se vede imediat.">
      {problem && <Notice tone="error">{problem}</Notice>}
      {/* A read failure locks the save: otherwise one click would put the seed on the site. */}
      <SettingsForm
        key={problem === null ? "read" : "unread"}
        settings={settings}
        fingerprint={fingerprint}
        locked={problem !== null}
      />
    </AdminPage>
  );
}

interface CurrentSettings {
  settings: Settings;
  /**
   * The fingerprint of the stored row, which the form posts back: saveSettings refuses the
   * save when the row has changed since this read. "" when the row could not be read; no
   * stored row has that fingerprint, so the server refuses a post from the locked form too.
   * (The one post it takes without the row's fingerprint carries the row's own values, and
   * changes nothing.)
   */
  fingerprint: string;
  problem: string | null;
}

async function readCurrentSettings(): Promise<CurrentSettings> {
  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    unstable_rethrow(err);
    console.error("SetariPage: createClient", err);
    return { settings: SEED_SETTINGS, fingerprint: "", problem: ADMIN_MESSAGES.unavailable };
  }

  try {
    const { data, error } = await supabase.from("settings").select("data").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("settings row 1 is missing");
    // Missing keys keep the seed, so a half-filled row still shows every field. The
    // fingerprint is of the row as stored, not of that merged view: the action compares
    // it with the row it reads.
    return { settings: settingsFromData(data.data), fingerprint: settingsFingerprint(data.data), problem: null };
  } catch (err) {
    unstable_rethrow(err);
    console.error("SetariPage: settings", err);
    return { settings: SEED_SETTINGS, fingerprint: "", problem: READ_FAILED };
  }
}
