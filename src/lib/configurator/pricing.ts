// Indicative price (docs/ARHITECTURA.md §7). The grid comes from the `pricing`
// table and reaches the browser only when `settings.show_prices` is on; the
// server recomputes the price on submission and never trusts the client's.
import type { BaseId, HeadboardHeight, ModelId, PriceCategory } from "./types";
import type { Resolved } from "./rules";

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
