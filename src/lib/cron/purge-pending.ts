import "server-only";
import { UPLOAD_LIMITS } from "@/lib/leads/types";
import type { AdminClient } from "@/lib/supabase/admin";
import { chunk, errorMessage, finishReport, hoursBefore, newReport, PENDING_MAX_AGE_HOURS, type JobReport } from "./shared";

// Daily (ARHITECTURA §9): photos uploaded to `lead-uploads/pending/<uuid>/<n>.<ext>`
// belong to a form that was never submitted once they are a day old; the
// submitted ones were moved to `<leadId>/` (ARHITECTURA §6.1 step 3.6). The same
// cut-off clears `upload_requests`, which only serves the one-hour upload limit.

/** Storage lists at most this many entries per call. */
const LIST_PAGE = 1000;
/** Paths per `remove()` call. */
const REMOVE_BATCH = 100;

/** Dated before the cut-off; an entry without a date (a folder) is never stale. */
function isStale(entry: { created_at: string | null }, cutoff: Date): boolean {
  if (!entry.created_at) return false;
  const created = new Date(entry.created_at).getTime();
  return !Number.isNaN(created) && created < cutoff.getTime();
}

export async function purgePending(admin: AdminClient, now: Date = new Date()): Promise<JobReport> {
  const report = newReport("purge-pending", ["foldersScanned", "filesRemoved", "uploadRequestsDeleted"]);
  const cutoff = hoursBefore(now, PENDING_MAX_AGE_HOURS);
  const bucket = admin.storage.from(UPLOAD_LIMITS.bucket);
  const root = UPLOAD_LIMITS.pendingPrefix.replace(/\/+$/, "");

  try {
    const stale: string[] = [];
    for (let offset = 0; ; offset += LIST_PAGE) {
      const { data: entries, error } = await bucket.list(root, {
        limit: LIST_PAGE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`list ${root}/: ${error.message}`);
      for (const entry of entries) {
        if (entry.id === null) {
          // A folder: one form's uploads.
          report.counts.foldersScanned += 1;
          const folder = `${root}/${entry.name}`;
          const { data: files, error: filesError } = await bucket.list(folder, { limit: LIST_PAGE });
          if (filesError) {
            report.errors.push(`list ${folder}/: ${filesError.message}`);
            continue;
          }
          for (const file of files) if (isStale(file, cutoff)) stale.push(`${folder}/${file.name}`);
        } else if (isStale(entry, cutoff)) {
          // A file straight under pending/: not how uploads are written, but just as stale.
          stale.push(`${root}/${entry.name}`);
        }
      }
      if (entries.length < LIST_PAGE) break;
    }
    for (const paths of chunk(stale, REMOVE_BATCH)) {
      const { error } = await bucket.remove(paths);
      if (error) {
        report.errors.push(`remove ${paths.length} objects: ${error.message}`);
        continue;
      }
      report.counts.filesRemoved += paths.length;
    }
  } catch (cause) {
    report.errors.push(errorMessage(cause));
  }

  try {
    const { error, count } = await admin
      .from("upload_requests")
      .delete({ count: "exact" })
      .lt("created_at", cutoff.toISOString());
    if (error) report.errors.push(`upload_requests: ${error.message}`);
    else report.counts.uploadRequestsDeleted = count ?? 0;
  } catch (cause) {
    report.errors.push(`upload_requests: ${errorMessage(cause)}`);
  }

  return finishReport(report);
}
