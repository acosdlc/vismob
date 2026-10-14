// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fakeAdmin } from "@/lib/leads/admin.fake";
import { recentLeadCount, recentUploadRequestCount } from "./rate-limit";

const HASH = "a".repeat(64);

describe("recentLeadCount", () => {
  it("counts leads for the ip_hash created in the last hour", async () => {
    const fake = fakeAdmin({ counts: { leads: 3 } });
    const before = Date.now();
    expect(await recentLeadCount(fake.client, HASH)).toBe(3);

    const [query] = fake.countQueries;
    expect(query.table).toBe("leads");
    expect(query.options).toEqual({ count: "exact", head: true });
    expect(query.filters[0]).toEqual(["eq", "ip_hash", HASH]);
    const [op, column, since] = query.filters[1];
    expect([op, column]).toEqual(["gt", "created_at"]);
    const sinceMs = new Date(since as string).getTime();
    expect(before - sinceMs).toBeGreaterThanOrEqual(60 * 60 * 1000 - 50);
    expect(before - sinceMs).toBeLessThan(60 * 60 * 1000 + 5_000);
  });

  it("takes a window in hours and treats a null count as 0", async () => {
    const fake = fakeAdmin();
    expect(await recentLeadCount(fake.client, HASH, 24)).toBe(0);
    const since = new Date(fake.countQueries[0].filters[1][2] as string).getTime();
    expect(Date.now() - since).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 50);
  });

  it("throws on a database error", async () => {
    const fake = fakeAdmin({ countErrors: { leads: "boom" } });
    await expect(recentLeadCount(fake.client, HASH)).rejects.toThrow(/boom/);
  });
});

describe("recentUploadRequestCount", () => {
  it("counts upload_requests the same way", async () => {
    const fake = fakeAdmin({ counts: { upload_requests: 7 } });
    expect(await recentUploadRequestCount(fake.client, HASH)).toBe(7);
    expect(fake.countQueries[0].table).toBe("upload_requests");
    expect(fake.countQueries[0].filters[0]).toEqual(["eq", "ip_hash", HASH]);
  });

  it("throws on a database error", async () => {
    const fake = fakeAdmin({ countErrors: { upload_requests: "boom" } });
    await expect(recentUploadRequestCount(fake.client, HASH)).rejects.toThrow(/boom/);
  });
});
