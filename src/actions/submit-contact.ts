"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { createLead } from "@/lib/leads/create-lead";
import type { FormState } from "@/lib/leads/types";
import { dispatchLeadNotifications } from "@/lib/notify/dispatch";
import { contactSchema, parseLeadForm } from "@/lib/validation/schemas";

/** The „Cerere de ofertă” form (DESIGN §4.1 section 09), for `useActionState`. */
export async function submitContact(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await createLead({
    kind: "contact",
    formData,
    headers: await headers(),
    parse: (fd) => parseLeadForm(fd, contactSchema),
    toRow: (data) => ({ mattress_size: data.mattressSize }),
  });
  if (!result.ok) return result.state;

  const { leadId } = result;
  // 3.8: both emails go out after the response; a failure is logged, never shown.
  after(async () => {
    try {
      await dispatchLeadNotifications(leadId);
    } catch (error) {
      console.error(`dispatchLeadNotifications(${leadId})`, error);
    }
  });

  return { status: "ok", leadId };
}
