import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import { purgePending } from "./purge-pending";
import { retention } from "./retention";
import { retryNotifications } from "./retry-notifications";
import { errorMessage, type CronJob, type JobReport } from "./shared";

// The three cron jobs (ARHITECTURA §11, PLAN PR-10), run by `GET /api/cron/[job]`
// on the schedules in vercel.json. Each job takes the admin client and `now`,
// collects its errors into the report and never throws.

export {
  CRON_JOBS,
  isCronJob,
  MAX_NOTIFICATION_ATTEMPTS,
  PENDING_MAX_AGE_HOURS,
  RETENTION,
  type CronJob,
  type JobReport,
} from "./shared";

export async function runJob(job: CronJob, admin: AdminClient, now: Date = new Date()): Promise<JobReport> {
  try {
    switch (job) {
      case "retry-notifications":
        return await retryNotifications(admin, now);
      case "purge-pending":
        return await purgePending(admin, now);
      case "retention":
        return await retention(admin, now);
    }
  } catch (cause) {
    // The jobs catch their own errors; this is the last net under a bug in one of them.
    console.error(`[cron] ${job} threw:`, cause);
    return { job, ok: false, counts: {}, errors: [errorMessage(cause)] };
  }
}
