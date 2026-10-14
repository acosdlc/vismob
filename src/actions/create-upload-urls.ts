"use server";

import { headers } from "next/headers";
import { FORM_MESSAGES, UPLOAD_LIMITS, type UploadUrlsResult } from "@/lib/leads/types";
import { clientIp, ipHash } from "@/lib/security/ip";
import { recentUploadRequestCount } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Signed upload URLs for the photo field (ARHITECTURA §6.1 step 2): one call
 * per selection, `count` paths under `pending/<uuid>/`, at most 6 per call and
 * 20 per IP per hour. The browser uploads straight to Storage with each token.
 */
export async function createUploadUrls(count: number): Promise<UploadUrlsResult> {
  try {
    if (!Number.isInteger(count) || count < 1 || count > UPLOAD_LIMITS.maxFiles) {
      return { ok: false, message: FORM_MESSAGES.uploads };
    }

    const hash = ipHash(clientIp(await headers()));
    const admin = createAdminClient();

    const recent = await recentUploadRequestCount(admin, hash);
    if (recent + count > UPLOAD_LIMITS.maxUrlsPerIpPerHour) {
      return { ok: false, message: FORM_MESSAGES.rateLimited };
    }

    const { error: insertError } = await admin
      .from("upload_requests")
      .insert(Array.from({ length: count }, () => ({ ip_hash: hash })));
    if (insertError) throw new Error(`upload_requests insert failed: ${insertError.message}`);

    const folder = `${UPLOAD_LIMITS.pendingPrefix}${crypto.randomUUID()}`;
    const bucket = admin.storage.from(UPLOAD_LIMITS.bucket);
    const uploads = await Promise.all(
      Array.from({ length: count }, async (_, index) => {
        const path = `${folder}/${index + 1}.jpg`;
        const { data, error } = await bucket.createSignedUploadUrl(path);
        if (error || !data) throw new Error(`createSignedUploadUrl(${path}): ${error?.message ?? "no data"}`);
        return { path, token: data.token };
      }),
    );

    return { ok: true, uploads };
  } catch (error) {
    console.error("createUploadUrls", error);
    return { ok: false, message: FORM_MESSAGES.generic };
  }
}
