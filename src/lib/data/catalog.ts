import { cacheLife, cacheTag } from "next/cache";
import { SEED_CATALOG } from "@/lib/configurator/catalog.seed";
import type {
  Base,
  BaseId,
  Catalog,
  Color,
  Family,
  FamilyId,
  FamilyTab,
  Model,
  ModelId,
  PriceCategory,
} from "@/lib/configurator/types";
import type { Json, Tables } from "@/lib/supabase/database.types";
import { createPublicClient } from "@/lib/supabase/public";
import { failedRead } from "./fallback";
import { mediaUrl } from "./media";

// The ids are closed sets in src/lib/configurator/types.ts (the drawings, the
// rules and the URL codes depend on them), so a row with another id cannot be
// used and is skipped. Adding a fifth model starts with the type, not the table.
const MODEL_IDS: readonly ModelId[] = ["capitonat", "arcuit", "canale", "lamele"];
const FAMILY_IDS: readonly FamilyId[] = ["catifea", "boucle", "stofa", "piele", "lemn"];
const BASE_IDS: readonly BaseId[] = ["lemn", "metal", "lada", "sertare"];
const TABS: readonly FamilyTab[] = ["textile", "lemn"];
const PRICE_CATEGORIES: readonly PriceCategory[] = ["A", "B", "C"];

