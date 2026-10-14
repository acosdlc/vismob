import { SEED_SETTINGS, type Settings } from "./settings.seed";

// PR-5 switches this to a cached Supabase read with the seed as the
// fallback for builds that have no environment variables.
export async function getSettings(): Promise<Settings> {
  return SEED_SETTINGS;
}
