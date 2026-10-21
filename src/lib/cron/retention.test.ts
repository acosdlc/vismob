// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fakeCronAdmin, filterOf, hasFilter, type FakeQuery, type FakeResult } from "./admin.fake";
import { retention } from "./retention";
import { RETENTION, RETENTION_BATCH } from "./shared";

// A Wednesday 04:40 UTC, like the weekly schedule; no month-end, so the month arithmetic is exact.
const NOW = new Date("2026-10-21T04:40:00.000Z");
const SPAM_CUTOFF = "2026-09-21T04:40:00.000Z";
const ORDER_CUTOFF = "2024-10-21T04:40:00.000Z";
const PHOTOS_CUTOFF = "2025-10-21T04:40:00.000Z";
const IP_CUTOFF = "2026-04-21T04:40:00.000Z";
const SPAM_OR = "status.eq.spam,source->>environment.in.(preview,development,local)";
const AT = "2026-01-01T00:00:00.000Z";

type Rule = "spam" | "order" | "photos" | "ip";

/** Which retention rule a `leads` select belongs to, from the filters it chained. */
function ruleOf(query: FakeQuery): Rule | undefined {
  if (query.table !== "leads" || query.op !== "select") return undefined;
  if (hasFilter(query, "or", SPAM_OR)) return "spam";
  if (hasFilter(query, "neq", "status", "castigat")) return "order";
  if (query.payload === "id, lead_files!inner(id, path)") return "photos";
  if (hasFilter(query, "not", "ip_hash", "is", null)) return "ip";
  return undefined;
}

interface Scenario {
  spam?: { id: string }[];
  order?: { id: string }[];
  photos?: { id: string; lead_files: { id: string; path: string }[] }[];
  ip?: { id: string }[];
  /** `lead_files` rows per lead id, for the delete rules. */
  files?: Record<string, string[]>;
  /** Every `leads` select fails with this message. */
  selectError?: string;
}

const respond = (scenario: Scenario) => (query: FakeQuery): FakeResult | undefined => {
  const rule = ruleOf(query);
  if (rule) {
    if (scenario.selectError) return { error: { message: scenario.selectError } };
    return { data: scenario[rule] ?? [] };
  }
  if (query.table === "lead_files" && query.op === "select") {
    const ids = filterOf(query, "in")?.[2] as string[];
    return { data: ids.flatMap((id) => (scenario.files?.[id] ?? []).map((path) => ({ path }))) };
  }
  return undefined;
};

const byRule = (queries: FakeQuery[], rule: Rule) => queries.find((query) => ruleOf(query) === rule)!;
const mutations = (queries: FakeQuery[]) => queries.filter((query) => query.op !== "select");

