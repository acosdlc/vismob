import { SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import type { Catalog } from "@/lib/configurator/types";

// PR-5 switches this to a cached Supabase read (models, model_families,
// families, materials, bases → Catalog) with the seed as the fallback for
// builds that have no environment variables.
export async function getCatalog(): Promise<Catalog> {
  return SEED_CATALOG;
}
