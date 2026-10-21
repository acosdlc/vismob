// @vitest-environment node
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LeadRow } from "@/lib/leads/types";
import type { Json } from "@/lib/supabase/database.types";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ sendLeadNotification: vi.fn(), sendEmail: vi.fn() }));
// The dispatcher builds and sends the lead email; here it only has to succeed or fail.
vi.mock("@/lib/notify/dispatch", () => ({ sendLeadNotification: mocks.sendLeadNotification }));
vi.mock("@/lib/notify/email", () => ({ sendEmail: mocks.sendEmail }));

import { NotificationAlert } from "@/emails/NotificationAlert";
import { siteUrl } from "@/lib/site-url";
import { fakeCronAdmin, filterOf, hasFilter, type FakeQuery, type FakeResult } from "./admin.fake";
import { retryNotifications } from "./retry-notifications";
import { MAX_NOTIFICATION_ATTEMPTS } from "./shared";

const NOW = new Date("2026-10-21T12:00:00.000Z");
const SINCE = "2026-10-14T12:00:00.000Z";
const NOTIFY = "atelier-preview@example.com";

const LEAD: LeadRow = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "configurator",
  status: "nou",
  name: "Ștefan Țăranu",
  phone: "+40722123456",
  email: "stefan@example.com",
  city: "Timișoara",
  address: null,
  mattress_size: null,
  message: null,
  wants_measurement: false,
  config: { model: "capitonat" },
  config_code: "CAP-160x200-CT01-H120-LD-LED",
  price_estimate_ron: 7450,
  sample_material_ids: null,
  notes: null,
  source: { page: "/configurator", environment: "production" },
  ip_hash: "abc",
  consent_text: "Sunt de acord cu prelucrarea datelor conform Politicii de confidențialitate.",
  consent_at: "2026-10-20T08:30:00.000Z",
  created_at: "2026-10-20T08:30:00.000Z",
};

interface FailedEvent {
  id: number;
  lead_id: string;
  type: string;
  detail: Json | null;
  at: string;
}

interface Scenario {
  failed?: FailedEvent[];
  delivered?: { lead_id: string; type: string }[];
  leads?: Record<string, LeadRow>;
  /** The newest failed event of a pair, as the alert bookkeeping reads it. */
  latest?: { id: number; detail: Json | null } | null;
  failedError?: string;
}

let nextId = 1;
const failed = (leadId: string, type: string, count: number, detail: Json = { error: "smtp down" }): FailedEvent[] =>
  Array.from({ length: count }, (_, i) => ({
    id: nextId++,
    lead_id: leadId,
    type,
    detail,
    at: `2026-10-20T${String(9 + i).padStart(2, "0")}:00:00.000Z`,
  }));

const respond = (scenario: Scenario) => (query: FakeQuery): FakeResult | undefined => {
  if (query.table === "lead_events" && query.op === "select") {
    if (query.single) return { data: scenario.latest === undefined ? null : scenario.latest };
    if (hasFilter(query, "eq", "ok", false)) {
      return scenario.failedError ? { error: { message: scenario.failedError } } : { data: scenario.failed ?? [] };
    }
    if (hasFilter(query, "eq", "ok", true)) return { data: scenario.delivered ?? [] };
  }
  if (query.table === "leads" && query.op === "select") {
    const id = filterOf(query, "eq")?.[2] as string;
    return { data: scenario.leads?.[id] ?? null };
  }
  return undefined;
};

type AlertCall = { to: string; subject: string; react: ReactElement<Record<string, unknown>> };
const alerts = () => mocks.sendEmail.mock.calls.map((call) => call[0] as AlertCall);
const updates = (queries: FakeQuery[]) => queries.filter((query) => query.op === "update");

