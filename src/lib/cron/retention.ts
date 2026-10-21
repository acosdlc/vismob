import "server-only";
import { UPLOAD_LIMITS } from "@/lib/leads/types";
import type { AdminClient } from "@/lib/supabase/admin";
import {
  chunk,
  daysBefore,
  errorMessage,
  finishReport,
  monthsBefore,
  newReport,
  RETENTION,
  RETENTION_BATCH,
  TEST_ENVIRONMENTS,
  type JobReport,
} from "./shared";

// Weekly (ARHITECTURA §9 „Retenția”, PLAN PR-10): requests without an order go
// after 24 months, request photos after 12 months, spam and the test requests
// made on previews after 30 days, and `ip_hash` is cleared after 6 months since
// it only serves the one-hour rate limit. Each rule takes at most RETENTION_BATCH
// leads per run and runs even when another rule failed.

type Bucket = ReturnType<AdminClient["storage"]["from"]>;

/** Paths per `remove()` call. */
const REMOVE_BATCH = 100;

/** Removes the objects; throws on the first failed batch so the rows that point to them stay. */
async function removeObjects(bucket: Bucket, paths: string[]): Promise<void> {
  for (const batch of chunk(paths, REMOVE_BATCH)) {
    const { error } = await bucket.remove(batch);
    if (error) throw new Error(`remove ${batch.length} objects: ${error.message}`);
  }
}

/** Their photos out of storage first, then the leads (`lead_files` and `lead_events` cascade). */
async function deleteLeads(admin: AdminClient, bucket: Bucket, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { data: files, error: filesError } = await admin.from("lead_files").select("path").in("lead_id", ids);
  if (filesError) throw new Error(`lead_files: ${filesError.message}`);
  await removeObjects(bucket, files.map((file) => file.path));
  const { error } = await admin.from("leads").delete().in("id", ids);
  if (error) throw new Error(`leads: ${error.message}`);
  return ids.length;
}

/** (a) Spam and test requests (preview, development, local) older than 30 days. */
async function purgeSpam(admin: AdminClient, bucket: Bucket, now: Date): Promise<number> {
  const { data, error } = await admin
    .from("leads")
    .select("id")
    .or(`status.eq.spam,source->>environment.in.(${TEST_ENVIRONMENTS.join(",")})`)
    .lt("created_at", daysBefore(now, RETENTION.spamDays).toISOString())
    .order("created_at", { ascending: true })
    .limit(RETENTION_BATCH);
  if (error) throw new Error(`leads: ${error.message}`);
  return deleteLeads(admin, bucket, data.map((lead) => lead.id));
}

/** (b) Requests that never became an order, older than 24 months. */
async function purgeWithoutOrder(admin: AdminClient, bucket: Bucket, now: Date): Promise<number> {
  const { data, error } = await admin
    .from("leads")
    .select("id")
    .neq("status", "castigat")
    .lt("created_at", monthsBefore(now, RETENTION.leadsWithoutOrderMonths).toISOString())
    .order("created_at", { ascending: true })
    .limit(RETENTION_BATCH);
  if (error) throw new Error(`leads: ${error.message}`);
  return deleteLeads(admin, bucket, data.map((lead) => lead.id));
}

/** (c) The photos of requests older than 12 months: the objects, then their `lead_files` rows. */
async function purgePhotos(admin: AdminClient, bucket: Bucket, now: Date): Promise<number> {
  // The inner join keeps only leads that still have files, so the batch always advances.
  const { data, error } = await admin
    .from("leads")
    .select("id, lead_files!inner(id, path)")
    .lt("created_at", monthsBefore(now, RETENTION.leadPhotosMonths).toISOString())
    .order("created_at", { ascending: true })
    .limit(RETENTION_BATCH);
  if (error) throw new Error(`leads/lead_files: ${error.message}`);
  const files = data.flatMap((lead) => lead.lead_files);
  if (files.length === 0) return 0;
  await removeObjects(bucket, files.map((file) => file.path));
  const { error: deleteError } = await admin
    .from("lead_files")
    .delete()
    .in("id", files.map((file) => file.id));
  if (deleteError) throw new Error(`lead_files: ${deleteError.message}`);
  return files.length;
}

/** (d) `ip_hash` only serves the one-hour rate limit: cleared after 6 months. */
async function clearIpHashes(admin: AdminClient, now: Date): Promise<number> {
  const { data, error } = await admin
    .from("leads")
    .select("id")
    .lt("created_at", monthsBefore(now, RETENTION.ipHashMonths).toISOString())
    .not("ip_hash", "is", null)
    .order("created_at", { ascending: true })
    .limit(RETENTION_BATCH);
  if (error) throw new Error(`leads: ${error.message}`);
  if (data.length === 0) return 0;
  const ids = data.map((lead) => lead.id);
  const { error: updateError } = await admin.from("leads").update({ ip_hash: null }).in("id", ids);
  if (updateError) throw new Error(`leads update: ${updateError.message}`);
  return ids.length;
}

export async function retention(admin: AdminClient, now: Date = new Date()): Promise<JobReport> {
  const report = newReport("retention", ["spamDeleted", "expiredDeleted", "photosRemoved", "ipHashCleared"]);
  const bucket = admin.storage.from(UPLOAD_LIMITS.bucket);

  const rules: [counter: string, run: () => Promise<number>][] = [
    ["spamDeleted", () => purgeSpam(admin, bucket, now)],
    ["expiredDeleted", () => purgeWithoutOrder(admin, bucket, now)],
    ["photosRemoved", () => purgePhotos(admin, bucket, now)],
    ["ipHashCleared", () => clearIpHashes(admin, now)],
  ];
  for (const [counter, run] of rules) {
    try {
      report.counts[counter] = await run();
    } catch (cause) {
      report.errors.push(`${counter}: ${errorMessage(cause)}`);
    }
  }
  return finishReport(report);
}
