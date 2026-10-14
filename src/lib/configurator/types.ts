// Configurator types (docs/DESIGN.md §5.1) with the additive fields the
// production catalog carries (docs/ARHITECTURA.md §5, §7; docs/PLAN.md PR-1).

export type ModelId = "capitonat" | "arcuit" | "canale" | "lamele";
export type FamilyId = "catifea" | "boucle" | "stofa" | "piele" | "lemn";
export type BaseId = "lemn" | "metal" | "lada" | "sertare";
export type SizeKey = "90" | "120" | "140" | "160" | "180" | "200" | "custom";
export type HeadboardHeight = 100 | 120 | 140;

/** Price category of a material (ARHITECTURA §7: `materials.price_category`). */
export type PriceCategory = "A" | "B" | "C";

/** The tab a family sits under on /materiale (DESIGN §4.3). */
export type FamilyTab = "textile" | "lemn";

export interface Model {
  id: ModelId;
  name: string;
  note: string;
  code: string;
  families: FamilyId[];
}

export interface Color {
  id: string;
  name: string;
  hex: string;
  /** Stable code (e.g. CT01), never the index. */
  code: string;
  priceCategory?: PriceCategory;
  /** The supplier's own reference, shown as „[cod furnizor]” on /materiale. */
  supplierCode?: string;
  /** Shown in the 8-swatch grid on Acasă 03 (DESIGN §4.1). */
  featured?: boolean;
  /** Photo of the swatch (1:1); the hex fill is the placeholder. */
  photoSrc?: string;
}

export interface Family {
  id: FamilyId;
  name: string;
  code: string;
  tab: FamilyTab;
  description?: string;
  specs?: { k: string; v: string }[];
  colors: Color[];
}

export interface Base {
  id: BaseId;
  name: string;
  note: string;
  code: string;
  /** Photo (4:3) for Materiale › Picioare și baze. */
  photoSrc?: string;
}

export interface Config {
  model: ModelId;
  size: SizeKey;
  /** cm, used only when size = 'custom' */
  customW: number;
  customL: number;
  family: FamilyId;
  /** Color.id */
  color: string;
  hb: HeadboardHeight;
  base: BaseId;
  led: boolean;
  nightstands: boolean;
}

export interface Catalog {
  models: Model[];
  families: Family[];
  bases: Base[];
}
