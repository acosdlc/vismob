import "server-only";
import type { Pricing } from "@/lib/configurator/pricing";

// The price grid (ARHITECTURA §7). It is read on the server only, and reaches the
// browser only when `settings.show_prices` is on. PR-5 reads it from the `pricing`
// table; until then there is no grid, so every price is null and the ticket shows
// only „Prețul final îl confirmăm în scris…” (docs/PLAN.md, decisions).
export async function getPricing(): Promise<Pricing | null> {
  return null;
}
