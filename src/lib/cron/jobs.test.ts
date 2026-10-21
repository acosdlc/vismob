// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/supabase/admin";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ retry: vi.fn(), purge: vi.fn(), retention: vi.fn() }));
vi.mock("./retry-notifications", () => ({ retryNotifications: mocks.retry }));
vi.mock("./purge-pending", () => ({ purgePending: mocks.purge }));
vi.mock("./retention", () => ({ retention: mocks.retention }));

import { CRON_JOBS, isCronJob, MAX_NOTIFICATION_ATTEMPTS, PENDING_MAX_AGE_HOURS, RETENTION, runJob } from "./jobs";

const admin = { tag: "admin" } as unknown as AdminClient;
const NOW = new Date("2026-10-21T04:40:00.000Z");

beforeEach(() => {
  mocks.retry.mockReset();
  mocks.purge.mockReset();
  mocks.retention.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the cron constants", () => {
  it("are what PLAN PR-10 and ARHITECTURA §9 say", () => {
    expect(CRON_JOBS).toEqual(["retry-notifications", "purge-pending", "retention"]);
    expect(MAX_NOTIFICATION_ATTEMPTS).toBe(3);
    expect(PENDING_MAX_AGE_HOURS).toBe(24);
    expect(RETENTION).toEqual({ leadsWithoutOrderMonths: 24, leadPhotosMonths: 12, ipHashMonths: 6, spamDays: 30 });
  });

  it("recognise the three job names and nothing else", () => {
    for (const job of CRON_JOBS) expect(isCronJob(job)).toBe(true);
    for (const other of ["", "nope", "Retention", "retry-notifications/", "constructor", "__proto__"]) {
      expect(isCronJob(other)).toBe(false);
    }
  });
});

describe("runJob", () => {
  it("runs the module of each job with the admin client and the clock", async () => {
    const reports = {
      "retry-notifications": { job: "retry-notifications", ok: true, counts: { retried: 1 }, errors: [] },
      "purge-pending": { job: "purge-pending", ok: true, counts: { filesRemoved: 2 }, errors: [] },
      retention: { job: "retention", ok: false, counts: {}, errors: ["spamDeleted: db down"] },
    } as const;
    mocks.retry.mockResolvedValue(reports["retry-notifications"]);
    mocks.purge.mockResolvedValue(reports["purge-pending"]);
    mocks.retention.mockResolvedValue(reports.retention);

    for (const job of CRON_JOBS) {
      expect(await runJob(job, admin, NOW)).toEqual(reports[job]);
    }
    expect(mocks.retry).toHaveBeenCalledWith(admin, NOW);
    expect(mocks.purge).toHaveBeenCalledWith(admin, NOW);
    expect(mocks.retention).toHaveBeenCalledWith(admin, NOW);
  });

  it("defaults the clock to now", async () => {
    mocks.purge.mockResolvedValue({ job: "purge-pending", ok: true, counts: {}, errors: [] });
    const before = Date.now();
    await runJob("purge-pending", admin);
    const now = mocks.purge.mock.calls[0][1] as Date;
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("turns a job that throws into a failed report instead of throwing", async () => {
    mocks.retention.mockRejectedValue(new Error("unexpected"));
    await expect(runJob("retention", admin, NOW)).resolves.toEqual({
      job: "retention",
      ok: false,
      counts: {},
      errors: ["unexpected"],
    });
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
