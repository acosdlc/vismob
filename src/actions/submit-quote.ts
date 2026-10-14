"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { configCode } from "@/lib/configurator/format";
import { priceFor } from "@/lib/configurator/pricing";
import { resolve } from "@/lib/configurator/rules";
import { getCatalog } from "@/lib/data/catalog";
import { getPricing } from "@/lib/data/pricing";
import { createLead } from "@/lib/leads/create-lead";
import type { FormState } from "@/lib/leads/types";
import { dispatchLeadNotifications } from "@/lib/notify/dispatch";
import type { Json } from "@/lib/supabase/database.types";
import { parseLeadForm, quoteSchema } from "@/lib/validation/schemas";

/**
 * „Trimite configurația” (DESIGN §4.2 07), for `useActionState`. The posted
 * `config` is resolved against the catalog on the server, and the code and the
 * price stored with the lead come from that result, never from the client (§5.7).
 */
export async function submitQuote(_prev: FormState, formData: FormData): Promise<FormState> {
  const [catalog, pricing] = await Promise.all([getCatalog(), getPricing()]);
  const result = await createLead({
    kind: "configurator",
    formData,
    headers: await headers(),
    parse: (fd) => parseLeadForm(fd, quoteSchema),
    toRow: (data) => {
      const r = resolve(data.config, catalog);
      return {
        // Config is an interface (no index signature), so it needs the cast into Json.
        config: {
          ...r.cfg,
          // resolve() keeps the raw custom inputs; the row stores what the code and the drawing used.
          customW: r.cfg.size === "custom" ? r.w : r.cfg.customW,
          customL: r.cfg.size === "custom" ? r.l : r.cfg.customL,
        } as unknown as Json,
        config_code: configCode(r),
        price_estimate_ron: priceFor(r, pricing),
        mattress_size: null,
      };
    },
  });
  if (!result.ok) return result.state;

  const { leadId } = result;
  // ARHITECTURA §6.1 step 8: both emails go out after the response; a failure is logged, never shown.
  after(async () => {
    try {
      await dispatchLeadNotifications(leadId);
    } catch (error) {
      console.error(`dispatchLeadNotifications(${leadId})`, error);
    }
  });

  return { status: "ok", leadId, code: configCode(resolve(result.data.config, catalog)) };
}
