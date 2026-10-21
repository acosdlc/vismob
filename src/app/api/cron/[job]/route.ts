import { authorizeCron } from "@/lib/cron/auth";
import { isCronJob, runJob } from "@/lib/cron/jobs";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";

// Vercel Cron (docs/PLAN.md PR-10, ARHITECTURA §11): `vercel.json` calls
// /api/cron/retry-notifications, /api/cron/purge-pending and /api/cron/retention
// with `Authorization: Bearer CRON_SECRET`. Node runtime (resvg, Resend), one
// minute at most. The report is the body; 200 only when the job had no error, so
// a failing run shows up as a failed cron invocation on Vercel.

export const maxDuration = 60;

export async function GET(request: Request, ctx: RouteContext<"/api/cron/[job]">) {
  const auth = authorizeCron(request);
  if (!auth.ok) {
    return Response.json({ error: auth.status === 503 ? "unavailable" : "unauthorized" }, { status: auth.status });
  }

  const { job } = await ctx.params;
  if (!isCronJob(job)) return Response.json({ error: "unknown job" }, { status: 404 });

  let admin: AdminClient;
  try {
    admin = createAdminClient();
  } catch (cause) {
    console.error(`GET /api/cron/${job}: no admin client:`, cause);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }

  const report = await runJob(job, admin);
  if (!report.ok) console.error(`GET /api/cron/${job} failed: ${report.errors.join("; ")}`);
  return Response.json(report, { status: report.ok ? 200 : 500 });
}
