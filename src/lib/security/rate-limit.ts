import type { AdminClient } from "@/lib/supabase/admin";

// Per-IP limits (ARHITECTURA §6.1): leads per hour and upload URLs per hour,
// both counted on `ip_hash`. A database error is thrown so the caller fails
// closed with its generic message instead of letting the request through.

function since(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

/** Leads stored for this `ip_hash` in the last `hours`. */
export async function recentLeadCount(admin: AdminClient, ipHash: string, hours = 1): Promise<number> {
  const { count, error } = await admin
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gt("created_at", since(hours));
  if (error) throw new Error(`recentLeadCount: ${error.message}`);
  return count ?? 0;
}

/** Signed upload URLs issued to this `ip_hash` in the last `hours`. */
export async function recentUploadRequestCount(admin: AdminClient, ipHash: string, hours = 1): Promise<number> {
  const { count, error } = await admin
    .from("upload_requests")
    .select("*", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gt("created_at", since(hours));
  if (error) throw new Error(`recentUploadRequestCount: ${error.message}`);
  return count ?? 0;
}
