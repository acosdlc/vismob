import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { optionalEnv } from "@/lib/env";

// Vercel Cron calls `GET /api/cron/[job]` with `Authorization: Bearer <CRON_SECRET>`
// (it adds the header itself once the variable is set on the project). Nothing
// else may run a job: without the secret the route fails closed with 503.

export type CronAuthorization = { ok: true } | { ok: false; status: 401 | 503 };

// Compared as sha256 digests: equal lengths, so timingSafeEqual leaks neither
// the length nor the position of the first differing byte.
function sameSecret(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export function authorizeCron(request: Request): CronAuthorization {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) {
    // The log carries the reason; the body does not describe the deployment to a stranger.
    console.error("GET /api/cron: CRON_SECRET is not set; the request is refused.");
    return { ok: false, status: 503 };
  }
  const header = request.headers.get("authorization");
  if (header === null || !sameSecret(header, `Bearer ${secret}`)) return { ok: false, status: 401 };
  return { ok: true };
}
