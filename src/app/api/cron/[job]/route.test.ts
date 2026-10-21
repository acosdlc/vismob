// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobReport } from "@/lib/cron/shared";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ runJob: vi.fn(), createAdminClient: vi.fn() }));
// The real jobs pull in the mailer and the database; the route only routes to them.
vi.mock("@/lib/cron/jobs", async () => {
  const shared = await import("@/lib/cron/shared");
  return { CRON_JOBS: shared.CRON_JOBS, isCronJob: shared.isCronJob, runJob: mocks.runJob };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { CRON_JOBS } from "@/lib/cron/shared";
import { GET, maxDuration } from "./route";

const SECRET = "a-random-cron-secret-of-32-bytes";
const ADMIN = { tag: "admin" };

function get(job: string, headers: Record<string, string> = {}) {
  const request = new Request(`https://www.vismob.dev/api/cron/${job}`, { headers });
  return GET(request, { params: Promise.resolve({ job }) });
}
const authed = (job: string) => get(job, { authorization: `Bearer ${SECRET}` });

const OK_REPORT: JobReport = { job: "retention", ok: true, counts: { spamDeleted: 2 }, errors: [] };

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  mocks.runJob.mockReset();
  mocks.runJob.mockResolvedValue(OK_REPORT);
  mocks.createAdminClient.mockReset();
  mocks.createAdminClient.mockReturnValue(ADMIN);
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/cron/[job]", () => {
  it("gives the function a minute", () => {
    expect(maxDuration).toBe(60);
  });

  it("answers 503 with a generic body and runs nothing without CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await authed("retention");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(mocks.runJob).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it("answers 401 without the header or with a wrong one, before looking at the job", async () => {
    const headerSets: Record<string, string>[] = [{}, { authorization: "Bearer nope" }, { authorization: SECRET }];
    for (const headers of headerSets) {
      for (const job of ["retention", "nope"]) {
        const response = await get(job, headers);
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "unauthorized" });
      }
    }
    expect(mocks.runJob).not.toHaveBeenCalled();
  });

  it("answers 404 for a job that does not exist", async () => {
    for (const job of ["nope", "Retention", "constructor"]) {
      const response = await authed(job);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "unknown job" });
    }
    expect(mocks.runJob).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("answers 503 when the admin client cannot be created (no Supabase variables)", async () => {
    mocks.createAdminClient.mockImplementation(() => {
      throw new Error("Missing environment variable SUPABASE_SECRET_KEY");
    });
    const response = await authed("retention");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(mocks.runJob).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it("runs every known job with the admin client and answers 200 with its report", async () => {
    for (const job of CRON_JOBS) {
      mocks.runJob.mockClear();
      const report: JobReport = { job, ok: true, counts: { done: 1 }, errors: [] };
      mocks.runJob.mockResolvedValueOnce(report);
      const response = await authed(job);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(report);
      expect(mocks.runJob).toHaveBeenCalledTimes(1);
      expect(mocks.runJob).toHaveBeenCalledWith(job, ADMIN);
    }
    expect(errors).not.toHaveBeenCalled();
  });

  it("answers 500 with the report, and logs, when the job had errors", async () => {
    const report: JobReport = { job: "purge-pending", ok: false, counts: { filesRemoved: 0 }, errors: ["list pending/: boom"] };
    mocks.runJob.mockResolvedValueOnce(report);
    const response = await authed("purge-pending");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(report);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0][0])).toContain("list pending/: boom");
  });
});
