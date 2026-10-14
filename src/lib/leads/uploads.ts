import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import { UPLOAD_LIMITS } from "./types";

// After a lead is stored, its photos move from `pending/<uuid>/<n>.<ext>` to
// `<leadId>/<n>.<ext>` and get a `lead_files` row (ARHITECTURA §6.1 step 3.6).
// Nothing here is fatal: a path that is wrong, missing or fails to move is
// logged and skipped, and the lead stays stored.

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function extensionOf(path: string): string | undefined {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return undefined;
  const ext = path.slice(dot + 1).toLowerCase();
  return ext in MIME_BY_EXTENSION ? ext : undefined;
}

type Bucket = ReturnType<AdminClient["storage"]["from"]>;

/** The object's listing entry when it exists under its folder, else undefined. */
async function findObject(bucket: Bucket, path: string) {
  const slash = path.lastIndexOf("/");
  const folder = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data, error } = await bucket.list(folder, { search: name, limit: 100 });
  if (error) throw new Error(`storage.list(${folder}): ${error.message}`);
  return data.find((object) => object.name === name);
}

/**
 * Moves each verified pending upload under the lead and records it in
 * `lead_files`. Returns the number of files attached.
 */
export async function attachUploads(
  admin: AdminClient,
  leadId: string,
  pendingPaths: readonly string[],
): Promise<number> {
  const bucket = admin.storage.from(UPLOAD_LIMITS.bucket);
  let attached = 0;

  for (const [index, path] of pendingPaths.slice(0, UPLOAD_LIMITS.maxFiles).entries()) {
    const n = index + 1;
    const ext = extensionOf(path);
    if (!path.startsWith(UPLOAD_LIMITS.pendingPrefix) || path.includes("..") || !ext) {
      console.warn(`attachUploads(${leadId}): refused path ${JSON.stringify(path)}`);
      continue;
    }

    try {
      const object = await findObject(bucket, path);
      if (!object) {
        console.warn(`attachUploads(${leadId}): ${path} does not exist`);
        continue;
      }

      const destination = `${leadId}/${n}.${ext}`;
      const { error: moveError } = await bucket.move(path, destination);
      if (moveError) {
        console.error(`attachUploads(${leadId}): move ${path} failed: ${moveError.message}`);
        continue;
      }

      const sizeBytes = typeof object.metadata?.size === "number" ? object.metadata.size : 0;
      const { error: insertError } = await admin.from("lead_files").insert({
        lead_id: leadId,
        path: destination,
        mime: MIME_BY_EXTENSION[ext],
        size_bytes: sizeBytes,
      });
      if (insertError) {
        console.error(`attachUploads(${leadId}): lead_files insert for ${destination} failed: ${insertError.message}`);
        continue;
      }
      attached += 1;
    } catch (error) {
      console.error(`attachUploads(${leadId}): ${path}`, error);
    }
  }

  return attached;
}
