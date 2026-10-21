// What the three cron jobs and the route share (docs/ARHITECTURA.md §6.1 step 4,
// §9 „Retenția”, §11 „Cron”; docs/PLAN.md PR-10). Pure: constants, the report
// shape and the date arithmetic. `jobs.ts` re-exports the public names, so the
// job modules import from here without a cycle through `jobs.ts`.

export const CRON_JOBS = ["retry-notifications", "purge-pending", "retention"] as const;
export type CronJob = (typeof CRON_JOBS)[number];

export function isCronJob(value: string): value is CronJob {
  return (CRON_JOBS as readonly string[]).includes(value);
}

/** What `GET /api/cron/[job]` answers: 200 when `ok`, 500 otherwise, the body in both cases. */
export interface JobReport {
  job: CronJob;
  ok: boolean;
  counts: Record<string, number>;
  errors: string[];
}

/** Failed sends per (lead, email type) before the owner is alerted and the pair is left alone. */
export const MAX_NOTIFICATION_ATTEMPTS = 3;
/** Only failures this recent are retried. */
export const RETRY_WINDOW_DAYS = 7;
/** Pairs retried per run (the job runs every 15 minutes and has 60 s). */
export const RETRY_MAX_PAIRS = 50;

/** `pending/` uploads older than this never got a lead (ARHITECTURA §9). */
export const PENDING_MAX_AGE_HOURS = 24;

/** ARHITECTURA §9 as written, plus the 6-month `ip_hash` anonymisation (PLAN PR-10). */
export const RETENTION = {
  leadsWithoutOrderMonths: 24,
  leadPhotosMonths: 12,
  ipHashMonths: 6,
  spamDays: 30,
} as const;
/** Leads per retention rule per run; the weekly run catches up. */
export const RETENTION_BATCH = 200;
/** `source->>environment` values of test requests: purged with the spam (ARHITECTURA-NOTE). */
export const TEST_ENVIRONMENTS = ["preview", "development", "local"] as const;

export function newReport(job: CronJob, counters: readonly string[]): JobReport {
  return { job, ok: true, counts: Object.fromEntries(counters.map((name) => [name, 0])), errors: [] };
}

/** `ok` follows the errors; the report never carries `ok: true` next to an error. */
export function finishReport(report: JobReport): JobReport {
  report.ok = report.errors.length === 0;
  return report;
}

export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function hoursBefore(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

export function daysBefore(now: Date, days: number): Date {
  return hoursBefore(now, days * 24);
}

/** Calendar months back, in UTC (a month-end that does not exist in the target month runs over by a few days). */
export function monthsBefore(now: Date, months: number): Date {
  const date = new Date(now.getTime());
  date.setUTCMonth(date.getUTCMonth() - months);
  return date;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
