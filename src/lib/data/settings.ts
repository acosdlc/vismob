import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { failedRead } from "./fallback";
import { SEED_SETTINGS, type Settings } from "./settings.seed";

export type { Settings } from "./settings.seed";

/**
 * `settings.data` (jsonb) merged over the seed: a key is taken only when it is one
 * of the seed's keys and its JSON type matches the seed value's (string, number or
 * boolean). Unknown keys are ignored, missing keys keep the seed, so a half-filled
 * or mistyped row can never break a page. `sample_limit` must be a whole number of
 * at least 1: the samples form allows 1 … sample_limit ids, so 0 would refuse every request.
 */
export function settingsFromData(data: unknown): Settings {
  const merged: Settings = { ...SEED_SETTINGS };
  if (!data || typeof data !== "object" || Array.isArray(data)) return merged;
  const source = data as Record<string, unknown>;
  const target = merged as unknown as Record<string, unknown>;
  for (const key of Object.keys(SEED_SETTINGS) as (keyof Settings)[]) {
    const value = source[key];
    const ok = key === "sample_limit" ? Number.isInteger(value) && (value as number) >= 1 : typeof value === typeof SEED_SETTINGS[key];
    if (ok) target[key] = value;
  }
  return merged;
}

// Null when Supabase cannot be reached (missing env, request or API error) or the
// row is missing: the caller then serves the seed. In production it throws instead (fallback.ts).
async function readSettings(): Promise<Settings | null> {
  try {
    const { data, error } = await createPublicClient().from("settings").select("data").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("settings row 1 is missing");
    return settingsFromData(data.data);
  } catch (err) {
    return failedRead("getSettings", err);
  }
}

/** The site settings, cached under the "settings" tag (revalidated by /api/revalidate). */
export async function getSettings(): Promise<Settings> {
  "use cache";
  cacheTag("settings");
  const settings = await readSettings();
  // A successful read lives a day; the seed fallback only minutes, so an outage is
  // retried soon instead of leaving bracket placeholders on the site for a day.
  // Only one cacheLife call runs per invocation (docs: conditional cache lifetimes).
  if (settings) cacheLife("days");
  else cacheLife("minutes");
  return settings ?? SEED_SETTINGS;
}