const oneOf =
  <T extends string>(list: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === "string" && (list as readonly string[]).includes(value);

export const isModelId = oneOf(MODEL_IDS);
export const isFamilyId = oneOf(FAMILY_IDS);
export const isBaseId = oneOf(BASE_IDS);
const isTab = oneOf(TABS);
const isPriceCategory = oneOf(PRICE_CATEGORIES);

// The columns each select reads (the public_read policies hide inactive rows, so
// `active` is never needed in code).
export type ModelRow = Pick<Tables<"models">, "id" | "name" | "note" | "code" | "description" | "sort">;
export type FamilyRow = Pick<
  Tables<"material_families">,
  "id" | "name" | "code" | "tab" | "description" | "specs" | "sort"
>;
export type MaterialRow = Pick<
  Tables<"materials">,
  "id" | "family_id" | "name" | "code" | "hex" | "price_category" | "supplier_code" | "featured" | "photo_path" | "sort"
>;
export type ModelFamilyRow = Pick<Tables<"model_families">, "model_id" | "family_id">;
export type BaseRow = Pick<Tables<"bases">, "id" | "name" | "note" | "code" | "photo_path" | "sort">;

export interface CatalogRows {
  models: ModelRow[];
  families: FamilyRow[];
  materials: MaterialRow[];
  modelFamilies: ModelFamilyRow[];
  bases: BaseRow[];
}

const bySort = <T extends { sort: number; id: string }>(a: T, b: T) => a.sort - b.sort || a.id.localeCompare(b.id);

/** `material_families.specs` as the DESIGN §4.3 table rows; anything but an array of {k, v} strings is []. */
function specsFromJson(value: Json): { k: string; v: string }[] {
  if (!Array.isArray(value)) return [];
  const specs: { k: string; v: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const { k, v } = item;
    if (typeof k !== "string" || typeof v !== "string") return [];
    specs.push({ k, v });
  }
  return specs;
}

function colorFromRow(row: MaterialRow): Color {
  const color: Color = { id: row.id, name: row.name, hex: row.hex, code: row.code };
  if (isPriceCategory(row.price_category)) color.priceCategory = row.price_category;
  if (row.supplier_code) color.supplierCode = row.supplier_code;
  if (row.featured) color.featured = true;
  const photoSrc = mediaUrl(row.photo_path);
  if (photoSrc) color.photoSrc = photoSrc;
  return color;
}

/**
 * The content tables as the configurator's Catalog (ARHITECTURA §7). Pure. Every
 * list is ordered by `sort`; a row the types cannot represent is skipped with a
 * console.error, and so is a family without colours or a model without families,
 * which resolve() could not configure. Inactive rows never arrive: the public_read
 * policies filter them, so there is no `active` check here.
 */
export function catalogFromRows(rows: CatalogRows): Catalog {
  const colorsByFamily = new Map<string, Color[]>();
  for (const row of [...rows.materials].sort(bySort)) {
    const list = colorsByFamily.get(row.family_id);
    if (list) list.push(colorFromRow(row));
    else colorsByFamily.set(row.family_id, [colorFromRow(row)]);
  }

  const families: Family[] = [];
  for (const row of [...rows.families].sort(bySort)) {
    if (!isFamilyId(row.id) || !isTab(row.tab)) {
      console.error(`catalog: material family "${row.id}" (tab "${row.tab}") is not one the site knows; skipped.`);
      continue;
    }
    const colors = colorsByFamily.get(row.id) ?? [];
    if (colors.length === 0) {
      console.error(`catalog: material family "${row.id}" has no active colours; skipped.`);
      continue;
    }
    const family: Family = { id: row.id, name: row.name, code: row.code, tab: row.tab, colors, specs: specsFromJson(row.specs) };
    if (row.description) family.description = row.description;
    families.push(family);
  }
  for (const familyId of colorsByFamily.keys()) {
    if (!families.some((f) => f.id === familyId)) {
      console.error(`catalog: materials of family "${familyId}" have no usable family; skipped.`);
    }
  }

  const models: Model[] = [];
  for (const row of [...rows.models].sort(bySort)) {
    if (!isModelId(row.id)) {
      console.error(`catalog: model "${row.id}" is not one the site knows; skipped.`);
      continue;
    }
    const linked = new Set(rows.modelFamilies.filter((mf) => mf.model_id === row.id).map((mf) => mf.family_id));
    const modelFamilies = families.filter((f) => linked.has(f.id)).map((f) => f.id);
    if (modelFamilies.length === 0) {
      console.error(`catalog: model "${row.id}" allows no usable material family; skipped.`);
      continue;
    }
    const model: Model = { id: row.id, name: row.name, note: row.note, code: row.code, families: modelFamilies };
    if (row.description) model.description = row.description;
    models.push(model);
  }

  const bases: Base[] = [];
  for (const row of [...rows.bases].sort(bySort)) {
    if (!isBaseId(row.id)) {
      console.error(`catalog: base "${row.id}" is not one the site knows; skipped.`);
      continue;
    }
    const base: Base = { id: row.id, name: row.name, note: row.note, code: row.code };
    const photoSrc = mediaUrl(row.photo_path);
    if (photoSrc) base.photoSrc = photoSrc;
    bases.push(base);
  }

  return { models, families, bases };
}

function unwrap<T>(result: { data: T[] | null; error: { message: string } | null }, table: string): T[] {
  if (result.error) throw new Error(`${table}: ${result.error.message}`);
  return result.data ?? [];
}

// Null when Supabase cannot be reached (missing env, request or API error) or the
// catalogue it holds is unusable (no models, families or bases: resolve() would
// throw): the caller then serves the seed. In production it throws instead (fallback.ts).
async function readCatalog(): Promise<Catalog | null> {
  try {
    const db = createPublicClient();
    const [models, families, materials, modelFamilies, bases] = await Promise.all([
      db.from("models").select("id, name, note, code, description, sort").order("sort"),
      db.from("material_families").select("id, name, code, tab, description, specs, sort").order("sort"),
      db
        .from("materials")
        .select("id, family_id, name, code, hex, price_category, supplier_code, featured, photo_path, sort")
        .order("sort"),
      db.from("model_families").select("model_id, family_id"),
      db.from("bases").select("id, name, note, code, photo_path, sort").order("sort"),
    ]);
    const catalog = catalogFromRows({
      models: unwrap(models, "models"),
      families: unwrap(families, "material_families"),
      materials: unwrap(materials, "materials"),
      modelFamilies: unwrap(modelFamilies, "model_families"),
      bases: unwrap(bases, "bases"),
    });
    if (catalog.models.length === 0 || catalog.families.length === 0 || catalog.bases.length === 0) {
      throw new Error("the database holds no usable models, material families or bases");
    }
    return catalog;
  } catch (err) {
    return failedRead("getCatalog", err);
  }
}

/** The configurator catalogue, cached under the "catalog" tag (revalidated by /api/revalidate). */
export async function getCatalog(): Promise<Catalog> {
  "use cache";
  cacheTag("catalog");
  const catalog = await readCatalog();
  // A successful read lives a day; the seed fallback only minutes, so an outage is
  // retried soon instead of leaving the seed catalogue on the site for a day.
  // Only one cacheLife call runs per invocation (docs: conditional cache lifetimes).
  if (catalog) cacheLife("days");
  else cacheLife("minutes");
  return catalog ?? SEED_CATALOG;
}
