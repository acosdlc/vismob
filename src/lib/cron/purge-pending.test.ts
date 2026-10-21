// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fakeCronAdmin, type FakeQuery } from "./admin.fake";
import { purgePending } from "./purge-pending";
import { PENDING_MAX_AGE_HOURS } from "./shared";

const NOW = new Date("2026-10-21T03:20:00.000Z");
const CUTOFF = "2026-10-20T03:20:00.000Z";
const OLD = "2026-10-19T10:00:00.000Z";
const FRESH = "2026-10-20T20:00:00.000Z";
const LEAD_ID = "11111111-2222-4333-8444-555555555555";

/** `upload_requests` deletes report `count` rows; every other query gets the default empty answer. */
const uploadRequests = (count: number, error?: string) => (query: FakeQuery) =>
  query.table === "upload_requests" && query.op === "delete" ? (error ? { error: { message: error } } : { count }) : undefined;

describe("purgePending", () => {
  it("removes pending files older than 24 hours, keeps the fresh ones and the leads' files, and clears old upload_requests", async () => {
    const fake = fakeCronAdmin({
      respond: uploadRequests(4),
      objects: {
        "pending/aaa/1.jpg": OLD,
        "pending/aaa/2.jpg": OLD,
        "pending/bbb/1.jpg": FRESH,
        "pending/ccc/1.jpg": OLD,
        "pending/ccc/2.jpg": FRESH,
        "pending/stray.jpg": OLD,
        [`${LEAD_ID}/1.jpg`]: OLD,
      },
    });

    const report = await purgePending(fake.client, NOW);

    expect(PENDING_MAX_AGE_HOURS).toBe(24);
    expect(report).toEqual({
      job: "purge-pending",
      ok: true,
      counts: { foldersScanned: 3, filesRemoved: 4, uploadRequestsDeleted: 4 },
      errors: [],
    });
    expect(fake.removed).toEqual([["pending/aaa/1.jpg", "pending/aaa/2.jpg", "pending/ccc/1.jpg", "pending/stray.jpg"]]);
    expect(Object.keys(fake.objects).sort()).toEqual([`${LEAD_ID}/1.jpg`, "pending/bbb/1.jpg", "pending/ccc/2.jpg"]);

    // The root listing pages by 1000; each folder is listed once.
    expect(fake.lists[0]).toEqual({
      prefix: "pending",
      options: { limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } },
    });
    expect(fake.lists.slice(1).map((call) => call.prefix)).toEqual(["pending/aaa", "pending/bbb", "pending/ccc"]);

    expect(fake.queries).toHaveLength(1);
    expect(fake.queries[0]).toMatchObject({
      table: "upload_requests",
      op: "delete",
      options: { count: "exact" },
      filters: [["lt", "created_at", CUTOFF]],
    });
  });

  it("does nothing when pending/ is empty", async () => {
    const fake = fakeCronAdmin({ respond: uploadRequests(0), objects: { [`${LEAD_ID}/1.jpg`]: OLD } });
    const report = await purgePending(fake.client, NOW);
    expect(report.ok).toBe(true);
    expect(report.counts).toEqual({ foldersScanned: 0, filesRemoved: 0, uploadRequestsDeleted: 0 });
    expect(fake.removed).toEqual([]);
    expect(fake.lists).toHaveLength(1);
  });

  it("never removes an entry it cannot date", async () => {
    const fake = fakeCronAdmin({ respond: uploadRequests(0), objects: { "pending/ddd/1.jpg": "", "pending/eee/1.jpg": "not a date" } });
    const report = await purgePending(fake.client, NOW);
    expect(report.ok).toBe(true);
    expect(report.counts.foldersScanned).toBe(2);
    expect(report.counts.filesRemoved).toBe(0);
    expect(fake.removed).toEqual([]);
  });

  it("pages through more than 1000 folders and removes in batches of 100", async () => {
    const objects: Record<string, string> = {};
    for (let i = 0; i < 1001; i += 1) objects[`pending/f${String(i).padStart(4, "0")}/1.jpg`] = OLD;
    const fake = fakeCronAdmin({ respond: uploadRequests(0), objects });

    const report = await purgePending(fake.client, NOW);

    expect(report.ok).toBe(true);
    expect(report.counts).toEqual({ foldersScanned: 1001, filesRemoved: 1001, uploadRequestsDeleted: 0 });
    const rootCalls = fake.lists.filter((call) => call.prefix === "pending");
    expect(rootCalls.map((call) => call.options?.offset)).toEqual([0, 1000]);
    expect(fake.removed).toHaveLength(11);
    expect(fake.removed.map((batch) => batch.length)).toEqual([...Array<number>(10).fill(100), 1]);
    expect(Object.keys(fake.objects)).toEqual([]);
  });

  it("reports a listing failure and still clears upload_requests", async () => {
    const fake = fakeCronAdmin({ respond: uploadRequests(2), listError: "storage unavailable", objects: { "pending/aaa/1.jpg": OLD } });

    const report = await purgePending(fake.client, NOW);

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(["list pending/: storage unavailable"]);
    expect(report.counts).toEqual({ foldersScanned: 0, filesRemoved: 0, uploadRequestsDeleted: 2 });
    expect(fake.removed).toEqual([]);
    expect(fake.queries).toHaveLength(1);
  });

  it("reports a failed remove and a failed delete, without throwing", async () => {
    const fake = fakeCronAdmin({
      respond: uploadRequests(0, "db down"),
      removeError: "storage down",
      objects: { "pending/aaa/1.jpg": OLD },
    });

    const report = await purgePending(fake.client, NOW);

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(["remove 1 objects: storage down", "upload_requests: db down"]);
    expect(report.counts).toEqual({ foldersScanned: 1, filesRemoved: 0, uploadRequestsDeleted: 0 });
    expect(fake.objects).toEqual({ "pending/aaa/1.jpg": OLD });
  });
});
