import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { PricingForm } from "@/components/admin/PricingForm";
import { AdminPage, Notice } from "@/components/admin/ui";
import { ADMIN_MESSAGES } from "@/lib/admin/types";
import type { Pricing } from "@/lib/configurator/pricing";
import { PRICING_WIDTHS, pricingSchema } from "@/lib/configurator/pricing-schema";
import { getCatalog } from "@/lib/data/catalog";
import { getSettings } from "@/lib/data/settings";
import { createClient, type ServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Prețuri" };

/** Over an empty form when the saved row is not a grid the site can use. */
const INVALID_GRID = "Grila salvată nu e validă; completează-o din nou.";

/** In place of the form when the row cannot be read: editing blind could overwrite the saved grid. */
const READ_FAILED = "Nu am putut citi grila de prețuri. Reîncarcă pagina.";

/** While `settings.show_prices` is off (Setări). */
const PRICES_HIDDEN =
  "Prețurile nu apar pe site cât timp comutatorul „Arată prețurile orientative pe site” din Setări e oprit; grila se poate completa oricum.";

type PricingRead =
  /** The saved grid (null: no row yet, or an invalid one, explained by `problem`); `note` is informative. */
  | { ok: true; pricing: Pricing | null; problem: string | null; note: string | null }
  | { ok: false; problem: string; note?: undefined };

/** Widths a row written by SQL may carry that the form does not show; they would be dropped on save. */
function extraWidthsNote(pricing: Pricing): string | null {
  const widths = new Set(Object.values(pricing.grid).flatMap((row) => Object.keys(row)));
  const extra = [...widths]
    .filter((w) => !(PRICING_WIDTHS as readonly string[]).includes(w))
    .sort((a, b) => Number(a) - Number(b));
  if (extra.length === 0) return null;
  return `Grila salvată are și lățimile ${extra.join(", ")} cm, care nu se editează aici și dispar la salvare.`;
}

// PLAN PR-8 „Prețuri”: a form over `pricing.data` with a preview of three typical
// configurations. The row has no public policy, so it is read here through the
// signed-in user's cookie client (ARHITECTURA §8), never through the site's cached
// reader; the catalogue and the settings come from the site's cached readers. The
// (panel) layout wraps this page in the guard's <Suspense>, so cookies() may be read
// at the top level.
export default async function PreturiPage() {
  const [read, catalog, settings] = await Promise.all([readPricing(), getCatalog(), getSettings()]);

  return (
    <AdminPage
      title="Prețuri"
      lead="Grila din care se calculează prețul orientativ. Prețul final îl confirmă atelierul în scris."
    >
      {!settings.show_prices && <Notice tone="info">{PRICES_HIDDEN}</Notice>}
      {read.problem && <Notice tone="error">{read.problem}</Notice>}
      {read.note && <Notice tone="info">{read.note}</Notice>}
      {read.ok && <PricingForm pricing={read.pricing} catalog={catalog} />}
    </AdminPage>
  );
}

async function readPricing(): Promise<PricingRead> {
  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    unstable_rethrow(err);
    console.error("PreturiPage: createClient", err);
    return { ok: false, problem: ADMIN_MESSAGES.unavailable };
  }

  try {
    const { data, error } = await supabase.from("pricing").select("data").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    // No row is the expected state until the workshop's first save: an empty form, no notice.
    if (!data) return { ok: true, pricing: null, problem: null, note: null };
    const parsed = pricingSchema.safeParse(data.data);
    if (!parsed.success) {
      console.error("PreturiPage: the pricing row is not a valid grid.", parsed.error.issues);
      return { ok: true, pricing: null, problem: INVALID_GRID, note: null };
    }
    return { ok: true, pricing: parsed.data, problem: null, note: extraWidthsNote(parsed.data) };
  } catch (err) {
    unstable_rethrow(err);
    console.error("PreturiPage: pricing", err);
    return { ok: false, problem: READ_FAILED };
  }
}
