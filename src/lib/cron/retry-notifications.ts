import "server-only";
import { createElement } from "react";
import { alertSubject, NotificationAlert } from "@/emails/NotificationAlert";
import { optionalEnv } from "@/lib/env";
import type { LeadRow } from "@/lib/leads/types";
import { sendLeadNotification, type EventDetail, type LeadEventType } from "@/lib/notify/dispatch";
import { sendEmail, type SendEmailResult } from "@/lib/notify/email";
import { siteUrl } from "@/lib/site-url";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import {
  chunk,
  daysBefore,
  errorMessage,
  finishReport,
  MAX_NOTIFICATION_ATTEMPTS,
  newReport,
  RETRY_MAX_PAIRS,
  RETRY_WINDOW_DAYS,
  type JobReport,
} from "./shared";

// Every 15 minutes (ARHITECTURA §6.1 step 4): a lead email that failed is sent
// again, up to MAX_NOTIFICATION_ATTEMPTS times in all; when the last allowed
// attempt fails too, NOTIFY_EMAIL gets one NotificationAlert and the failed
// event is marked `alerted` in its `detail`. Later runs read that mark back, so
// the pair stays skipped while its older failures leave the window and is never
// alerted twice. `lead_events.type` only allows the two email types, so the
// alert leaves no event of its own.

/** The two `lead_events.type` values; anything else in the column is left alone. */
const LEAD_EVENT_TYPES: readonly LeadEventType[] = ["email_workshop", "email_client"];

/** Failed events the query may return per run (pairs are bounded separately). */
const EVENTS_LIMIT = 1000;
/** Lead ids per `in(...)` filter when looking for delivered emails. */
const DELIVERED_CHUNK = 100;

interface FailedEvent {
  id: number;
  lead_id: string;
  type: string;
  detail: Json | null;
  at: string;
}

interface Pair {
  leadId: string;
  type: LeadEventType;
  failures: number;
  /** One of the failures carries the alert mark: the pair already had its alert. */
  alerted: boolean;
}

function isDetailObject(value: Json | null): value is EventDetail {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Failed events in the window grouped by (lead, type), oldest pair first. */
function groupPairs(events: FailedEvent[]): Pair[] {
  const pairs = new Map<string, Pair>();
  for (const event of events) {
    const type = event.type;
    if (!(LEAD_EVENT_TYPES as readonly string[]).includes(type)) continue;
    const key = `${event.lead_id}/${type}`;
    const alerted = isDetailObject(event.detail) && event.detail.alerted === true;
    const pair = pairs.get(key);
    if (pair) {
      pair.failures += 1;
      if (alerted) pair.alerted = true;
    } else {
      pairs.set(key, { leadId: event.lead_id, type: type as LeadEventType, failures: 1, alerted });
    }
  }
  return [...pairs.values()];
}

/** The alert to NOTIFY_EMAIL; `sendEmail` reports instead of throwing. */
async function sendAlert(lead: LeadRow, type: LeadEventType, error: string, attempts: number): Promise<SendEmailResult> {
  const notifyEmail = optionalEnv("NOTIFY_EMAIL");
  if (!notifyEmail) return { ok: false, error: "NOTIFY_EMAIL missing" };
  return sendEmail({
    to: notifyEmail,
    subject: alertSubject(lead),
    react: createElement(NotificationAlert, {
      leadId: lead.id,
      leadName: lead.name,
      configCode: lead.config_code,
      type,
      error,
      attempts,
      adminUrl: `${siteUrl()}/admin/cereri/${lead.id}`,
    }),
  });
}

/** Writes `alerted: true` and the alert's id or error into the newest failed event of the pair. */
async function markAlerted(admin: AdminClient, lead: LeadRow, type: LeadEventType, alert: SendEmailResult): Promise<void> {
  const { data: latest, error } = await admin
    .from("lead_events")
    .select("id, detail")
    .eq("lead_id", lead.id)
    .eq("type", type)
    .eq("ok", false)
    .order("at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`lead_events: ${error.message}`);
  if (!latest) throw new Error(`lead_events: no failed event for ${lead.id}/${type}`);
  const detail: EventDetail = {
    ...(isDetailObject(latest.detail) ? latest.detail : {}),
    alerted: true,
    alert: alert.ok ? { id: alert.id ?? null, dryRun: alert.dryRun ?? false } : { error: alert.error },
  };
  const { error: updateError } = await admin.from("lead_events").update({ detail }).eq("id", latest.id);
  if (updateError) throw new Error(`lead_events update: ${updateError.message}`);
}

async function retryPair(admin: AdminClient, pair: Pair, report: JobReport): Promise<void> {
  const label = `${pair.leadId}/${pair.type}`;
  try {
    const { data: lead, error } = await admin.from("leads").select("*").eq("id", pair.leadId).maybeSingle();
    if (error) throw new Error(`leads: ${error.message}`);
    if (!lead) {
      report.counts.skipped += 1;
      return;
    }

    const attempt = pair.failures + 1;
    report.counts.retried += 1;
    const result = await sendLeadNotification(admin, lead, pair.type, { attempt });
    if (result.ok) {
      report.counts.succeeded += 1;
      return;
    }
    if (attempt < MAX_NOTIFICATION_ATTEMPTS) return;

    const alert = await sendAlert(lead, pair.type, result.error, attempt);
    if (alert.ok) report.counts.alerted += 1;
    else report.errors.push(`alert for ${label}: ${alert.error}`);
    await markAlerted(admin, lead, pair.type, alert);
  } catch (cause) {
    report.errors.push(`${label}: ${errorMessage(cause)}`);
  }
}

export async function retryNotifications(admin: AdminClient, now: Date = new Date()): Promise<JobReport> {
  const report = newReport("retry-notifications", ["retried", "succeeded", "alerted", "skipped", "deferred"]);
  try {
    const since = daysBefore(now, RETRY_WINDOW_DAYS).toISOString();
    const { data: failed, error } = await admin
      .from("lead_events")
      .select("id, lead_id, type, detail, at")
      .eq("ok", false)
      .gt("at", since)
      .order("at", { ascending: true })
      .limit(EVENTS_LIMIT);
    if (error) throw new Error(`lead_events: ${error.message}`);

    const pairs = groupPairs(failed);
    if (pairs.length === 0) return finishReport(report);

    // A pair with a delivered email needs no retry, whatever failed before it.
    // The ids go in the URL, so they are asked for in slices.
    const leadIds = [...new Set(pairs.map((pair) => pair.leadId))];
    const done = new Set<string>();
    for (const slice of chunk(leadIds, DELIVERED_CHUNK)) {
      const { data: delivered, error: deliveredError } = await admin
        .from("lead_events")
        .select("lead_id, type")
        .eq("ok", true)
        .in("lead_id", slice);
      if (deliveredError) throw new Error(`lead_events: ${deliveredError.message}`);
      for (const event of delivered) done.add(`${event.lead_id}/${event.type}`);
    }

    let processed = 0;
    for (const pair of pairs) {
      // The alerted event is the newest failure of its pair, so it is the last to
      // leave the window; once it is gone the pair has no failed event left.
      if (done.has(`${pair.leadId}/${pair.type}`) || pair.alerted || pair.failures >= MAX_NOTIFICATION_ATTEMPTS) {
        report.counts.skipped += 1;
        continue;
      }
      if (processed >= RETRY_MAX_PAIRS) {
        report.counts.deferred += 1;
        continue;
      }
      processed += 1;
      await retryPair(admin, pair, report);
    }
  } catch (cause) {
    report.errors.push(errorMessage(cause));
  }
  return finishReport(report);
}
