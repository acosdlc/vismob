import "server-only";
import { createHash } from "node:crypto";
import { requireEnv } from "@/lib/env";

/** The visitor's IP: the first `x-forwarded-for` entry (Vercel sets it), or "unknown". */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first ? first : "unknown";
}

/** `sha256(ip + IP_HASH_SALT)` as hex (ARHITECTURA §6.1 step 3.4); the raw IP is never stored. */
export function ipHash(ip: string): string {
  return createHash("sha256")
    .update(ip + requireEnv("IP_HASH_SALT"))
    .digest("hex");
}
