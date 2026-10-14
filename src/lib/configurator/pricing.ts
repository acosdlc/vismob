// Indicative price (docs/ARHITECTURA.md §7). The grid comes from the `pricing`
// table and reaches the browser only when `settings.show_prices` is on; the
// server recomputes the price on submission and never trusts the client's.
import { DEFAULT_CONFIG, HEIGHTS } from "./catalog.seed";
import { resolve, type Resolved } from "./rules";
import type { BaseId, Catalog, Config, HeadboardHeight, ModelId, PriceCategory } from "./types";

export interface Pricing {
  /** lei, per standard width: { "90": …, "160": … } */
  grid: Record<ModelId, Record<string, number>>;
  /** markup % per material price category */
  categoryPct: Record<PriceCategory, number>;
  /** markup % per headboard height */
  hbPct: Record<`${HeadboardHeight}`, number>;
  /** lei */
  base: Record<BaseId, number>;
  /** lei */
  extras: { led: number; nightstands: number };
  /** markup % for a non-standard size */
  customPct: number;
  /** 50 */
  roundTo: number;
}

/** The indicative price. Runs in the browser (if show_prices) and on the server (the source of truth). */
export function estimatePrice(r: Resolved, p: Pricing, category: PriceCategory): number | null {
  const row = p.grid[r.model.id];
  const widths = row
    ? Object.keys(row)
        .map(Number)
        .sort((a, b) => a - b)
    : [];
  if (!widths.length) return null;
  const w = widths.find((x) => x >= r.w) ?? widths[widths.length - 1]; // up to the next standard width
  const hbKey: `${HeadboardHeight}` = `${r.cfg.hb}`;
  const pct = p.categoryPct[category] + p.hbPct[hbKey] + (r.cfg.size === "custom" ? p.customPct : 0);
  const total =
    row[String(w)] * (1 + pct / 100) +
    p.base[r.base.id] +
    (r.cfg.led ? p.extras.led : 0) +
    (r.cfg.nightstands ? p.extras.nightstands : 0);
  return Math.round(total / p.roundTo) * p.roundTo;
}

/**
 * The price of a resolved configuration, or null when there is no grid
 * (show_prices off, PR-7 not yet in) or the model has no row. The colour's
 * category comes from `materials.price_category`; "A" when the catalog has none.
 */
export function priceFor(r: Resolved, p: Pricing | null): number | null {
  return p ? estimatePrice(r, p, r.color.priceCategory ?? "A") : null;
}

/**
 * „De la … lei” per model, for the model cards on Acasă 02 (DESIGN §3.9).
 * Definition: the lowest indicative price of a 160 × 200 bed in that model, in a
 * price category A material (the cheapest), without LED or nightstands, taken
 * over every base of the catalogue and every headboard height. The family and
 * colour (the model's first family, that family's first colour) only make the
 * configuration resolvable; the category is forced to A, so the colour's own
 * category does not matter. A model without a grid row (estimatePrice() null)
 * is left out, as is one resolve() could not price (its first family has no
 * colours, or the catalogue has no bases): its card then shows no price.
 */
export function startingPrices(catalog: Catalog, pricing: Pricing): Partial<Record<ModelId, number>> {
  const out: Partial<Record<ModelId, number>> = {};
  for (const model of catalog.models) {
    const family = catalog.families.find((f) => f.id === model.families[0]);
    const color = family?.colors[0];
    if (!family || !color) continue;
    const prices: number[] = [];
    for (const base of catalog.bases) {
      for (const hb of HEIGHTS) {
        const cfg: Config = {
          ...DEFAULT_CONFIG,
          model: model.id,
          size: "160",
          family: family.id,
          color: color.id,
          hb,
          base: base.id,
          led: false,
          nightstands: false,
        };
        const price = estimatePrice(resolve(cfg, catalog), pricing, "A");
        if (price !== null) prices.push(price);
      }
    }
    if (prices.length) out[model.id] = Math.min(...prices);
  }
  return out;
}
