import "server-only";
import { createElement, type ReactElement } from "react";
import type { SampleItem } from "@/components/materials/types";
import { LeadConfirmation } from "@/emails/LeadConfirmation";
import { LeadToWorkshop } from "@/emails/LeadToWorkshop";
import { SamplesConfirmation } from "@/emails/SamplesConfirmation";
import { SamplesToWorkshop } from "@/emails/SamplesToWorkshop";
import { formatPrice, ticketRows } from "@/lib/configurator/format";
import { resolve } from "@/lib/configurator/rules";
import type { Config } from "@/lib/configurator/types";
import { getCatalog } from "@/lib/data/catalog";
import { getSettings } from "@/lib/data/settings";
import { resolveSampleItems } from "@/lib/materials/samples";
import { optionalEnv } from "@/lib/env";
import { UPLOAD_LIMITS, type LeadRow } from "@/lib/leads/types";
import { shareUrl } from "@/lib/site-url";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { sendEmail, type SendEmailResult } from "./email";
import { clientSubject, workshopSubject } from "./subjects";

// ARHITECTURA §6.1 step 8: runs in `after()` once the lead is stored. Sends the
// workshop email, then the client's confirmation, and writes one `lead_events`
// row per send so the retry cron (PR-6) can pick up failures. It never throws:
// the request is already saved, a failed email must not surface as an error.
// Contact and configurator leads get LeadToWorkshop / LeadConfirmation; a samples
// lead (kind "mostre") gets SamplesToWorkshop / SamplesConfirmation (§6.3–6.4).

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

/** What both emails get for a configurator lead (DESIGN §5.6, ARHITECTURA §6.4); nothing for the others. */
interface ConfigProps {
  ticketRows?: { k: string; v: string }[];
  shareUrl?: string;
  priceLabel?: string;
}

/**
 * The stored `config` resolved again against the catalog, so the rows and the
 * link follow the same rules as the page. The price is the one stored at submit
 * (recomputed on the server then, §5.7), formatted for the emails.
 */
async function configProps(lead: LeadRow): Promise<ConfigProps> {
  if (lead.kind !== "configurator") return {};
  if (!lead.config || typeof lead.config !== "object" || Array.isArray(lead.config)) {
    console.error(`[notify] lead ${lead.id} is a configurator lead without a config.`);
    return {};
  }
  const r = resolve(lead.config as unknown as Config, await getCatalog());
  return {
    ticketRows: ticketRows(r),
    shareUrl: shareUrl(r.cfg),
    priceLabel: lead.price_estimate_ron != null ? formatPrice(lead.price_estimate_ron) : undefined,
  };
}

/**
 * The stored `sample_material_ids` resolved against the catalogue, in stored order.
 * An id the catalogue no longer knows is skipped (and logged), never fatal.
 */
export async function sampleItemsFor(lead: LeadRow): Promise<SampleItem[]> {
  if (lead.kind !== "mostre") return [];
  const ids = lead.sample_material_ids ?? [];
  if (ids.length === 0) {
    console.error(`[notify] lead ${lead.id} is a samples lead without sample ids.`);
    return [];
  }
  const { items, unknown } = resolveSampleItems(await getCatalog(), ids);
  for (const id of unknown) console.error(`[notify] lead ${lead.id} names an unknown sample ${id}; skipped.`);
  return items;
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
    const replyTo = realAddress(settings.email_public) ?? notifyEmail;

    let workshopEmail: ReactElement;
    let clientEmail: ReactElement;
    // The subject counts the samples; for a samples lead, the ones the catalogue still knows.
    let subjectLead = lead;
    if (lead.kind === "mostre") {
      const items = await sampleItemsFor(lead);
      subjectLead = { ...lead, sample_material_ids: items.map((item) => item.id) };
      workshopEmail = createElement(SamplesToWorkshop, { lead, items, workshopName: settings.workshop_name });
      clientEmail = createElement(SamplesConfirmation, {
        lead,
        items,
        workshopName: settings.workshop_name,
        samplesDelivery: settings.samples_delivery,
        samplesFree: settings.samples_free,
        phonePublic: settings.phone_public,
        emailPublic: settings.email_public,
      });
    } else {
      const config = await configProps(lead);
      workshopEmail = createElement(LeadToWorkshop, {
        lead,
        workshopName: settings.workshop_name,
        photoUrls,
        ticketRows: config.ticketRows,
        shareUrl: config.shareUrl,
        priceLabel: config.priceLabel,
      });
      clientEmail = createElement(LeadConfirmation, {
        lead,
        workshopName: settings.workshop_name,
        responseTime: settings.response_time,
        phonePublic: settings.phone_public,
        emailPublic: settings.email_public,
        ticketRows: config.ticketRows,
        shareUrl: config.shareUrl,
      });
    }

    await notifyWorkshop(admin, subjectLead, notifyEmail, workshopEmail);
    await confirmToClient(admin, lead, clientEmail, replyTo);
  } catch (cause) {
    // Before either send ran: leave both rows as failed so the retry cron (PR-6) finds them.
    console.error(`[notify] dispatch failed for lead ${leadId}:`, cause);
    const detail: Json = { error: cause instanceof Error ? cause.message : String(cause) };
    await recordEvent(admin, leadId, "email_workshop", false, detail).catch(() => undefined);
    await recordEvent(admin, leadId, "email_client", false, detail).catch(() => undefined);
  }
}

/** To the workshop, reply-to the client (ARHITECTURA §6.4). */
async function notifyWorkshop(admin: AdminClient, lead: LeadRow, notifyEmail: string | undefined, react: ReactElement) {
  try {
    if (!notifyEmail) {
      console.error("[notify] NOTIFY_EMAIL missing: the workshop email was not sent.");
      await recordEvent(admin, lead.id, "email_workshop", false, { error: "NOTIFY_EMAIL missing" });
      return;
    }
    const result = await sendEmail({
      to: notifyEmail,
      subject: workshopSubject(lead),
      react,
      replyTo: lead.email,
    });
    if (!result.ok) console.error(`[notify] workshop email failed for ${lead.id}: ${result.error}`);
    await recordEvent(admin, lead.id, "email_workshop", result.ok, eventDetail(result));
  } catch (cause) {
    console.error(`[notify] workshop email threw for ${lead.id}:`, cause);
    await recordEvent(admin, lead.id, "email_workshop", false, { error: String(cause) }).catch(() => undefined);
  }
}

/** To the client, reply-to the workshop's public address or NOTIFY_EMAIL (ARHITECTURA §6.4). */
async function confirmToClient(admin: AdminClient, lead: LeadRow, react: ReactElement, replyTo: string | undefined) {
  try {
    const result = await sendEmail({
      to: lead.email,
      subject: clientSubject(lead),
      react,
      replyTo,
    });
    if (!result.ok) console.error(`[notify] client email failed for ${lead.id}: ${result.error}`);
    await recordEvent(admin, lead.id, "email_client", result.ok, eventDetail(result));
  } catch (cause) {
    console.error(`[notify] client email threw for ${lead.id}:`, cause);
    await recordEvent(admin, lead.id, "email_client", false, { error: String(cause) }).catch(() => undefined);
  }
}
