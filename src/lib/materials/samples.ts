import type { Catalog, FamilyId } from "@/lib/configurator/types";

// The samples side of the catalogue (DESIGN §4.3, ARHITECTURA §6.3), shared by the
// materials page (client), the `submitSamples` action and the emails (server), so the
// ids the browser offers and the ids the server accepts come from one place.

/** One colour of the catalogue as the tiles, the box and the emails see it. */
export interface SampleItem {
  /** Color.id, e.g. "ct-verde"; what the box stores and the form posts. */
  id: string;
  name: string;
  /** Stable code, e.g. "CT01". */
  code: string;
  hex: string;
  familyId: FamilyId;
  familyName: string;
  supplierCode?: string;
  photoSrc?: string;
}

/** Every colour of every family, in catalogue order. */
export function sampleItems(catalog: Catalog): SampleItem[] {
  return catalog.families.flatMap((family) =>
    family.colors.map((color) => ({
      id: color.id,
      name: color.name,
      code: color.code,
      hex: color.hex,
      familyId: family.id,
      familyName: family.name,
      supplierCode: color.supplierCode,
      photoSrc: color.photoSrc,
    })),
  );
}

/** Every Color.id of the catalogue, in catalogue order: the ids a samples request may carry. */
export function colorIds(catalog: Catalog): string[] {
  return sampleItems(catalog).map((item) => item.id);
}

/**
 * The stored ids resolved against the catalogue, in the given order. An id the
 * catalogue no longer knows lands in `unknown` instead of failing the whole list.
 */
export function resolveSampleItems(catalog: Catalog, ids: readonly string[]): { items: SampleItem[]; unknown: string[] } {
  const byId = new Map(sampleItems(catalog).map((item) => [item.id, item]));
  const items: SampleItem[] = [];
  const unknown: string[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (item) items.push(item);
    else unknown.push(id);
  }
  return { items, unknown };
}
