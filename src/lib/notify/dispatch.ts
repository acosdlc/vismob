import "server-only";
import { createElement } from "react";
import { LeadConfirmation } from "@/emails/LeadConfirmation";
import { LeadToWorkshop } from "@/emails/LeadToWorkshop";
import { configCode, formatPrice, ticketRows } from "@/lib/configurator/format";
import { resolve, type Resolved } from "@/lib/configurator/rules";
import type { Config } from "@/lib/configurator/types";
import { getCatalog } from "@/lib/data/catalog";
import { getSettings, type Settings } from "@/lib/data/settings";
import { optionalEnv } from "@/lib/env";
import { UPLOAD_LIMITS, type LeadRow } from "@/lib/leads/types";
import { shareUrl } from "@/lib/site-url";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { drawingAttachment, type DrawingAttachment } from "./drawing-png";
import { sendEmail, type SendEmailInput, type SendEmailResult } from "./email";
import { clientSubject, workshopSubject } from "./subjects";

// ARHITECTURA §6.1 step 8: runs in `after()` once the lead is stored. Sends the
// workshop email, then the client's confirmation, and writes one `lead_events`
// row per send so the `retry-notifications` cron (src/lib/cron) can pick up
// failures and send one email again on its own (`sendLeadNotification`). It
// never throws: the request is already saved, a failed email must not surface
// as an error.

/** Signed photo links stay valid this long (ARHITECTURA §6.4). */
export const PHOTO_LINK_SECONDS = 7 * 24 * 60 * 60;

/** The two values `lead_events.type` allows (CHECK constraint in the leads migration). */
export const LEAD_EVENT_TYPES = ["email_workshop", "email_client"] as const;
export type LeadEventType = (typeof LEAD_EVENT_TYPES)[number];

export function isLeadEventType(value: string): value is LeadEventType {
  return (LEAD_EVENT_TYPES as readonly string[]).includes(value);
}

/** A `lead_events.detail` object; the retry cron adds e.g. `{ attempt: 2 }` to it. */
export type EventDetail = { [key: string]: Json | undefined };

/** One email ready to send; the same shape `sendEmail` takes. */
export type LeadEmail = SendEmailInput;

/** `email_workshop` is null when NOTIFY_EMAIL is unset: sending it records the failure instead. */
export interface LeadEmails {
  email_workshop: LeadEmail | null;
  email_client: LeadEmail;
}

function eventDetail(result: SendEmailResult): EventDetail {
  if (!result.ok) return { error: result.error };
  if (result.dryRun) return { dryRun: true };
  return { id: result.id ?? null };
}

/** The send's own keys win over the extra ones. */
function withExtra(detail: EventDetail, extra?: EventDetail): EventDetail {
  return extra ? { ...extra, ...detail } : detail;
}

async function recordEvent(admin: AdminClient, leadId: string, type: LeadEventType, ok: boolean, detail: EventDetail) {
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
  /** The drawing PNG, rendered once and attached to both emails. */
  attachment?: DrawingAttachment;
}

/**
 * The stored `config` resolved again against the catalog, so the rows, the link
 * and the drawing follow the same rules as the page. The price is the one stored
 * at submit (recomputed on the server then, §5.7), formatted for the emails.
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
    attachment: await renderAttachment(r, lead),
  };
}

/** The sheet as PNG (ARHITECTURA §6.4). When rendering fails the emails go out without it. */
async function renderAttachment(r: Resolved, lead: LeadRow): Promise<DrawingAttachment | undefined> {
  try {
    return await drawingAttachment(r, lead.config_code ?? configCode(r));
  } catch (cause) {
    console.error(`[notify] drawing PNG failed for ${lead.id}; sending without it:`, cause);
    return undefined;
  }
}

/** A `settings` address is usable only when it is not a `[...]` placeholder. */
function realAddress(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed && !trimmed.includes("[") && trimmed.includes("@") ? trimmed : undefined;
}

/**
 * Both emails for a lead, built once: the photo links signed, the configuration
 * resolved and the drawing rendered a single time, shared by the two. To the
 * workshop with reply-to the client; to the client with reply-to the workshop's
 * public address or NOTIFY_EMAIL (ARHITECTURA §6.4).
 */
