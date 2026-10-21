import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { startingPrices, type Pricing } from "@/lib/configurator/pricing";
// The schema of the grid lives with the configurator (pure), so the admin's form and
// Server Action (PR-8) validate the same shape this reader accepts.
import { pricingSchema } from "@/lib/configurator/pricing-schema";
import type { ModelId } from "@/lib/configurator/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCatalog } from "./catalog";

// The price grid (ARHITECTURA §7). `pricing` has no public read policy, so it is
// read with the secret key, on the server only, and reaches the browser only when
// `settings.show_prices` is on. Without a grid (no row until PR-7, invalid data,
// no database) every price is null and the ticket shows only „Prețul final îl
// confirmăm în scris…” (docs/PLAN.md, decisions). Never throws: a price is optional,
// so a failed read turns prices off for minutes rather than taking a page down.

/** The grid from `pricing` id=1, or null when there is none or it cannot be read. Cached under the `pricing` tag. */
export async function getPricing(): Promise<Pricing | null> {
  "use cache";
  cacheTag("pricing");
  // A grid, or the designed "no row yet", lives a day; an error only minutes, so a
  // transient failure does not switch prices off for a day. One cacheLife call runs
  // per invocation (docs: conditional cache lifetimes).
  try {
    const { data, error } = await createAdminClient().from("pricing").select("data").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    // No row is the expected state until the workshop's grid arrives (PR-7): no price, no noise.
    if (!data) {
      cacheLife("days");
      return null;
    }
    const parsed = pricingSchema.safeParse(data.data);
    if (!parsed.success) {
      console.error(`getPricing: the pricing row is not a valid grid, prices are off.\n${z.prettifyError(parsed.error)}`);
      cacheLife("minutes");
      return null;
    }
    const pricing: Pricing = parsed.data;
    cacheLife("days");
    return pricing;
  } catch (error) {
    console.error("getPricing: the pricing table could not be read, prices are off.", error);
    cacheLife("minutes");
    return null;
  }
}

/**
 * „de la … lei” per model for Acasă 02 (startingPrices()), or {} without a grid.
 * Not cached itself: both inputs are, so the page stays static.
 */
export async function getStartingPrices(): Promise<Partial<Record<ModelId, number>>> {
  const pricing = await getPricing();
  if (!pricing) return {};
  return startingPrices(await getCatalog(), pricing);
}
