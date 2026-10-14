"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { SAMPLES_FIELDS } from "@/components/materials/types";
import { getCatalog } from "@/lib/data/catalog";
import { getSettings } from "@/lib/data/settings";
import { createLead } from "@/lib/leads/create-lead";
import type { FormState } from "@/lib/leads/types";
import { colorIds } from "@/lib/materials/samples";
import { dispatchLeadNotifications } from "@/lib/notify/dispatch";
import { parseLeadForm, samplesSchema } from "@/lib/validation/schemas";

/**
 * „Trimite-mi mostrele” (DESIGN §4.3, ARHITECTURA §6.3), for `useActionState`. The
 * posted ids are checked against the catalogue and the limit on the server; only
 * known ids, 1 … settings.sample_limit of them, reach `sample_material_ids`.
 */
export async function submitSamples(_prev: FormState, formData: FormData): Promise<FormState> {
  const [catalog, settings] = await Promise.all([getCatalog(), getSettings()]);
  const validIds = colorIds(catalog);
  const result = await createLead({
    kind: "mostre",
    formData,
    headers: await headers(),
    parse: (fd) => parseLeadForm(fd, samplesSchema(settings.sample_limit, validIds)),
    toRow: (data) => ({
      address: data.address,
      sample_material_ids: data[SAMPLES_FIELDS.ids],
      mattress_size: null,
    }),
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

  return { status: "ok", leadId };
}
