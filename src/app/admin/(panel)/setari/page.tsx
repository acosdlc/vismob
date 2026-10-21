import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { AdminPage, Notice } from "@/components/admin/ui";
import { ADMIN_MESSAGES } from "@/lib/admin/types";
import { settingsFromData } from "@/lib/data/settings";
import { SEED_SETTINGS, type Settings } from "@/lib/data/settings.seed";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Setări" };

/** Shown over the form when the current row cannot be read; the form then starts from the seed. */
const READ_FAILED = "Nu am putut citi setările salvate. Formularul pornește de la valorile implicite.";

// PLAN PR-7 „Setări”: one form over every Settings key. The row is read through the
// signed-in user's cookie client (ARHITECTURA §8), never through the site's cached
// reader, so the form always shows what was last saved. The (panel) layout wraps
// this page in the guard's <Suspense>, so cookies() may be read at the top level.
export default async function SetariPage() {
  const { settings, problem } = await readCurrentSettings();

  return (
    <AdminPage title="Setări" lead="Textele și datele care apar pe site. Salvarea se vede imediat.">
      {problem && <Notice tone="error">{problem}</Notice>}
      {/* A read failure locks the save: otherwise one click would put the seed on the site. */}
      <SettingsForm settings={settings} locked={problem !== null} />
    </AdminPage>
  );
}

async function readCurrentSettings(): Promise<{ settings: Settings; problem: string | null }> {
  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    unstable_rethrow(err);
    console.error("SetariPage: createClient", err);
    return { settings: SEED_SETTINGS, problem: ADMIN_MESSAGES.unavailable };
  }

  try {
    const { data, error } = await supabase.from("settings").select("data").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("settings row 1 is missing");
    // Missing keys keep the seed, so a half-filled row still shows every field.
    return { settings: settingsFromData(data.data), problem: null };
  } catch (err) {
    unstable_rethrow(err);
    console.error("SetariPage: settings", err);
    return { settings: SEED_SETTINGS, problem: READ_FAILED };
  }
}
