import { createHash, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { optionalEnv } from "@/lib/env";

// Content revalidation (ARHITECTURA §6.5, docs/PLAN.md PR-5). A Supabase Database
// Webhook on each content table POSTs its payload here with the shared secret in
// the `x-revalidate-secret` header; the table's cache tag is expired at once.
// Only POST is exported: Next answers every other method with 405.

export type CacheTagName = "catalog" | "pricing" | "projects" | "reviews" | "settings";

/** Content table → the tag its cached reader carries (src/lib/data). */
export const TABLE_TAGS: Readonly<Record<string, CacheTagName>> = {
  models: "catalog",
  material_families: "catalog",
  materials: "catalog",
  model_families: "catalog",
  bases: "catalog",
  pricing: "pricing",
  projects: "projects",
  project_photos: "projects",
  reviews: "reviews",
  settings: "settings",
};

// The Supabase Database Webhook payload; unknown keys pass, only `table` matters.
const payloadSchema = z.looseObject({
  type: z.enum(["INSERT", "UPDATE", "DELETE"]).optional(),
  table: z.string().min(1),
  schema: z.string().optional(),
  record: z.unknown().optional(),
  old_record: z.unknown().optional(),
});

// Compared as sha256 digests: equal lengths, so timingSafeEqual leaks neither
// the length nor the position of the first differing byte.
function sameSecret(given: string | null, expected: string): boolean {
  if (given === null) return false;
  const a = createHash("sha256").update(given, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = optionalEnv("REVALIDATE_SECRET");
  if (!secret) {
    // Fail closed: without the secret nobody, not even the webhook, may expire the cache.
    // The log carries the reason; the body does not describe the deployment to a stranger.
    console.error("POST /api/revalidate: REVALIDATE_SECRET is not set; the request is refused.");
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
  if (!sameSecret(request.headers.get("x-revalidate-secret"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad payload" }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad payload" }, { status: 400 });
  }

  const { table } = parsed.data;
  // Object.hasOwn: a table named like a prototype member ("constructor") is unknown, not a function.
  const tag = Object.hasOwn(TABLE_TAGS, table) ? TABLE_TAGS[table] : undefined;
  if (!tag) {
    console.error(`POST /api/revalidate: no cache tag for table "${table}".`);
    return Response.json({ error: "unknown table" }, { status: 400 });
  }

  // Not a Server Action, so updateTag is unavailable; { expire: 0 } means the next
  // request rebuilds the entry instead of serving the stale content (revalidateTag docs).
  revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: true, table, tag });
}