describe("retention", () => {
  it("deletes spam and preview/development test requests older than 30 days, their photos first", async () => {
    const fake = fakeCronAdmin({
      respond: respond({ spam: [{ id: "s1" }, { id: "s2" }], files: { s1: ["s1/1.jpg", "s1/2.jpg"], s2: ["s2/1.jpg"] } }),
      objects: { "s1/1.jpg": AT, "s1/2.jpg": AT, "s2/1.jpg": AT, "keep/1.jpg": AT },
    });

    const report = await retention(fake.client, NOW);

    expect(report.ok).toBe(true);
    expect(report.counts.spamDeleted).toBe(2);
    expect(RETENTION.spamDays).toBe(30);

    const select = byRule(fake.queries, "spam");
    expect(select.payload).toBe("id");
    expect(select.filters).toEqual([
      ["or", SPAM_OR],
      ["lt", "created_at", SPAM_CUTOFF],
      ["order", "created_at", { ascending: true }],
      ["limit", RETENTION_BATCH],
    ]);
    expect(fake.removed).toEqual([["s1/1.jpg", "s1/2.jpg", "s2/1.jpg"]]);
    expect(Object.keys(fake.objects)).toEqual(["keep/1.jpg"]);
    expect(mutations(fake.queries)).toHaveLength(1);
    expect(mutations(fake.queries)[0]).toMatchObject({ table: "leads", op: "delete", filters: [["in", "id", ["s1", "s2"]]] });
  });

  it("deletes requests without an order after 24 months", async () => {
    const fake = fakeCronAdmin({ respond: respond({ order: [{ id: "e1" }] }) });

    const report = await retention(fake.client, NOW);

    expect(report.ok).toBe(true);
    expect(report.counts.expiredDeleted).toBe(1);
    expect(RETENTION.leadsWithoutOrderMonths).toBe(24);
    expect(byRule(fake.queries, "order").filters).toEqual([
      ["neq", "status", "castigat"],
      ["lt", "created_at", ORDER_CUTOFF],
      ["order", "created_at", { ascending: true }],
      ["limit", RETENTION_BATCH],
    ]);
    // No photos: nothing to remove, and no empty remove() call.
    expect(fake.removed).toEqual([]);
    expect(mutations(fake.queries)).toEqual([expect.objectContaining({ table: "leads", op: "delete", filters: [["in", "id", ["e1"]]] })]);
  });

  it("removes the photos of requests older than 12 months and their lead_files rows", async () => {
    const fake = fakeCronAdmin({
      respond: respond({
        photos: [
          { id: "p1", lead_files: [{ id: "f1", path: "p1/1.jpg" }, { id: "f2", path: "p1/2.jpg" }] },
          { id: "p2", lead_files: [{ id: "f3", path: "p2/1.jpg" }] },
        ],
      }),
      objects: { "p1/1.jpg": AT, "p1/2.jpg": AT, "p2/1.jpg": AT },
    });

    const report = await retention(fake.client, NOW);

    expect(report.ok).toBe(true);
    expect(report.counts.photosRemoved).toBe(3);
    expect(RETENTION.leadPhotosMonths).toBe(12);
    expect(byRule(fake.queries, "photos").filters).toEqual([
      ["lt", "created_at", PHOTOS_CUTOFF],
      ["order", "created_at", { ascending: true }],
      ["limit", RETENTION_BATCH],
    ]);
    expect(fake.removed).toEqual([["p1/1.jpg", "p1/2.jpg", "p2/1.jpg"]]);
    expect(fake.objects).toEqual({});
    expect(mutations(fake.queries)).toEqual([
      expect.objectContaining({ table: "lead_files", op: "delete", filters: [["in", "id", ["f1", "f2", "f3"]]] }),
    ]);
  });

  it("clears ip_hash on requests older than 6 months", async () => {
    const fake = fakeCronAdmin({ respond: respond({ ip: [{ id: "i1" }, { id: "i2" }] }) });

    const report = await retention(fake.client, NOW);

    expect(report.ok).toBe(true);
    expect(report.counts.ipHashCleared).toBe(2);
    expect(RETENTION.ipHashMonths).toBe(6);
    expect(byRule(fake.queries, "ip").filters).toEqual([
      ["lt", "created_at", IP_CUTOFF],
      ["not", "ip_hash", "is", null],
      ["order", "created_at", { ascending: true }],
      ["limit", RETENTION_BATCH],
    ]);
    expect(mutations(fake.queries)).toEqual([
      expect.objectContaining({ table: "leads", op: "update", payload: { ip_hash: null }, filters: [["in", "id", ["i1", "i2"]]] }),
    ]);
  });

  it("touches nothing when every rule finds no rows", async () => {
    const fake = fakeCronAdmin({ respond: respond({}) });
    const report = await retention(fake.client, NOW);
    expect(report).toEqual({
      job: "retention",
      ok: true,
      counts: { spamDeleted: 0, expiredDeleted: 0, photosRemoved: 0, ipHashCleared: 0 },
      errors: [],
    });
    expect(fake.queries.map((query) => query.op)).toEqual(["select", "select", "select", "select"]);
    expect(fake.removed).toEqual([]);
  });

  it("keeps the leads whose photos could not be removed, and still runs the other rules", async () => {
    const fake = fakeCronAdmin({
      respond: respond({ spam: [{ id: "s1" }], files: { s1: ["s1/1.jpg"] }, ip: [{ id: "i1" }] }),
      objects: { "s1/1.jpg": AT },
      removeError: "storage down",
    });

    const report = await retention(fake.client, NOW);

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(["spamDeleted: remove 1 objects: storage down"]);
    expect(report.counts).toEqual({ spamDeleted: 0, expiredDeleted: 0, photosRemoved: 0, ipHashCleared: 1 });
    expect(mutations(fake.queries).map((query) => [query.table, query.op])).toEqual([["leads", "update"]]);
    expect(fake.objects).toEqual({ "s1/1.jpg": AT });
  });

  it("reports one error per failed rule and never throws", async () => {
    const fake = fakeCronAdmin({ respond: respond({ selectError: "db down" }) });
    const report = await retention(fake.client, NOW);
    expect(report.ok).toBe(false);
    expect(report.errors).toEqual([
      "spamDeleted: leads: db down",
      "expiredDeleted: leads: db down",
      "photosRemoved: leads/lead_files: db down",
      "ipHashCleared: leads: db down",
    ]);
    expect(report.counts).toEqual({ spamDeleted: 0, expiredDeleted: 0, photosRemoved: 0, ipHashCleared: 0 });
    expect(mutations(fake.queries)).toEqual([]);
  });
});
