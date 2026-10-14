import "server-only";
import { createElement } from "react";
import { LeadConfirmation } from "@/emails/LeadConfirmation";
import { LeadToWorkshop } from "@/emails/LeadToWorkshop";
import { getSettings } from "@/lib/data/settings";
import { optionalEnv } from "@/lib/env";
import { UPLOAD_LIMITS, type LeadRow } from "@/lib/leads/types";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { sendEmail, type SendEmailResult } from "./email";
import { clientSubject, workshopSubject } from "./subjects";

// ARHITECTURA §6.1 step 8: runs in `after()` once the lead is stored. Sends the
// workshop email, then the client's confirmation, and writes one `lead_events`
// row per send so the retry cron (PR-6) can pick up failures. It never throws:
// the request is already saved, a failed email must not surface as an error.

/** Signed photo links stay valid this long (ARHITECTURA §6.4). */
export const PHOTO_LINK_SECONDS = 7 * 24 * 60 * 60;

export type LeadEventType = "email_workshop" | "email_client";

function eventDetail(result: SendEmailResult): Json {
  if (!result.ok) return { error: result.error };
  if (result.dryRun) return { dryRun: true };
  return { id: result.id ?? null };
}

async function recordEvent(admin: AdminClient, leadId: string, type: LeadEventType, ok: boolean, detail: Json) {
  const { error } = await admin.from("lead_events").insert({ lead_id: leadId, type, ok, detail });
  if (error) console.error(`[notify] lead_events insert failed for ${leadId}/${type}: ${error.message}`);
}

async function signPhotoUrls(admin: AdminClient, paths: string[]): Promise<string[]> {
  const bucket = admin.storage.from(UPLOAD_LIMITS.bucket);
  const signed = await Promise.all(
    paths.map(async (path) => {
      const { data, error } = await bucket.createSignedUrl(path, PHOTO_LINK_SECONDS);
      if (error || !data) {
        console.error(`[notify] could not sign ${path}: ${error?.message ?? "no data"}`);
        return null;
      }
      return data.signedUrl;
    }),
  );
  return signed.filter((url): url is string => typeof url === "string");
}

/** A `settings` address is usable only when it is not a `[...]` placeholder. */
function realAddress(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed && !trimmed.includes("[") && trimmed.includes("@") ? trimmed : undefined;
}

export async function dispatchLeadNotifications(leadId: string): Promise<void> {
  let admin: AdminClient;
  try {
    admin = createAdminClient();
  } catch (cause) {
    console.error(`[notify] no admin client for lead ${leadId}:`, cause);
    return;
  }

  try {
    const { data: lead, error: leadError } = await admin.from("leads").select("*").eq("id", leadId).maybeSingle();
    if (leadError || !lead) {
      console.error(`[notify] lead ${leadId} not found: ${leadError?.message ?? "no row"}`);
      return;
    }

    const { data: files, error: filesError } = await admin.from("lead_files").select("path").eq("lead_id", leadId);
    if (filesError) console.error(`[notify] lead_files for ${leadId}: ${filesError.message}`);

    const settings = await getSettings();
    const photoUrls = await signPhotoUrls(admin, (files ?? []).map((f) => f.path));
    const notifyEmail = optionalEnv("NOTIFY_EMAIL");

    await notifyWorkshop(admin, lead, notifyEmail, settings.workshop_name, photoUrls);
    await confirmToClient(admin, lead, {
      workshopName: settings.workshop_name,
      responseTime: settings.response_time,
      phonePublic: settings.phone_public,
      emailPublic: settings.email_public,
      replyTo: realAddress(settings.email_public) ?? notifyEmail,
    });
  } catch (cause) {
    // Before either send ran: leave both rows as failed so the retry cron (PR-6) finds them.
    console.error(`[notify] dispatch failed for lead ${leadId}:`, cause);
    const detail: Json = { error: cause instanceof Error ? cause.message : String(cause) };
    await recordEvent(admin, leadId, "email_workshop", false, detail).catch(() => undefined);
    await recordEvent(admin, leadId, "email_client", false, detail).catch(() => undefined);
  }
}

async function notifyWorkshop(
  admin: AdminClient,
  lead: LeadRow,
  notifyEmail: string | undefined,
  workshopName: string,
  photoUrls: string[],
) {
  try {
    if (!notifyEmail) {
      console.error("[notify] NOTIFY_EMAIL missing: the workshop email was not sent.");
      await recordEvent(admin, lead.id, "email_workshop", false, { error: "NOTIFY_EMAIL missing" });
      return;
    }
    const result = await sendEmail({
      to: notifyEmail,
      subject: workshopSubject(lead),
      react: createElement(LeadToWorkshop, { lead, workshopName, photoUrls }),
      replyTo: lead.email,
    });
    if (!result.ok) console.error(`[notify] workshop email failed for ${lead.id}: ${result.error}`);
    await recordEvent(admin, lead.id, "email_workshop", result.ok, eventDetail(result));
  } catch (cause) {
    console.error(`[notify] workshop email threw for ${lead.id}:`, cause);
    await recordEvent(admin, lead.id, "email_workshop", false, { error: String(cause) }).catch(() => undefined);
  }
}

async function confirmToClient(
  admin: AdminClient,
  lead: LeadRow,
  input: { workshopName: string; responseTime: string; phonePublic: string; emailPublic: string; replyTo?: string },
) {
  try {
    const result = await sendEmail({
      to: lead.email,
      subject: clientSubject(lead),
      react: createElement(LeadConfirmation, {
        lead,
        workshopName: input.workshopName,
        responseTime: input.responseTime,
        phonePublic: input.phonePublic,
        emailPublic: input.emailPublic,
      }),
      replyTo: input.replyTo,
    });
    if (!result.ok) console.error(`[notify] client email failed for ${lead.id}: ${result.error}`);
    await recordEvent(admin, lead.id, "email_client", result.ok, eventDetail(result));
  } catch (cause) {
    console.error(`[notify] client email threw for ${lead.id}:`, cause);
    await recordEvent(admin, lead.id, "email_client", false, { error: String(cause) }).catch(() => undefined);
  }
}