beforeEach(() => {
  nextId = 1;
  vi.stubEnv("NOTIFY_EMAIL", NOTIFY);
  mocks.sendLeadNotification.mockReset();
  mocks.sendLeadNotification.mockResolvedValue({ ok: true, id: "re_retry" });
  mocks.sendEmail.mockReset();
  mocks.sendEmail.mockResolvedValue({ ok: true, id: "re_alert" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("retryNotifications", () => {
  it("retries a pair that failed once, as attempt 2, and counts the success", async () => {
    const fake = fakeCronAdmin({
      respond: respond({
        failed: failed(LEAD.id, "email_client", 1),
        delivered: [{ lead_id: LEAD.id, type: "email_workshop" }],
        leads: { [LEAD.id]: LEAD },
      }),
    });

    const report = await retryNotifications(fake.client, NOW);

    expect(report).toEqual({
      job: "retry-notifications",
      ok: true,
      counts: { retried: 1, succeeded: 1, alerted: 0, skipped: 0, deferred: 0 },
      errors: [],
    });
    expect(mocks.sendLeadNotification).toHaveBeenCalledTimes(1);
    expect(mocks.sendLeadNotification).toHaveBeenCalledWith(fake.client, LEAD, "email_client", { attempt: 2 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();

    const [failedQuery, deliveredQuery, leadQuery] = fake.queries;
    expect(failedQuery).toMatchObject({
      table: "lead_events",
      op: "select",
      payload: "id, lead_id, type, detail, at",
      filters: [
        ["eq", "ok", false],
        ["gt", "at", SINCE],
        ["order", "at", { ascending: true }],
        ["limit", 1000],
      ],
    });
    expect(deliveredQuery).toMatchObject({
      table: "lead_events",
      payload: "lead_id, type",
      filters: [
        ["eq", "ok", true],
        ["in", "lead_id", [LEAD.id]],
      ],
    });
    expect(leadQuery).toMatchObject({ table: "leads", payload: "*", filters: [["eq", "id", LEAD.id]], single: true });
  });

  it("skips pairs already delivered, pairs with three failures, and events of another type", async () => {
    const other = "22222222-2222-4222-8222-222222222222";
    const fake = fakeCronAdmin({
      respond: respond({
        failed: [
          ...failed(LEAD.id, "email_client", 1),
          ...failed(other, "email_workshop", MAX_NOTIFICATION_ATTEMPTS),
          ...failed(other, "sms", 1),
        ],
        delivered: [{ lead_id: LEAD.id, type: "email_client" }],
        leads: { [LEAD.id]: LEAD, [other]: { ...LEAD, id: other } },
      }),
    });

    const report = await retryNotifications(fake.client, NOW);

    expect(report.ok).toBe(true);
    expect(report.counts).toEqual({ retried: 0, succeeded: 0, alerted: 0, skipped: 2, deferred: 0 });
    expect(mocks.sendLeadNotification).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(2);
  });

  it("does nothing, with no second query, when nothing failed", async () => {
    const fake = fakeCronAdmin({ respond: respond({}) });
    const report = await retryNotifications(fake.client, NOW);
    expect(report.ok).toBe(true);
    expect(report.counts).toEqual({ retried: 0, succeeded: 0, alerted: 0, skipped: 0, deferred: 0 });
    expect(fake.queries).toHaveLength(1);
  });

  it("counts a failed second attempt without alerting", async () => {
    const fake = fakeCronAdmin({ respond: respond({ failed: failed(LEAD.id, "email_workshop", 1), leads: { [LEAD.id]: LEAD } }) });
    mocks.sendLeadNotification.mockResolvedValue({ ok: false, error: "smtp down" });

    const report = await retryNotifications(fake.client, NOW);

    expect(report.ok).toBe(true);
    expect(report.counts).toEqual({ retried: 1, succeeded: 0, alerted: 0, skipped: 0, deferred: 0 });
    expect(mocks.sendLeadNotification).toHaveBeenCalledWith(fake.client, LEAD, "email_workshop", { attempt: 2 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(updates(fake.queries)).toEqual([]);
  });

  it("sends one alert to NOTIFY_EMAIL when the third attempt fails and marks that event as alerted", async () => {
    const fake = fakeCronAdmin({
      respond: respond({
        failed: failed(LEAD.id, "email_workshop", 2),
        leads: { [LEAD.id]: LEAD },
        latest: { id: 77, detail: { error: "smtp down", attempt: 3 } },
      }),
    });
    mocks.sendLeadNotification.mockResolvedValue({ ok: false, error: "smtp down" });

    const report = await retryNotifications(fake.client, NOW);

    expect(report.ok).toBe(true);
    expect(report.counts).toEqual({ retried: 1, succeeded: 0, alerted: 1, skipped: 0, deferred: 0 });
    expect(mocks.sendLeadNotification).toHaveBeenCalledWith(fake.client, LEAD, "email_workshop", { attempt: 3 });

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const [alert] = alerts();
    expect(alert.to).toBe(NOTIFY);
    expect(alert.subject).toBe("Notificare eșuată · CAP-160x200-CT01-H120-LD-LED");
    expect(alert.react.type).toBe(NotificationAlert);
    expect(alert.react.props).toEqual({
      leadId: LEAD.id,
      leadName: "Ștefan Țăranu",
      configCode: "CAP-160x200-CT01-H120-LD-LED",
      type: "email_workshop",
      error: "smtp down",
      attempts: 3,
      adminUrl: `${siteUrl()}/admin/cereri/${LEAD.id}`,
    });

    const latest = fake.queries.find((query) => query.single && query.table === "lead_events")!;
    expect(latest).toMatchObject({
      payload: "id, detail",
      filters: [
        ["eq", "lead_id", LEAD.id],
        ["eq", "type", "email_workshop"],
        ["eq", "ok", false],
        ["order", "at", { ascending: false }],
        ["limit", 1],
      ],
    });
    expect(updates(fake.queries)).toEqual([
      expect.objectContaining({
        table: "lead_events",
        payload: { detail: { error: "smtp down", attempt: 3, alerted: true, alert: { id: "re_alert", dryRun: false } } },
        filters: [["eq", "id", 77]],
      }),
    ]);
  });

  it("records a missing NOTIFY_EMAIL as the alert's error, still marking the event, and fails the run", async () => {
    vi.stubEnv("NOTIFY_EMAIL", "");
    const fake = fakeCronAdmin({
      respond: respond({ failed: failed(LEAD.id, "email_client", 2), leads: { [LEAD.id]: LEAD }, latest: { id: 5, detail: null } }),
    });
    mocks.sendLeadNotification.mockResolvedValue({ ok: false, error: "smtp down" });

    const report = await retryNotifications(fake.client, NOW);

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual([`alert for ${LEAD.id}/email_client: NOTIFY_EMAIL missing`]);
    expect(report.counts.alerted).toBe(0);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(updates(fake.queries)[0].payload).toEqual({
      detail: { alerted: true, alert: { error: "NOTIFY_EMAIL missing" } },
    });
  });

  it("reports an alert that could not be sent and a bookkeeping row that is missing", async () => {
    const fake = fakeCronAdmin({
      respond: respond({ failed: failed(LEAD.id, "email_client", 2), leads: { [LEAD.id]: LEAD }, latest: null }),
    });
    mocks.sendLeadNotification.mockResolvedValue({ ok: false, error: "smtp down" });
    mocks.sendEmail.mockResolvedValue({ ok: false, error: "resend down" });

    const report = await retryNotifications(fake.client, NOW);

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual([
      `alert for ${LEAD.id}/email_client: resend down`,
      `${LEAD.id}/email_client: lead_events: no failed event for ${LEAD.id}/email_client`,
    ]);
    expect(report.counts).toEqual({ retried: 1, succeeded: 0, alerted: 0, skipped: 0, deferred: 0 });
  });

  it("leaves an alerted pair alone once its older failures have left the window", async () => {
    // Day 7: the first of three failures is out of the window, the newest still
    // carries the alert mark; the pair must not be retried or alerted again.
    const [second, third] = failed(LEAD.id, "email_client", 2);
    const alerted = { error: "smtp down", attempt: 3, alerted: true, alert: { id: "re_alert", dryRun: false } };
    const fake = fakeCronAdmin({
      respond: respond({ failed: [second, { ...third, detail: alerted }], leads: { [LEAD.id]: LEAD } }),
    });
    mocks.sendLeadNotification.mockResolvedValue({ ok: false, error: "smtp down" });

    const report = await retryNotifications(fake.client, NOW);

    expect(report.ok).toBe(true);
    expect(report.counts).toEqual({ retried: 0, succeeded: 0, alerted: 0, skipped: 1, deferred: 0 });
    expect(mocks.sendLeadNotification).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(updates(fake.queries)).toEqual([]);
    expect(fake.queries).toHaveLength(2);
  });

  it("skips a pair whose lead no longer exists", async () => {
    const fake = fakeCronAdmin({ respond: respond({ failed: failed(LEAD.id, "email_client", 1) }) });
    const report = await retryNotifications(fake.client, NOW);
    expect(report.ok).toBe(true);
    expect(report.counts).toEqual({ retried: 0, succeeded: 0, alerted: 0, skipped: 1, deferred: 0 });
    expect(mocks.sendLeadNotification).not.toHaveBeenCalled();
  });

  it("retries at most 50 pairs per run and defers the rest", async () => {
    const leads: Record<string, LeadRow> = {};
    const events: FailedEvent[] = [];
    for (let i = 0; i < 60; i += 1) {
      const id = `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`;
      leads[id] = { ...LEAD, id };
      events.push(...failed(id, "email_client", 1));
    }
    const fake = fakeCronAdmin({ respond: respond({ failed: events, leads }) });

    const report = await retryNotifications(fake.client, NOW);

    expect(report.ok).toBe(true);
    expect(report.counts).toEqual({ retried: 50, succeeded: 50, alerted: 0, skipped: 0, deferred: 10 });
    expect(mocks.sendLeadNotification).toHaveBeenCalledTimes(50);
  });

  it("reports a failed query, sends nothing and never throws", async () => {
    const fake = fakeCronAdmin({ respond: respond({ failedError: "db down" }) });
    await expect(retryNotifications(fake.client, NOW)).resolves.toEqual({
      job: "retry-notifications",
      ok: false,
      counts: { retried: 0, succeeded: 0, alerted: 0, skipped: 0, deferred: 0 },
      errors: ["lead_events: db down"],
    });
    expect(mocks.sendLeadNotification).not.toHaveBeenCalled();
  });

  it("keeps a lead query error to its pair and goes on with the others", async () => {
    const other = "22222222-2222-4222-8222-222222222222";
    const base = respond({
      failed: [...failed(LEAD.id, "email_client", 1), ...failed(other, "email_client", 1)],
      leads: { [LEAD.id]: LEAD, [other]: { ...LEAD, id: other } },
    });
    const fake = fakeCronAdmin({
      respond: (query) =>
        query.table === "leads" && hasFilter(query, "eq", "id", LEAD.id) ? { error: { message: "db hiccup" } } : base(query),
    });

    const report = await retryNotifications(fake.client, NOW);

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual([`${LEAD.id}/email_client: leads: db hiccup`]);
    expect(report.counts).toEqual({ retried: 1, succeeded: 1, alerted: 0, skipped: 0, deferred: 0 });
    expect(mocks.sendLeadNotification).toHaveBeenCalledTimes(1);
    expect(mocks.sendLeadNotification.mock.calls[0][1]).toMatchObject({ id: other });
  });
});