export async function buildLeadEmails(admin: AdminClient, lead: LeadRow, settings: Settings): Promise<LeadEmails> {
  const { data: files, error: filesError } = await admin.from("lead_files").select("path").eq("lead_id", lead.id);
  if (filesError) console.error(`[notify] lead_files for ${lead.id}: ${filesError.message}`);

  const photoUrls = await signPhotoUrls(admin, (files ?? []).map((f) => f.path));
  const notifyEmail = optionalEnv("NOTIFY_EMAIL");
  const replyTo = realAddress(settings.email_public) ?? notifyEmail;

  const config = await configProps(lead);
  const attachments = config.attachment ? [config.attachment] : undefined;
  const drawingAttached = config.attachment !== undefined;

  const workshopEmail = createElement(LeadToWorkshop, {
    lead,
    workshopName: settings.workshop_name,
    photoUrls,
    ticketRows: config.ticketRows,
    shareUrl: config.shareUrl,
    priceLabel: config.priceLabel,
    drawingAttached,
  });
  const clientEmail = createElement(LeadConfirmation, {
    lead,
    workshopName: settings.workshop_name,
    responseTime: settings.response_time,
    phonePublic: settings.phone_public,
    emailPublic: settings.email_public,
    ticketRows: config.ticketRows,
    shareUrl: config.shareUrl,
    drawingAttached,
  });

  return {
    email_workshop: notifyEmail
      ? { to: notifyEmail, subject: workshopSubject(lead), react: workshopEmail, replyTo: lead.email, attachments }
      : null,
    email_client: { to: lead.email, subject: clientSubject(lead), react: clientEmail, replyTo, attachments },
  };
}

/** Sends one built email and records its `lead_events` row. Never throws. */
async function sendBuilt(
  admin: AdminClient,
  lead: LeadRow,
  type: LeadEventType,
  email: LeadEmail | null,
  extra?: EventDetail,
): Promise<SendEmailResult> {
  try {
    if (!email) {
      console.error("[notify] NOTIFY_EMAIL missing: the workshop email was not sent.");
      const result: SendEmailResult = { ok: false, error: "NOTIFY_EMAIL missing" };
      await recordEvent(admin, lead.id, type, false, withExtra({ error: result.error }, extra));
      return result;
    }
    const result = await sendEmail(email);
    if (!result.ok) console.error(`[notify] ${type} failed for ${lead.id}: ${result.error}`);
    await recordEvent(admin, lead.id, type, result.ok, withExtra(eventDetail(result), extra));
    return result;
  } catch (cause) {
    console.error(`[notify] ${type} threw for ${lead.id}:`, cause);
    const result: SendEmailResult = { ok: false, error: String(cause) };
    await recordEvent(admin, lead.id, type, false, withExtra({ error: result.error }, extra)).catch(() => undefined);
    return result;
  }
}

/**
 * Builds and sends one of the two emails again, on its own, and records the
 * attempt in `lead_events` with `detailExtra` (e.g. `{ attempt: 2 }`) merged
 * into `detail`. For the retry cron (ARHITECTURA §6.1 step 4). Never throws.
 */
export async function sendLeadNotification(
  admin: AdminClient,
  lead: LeadRow,
  type: LeadEventType,
  detailExtra?: EventDetail,
): Promise<SendEmailResult> {
  try {
    const settings = await getSettings();
    const emails = await buildLeadEmails(admin, lead, settings);
    return await sendBuilt(admin, lead, type, emails[type], detailExtra);
  } catch (cause) {
    console.error(`[notify] could not build ${type} for ${lead.id}:`, cause);
    const error = cause instanceof Error ? cause.message : String(cause);
    await recordEvent(admin, lead.id, type, false, withExtra({ error }, detailExtra)).catch(() => undefined);
    return { ok: false, error };
  }
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

    const settings = await getSettings();
    const emails = await buildLeadEmails(admin, lead, settings);

    await sendBuilt(admin, lead, "email_workshop", emails.email_workshop);
    await sendBuilt(admin, lead, "email_client", emails.email_client);
  } catch (cause) {
    // Before either send ran: leave both rows as failed so the retry cron finds them.
    console.error(`[notify] dispatch failed for lead ${leadId}:`, cause);
    const detail: EventDetail = { error: cause instanceof Error ? cause.message : String(cause) };
    await recordEvent(admin, leadId, "email_workshop", false, detail).catch(() => undefined);
    await recordEvent(admin, leadId, "email_client", false, detail).catch(() => undefined);
  }
}
