import { DEFAULT_CONFIG } from "@/lib/configurator/catalog.seed";
import type { Catalog, FamilyId, ModelId } from "@/lib/configurator/types";
import { paramsFromConfig } from "@/lib/configurator/url";

// The swatch library of /materiale (DESIGN §4.3): every colour of the catalogue as
// a tile that opens the configurator with that family and colour preselected.

/** One colour of the catalogue as the tiles see it. */
export interface SwatchItem {
  /** Color.id, e.g. "ct-verde". */
  id: string;
  name: string;
  /** Stable code, e.g. "CT01". */
  code: string;
  hex: string;
  familyId: FamilyId;
  familyName: string;
  /** The model the tile opens the configurator on: the first that allows this family (see modelFor). */
  modelId: ModelId;
  supplierCode?: string;
  photoSrc?: string;
}

/**
 * The model a family's tiles open: the default model when its rules allow the
 * family, else the first model that does, so the configurator never has to repair
 * the choice (the rules come from the catalogue, which the workshop edits). A
 * family no model allows falls back to the default model; resolve() then picks
 * a family that fits.
 */
export function modelFor(catalog: Catalog, familyId: FamilyId): ModelId {
  const allows = (m: { id: ModelId; families: FamilyId[] }) => m.families.includes(familyId);
  const preferred = catalog.models.find((m) => m.id === DEFAULT_CONFIG.model && allows(m));
  return (preferred ?? catalog.models.find(allows))?.id ?? DEFAULT_CONFIG.model;
}

/** Every colour of every family, in catalogue order. */
export function swatchItems(catalog: Catalog): SwatchItem[] {
  return catalog.families.flatMap((family) => {
    const modelId = modelFor(catalog, family.id);
    return family.colors.map((color) => ({
      id: color.id,
      name: color.name,
      code: color.code,
      hex: color.hex,
      familyId: family.id,
      familyName: family.name,
      modelId,
      supplierCode: color.supplierCode,
      photoSrc: color.photoSrc,
    }));
  });
}

/** The configurator with this colour preselected, on the model its family goes with. */
export function configuratorHref(item: Pick<SwatchItem, "id" | "familyId" | "modelId">): string {
  const params = paramsFromConfig({ ...DEFAULT_CONFIG, model: item.modelId, family: item.familyId, color: item.id });
  return `/configurator?${params.toString()}`;
}
