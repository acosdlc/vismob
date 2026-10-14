import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/env";

// The pages are static, so the "form loaded at" timestamp cannot be rendered on
// the server. A Server Action mints it on the form's first interaction, signed
// with FORM_HMAC_SECRET, and the submit proves how long the form was open.

/** A token older than this is refused, whatever its signature. */
export const FORM_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const TOKEN_SHAPE = /^(\d{1,16})\.([0-9a-f]{64})$/;

function sign(issuedMs: string): string {
  return createHmac("sha256", requireEnv("FORM_HMAC_SECRET")).update(issuedMs).digest("hex");
}

/** `<ms>.<hmac-sha256-hex>` */
export function mintFormToken(now: number = Date.now()): string {
  const issuedMs = String(now);
  return `${issuedMs}.${sign(issuedMs)}`;
}

export type FormTokenResult = { ok: false } | { ok: true; ageSeconds: number };

/** Valid when well formed, signed by us and at most 24 hours old; `ageSeconds` is how long ago it was minted. */
export function verifyFormToken(token: string | null | undefined, now: number = Date.now()): FormTokenResult {
  if (typeof token !== "string") return { ok: false };
  const match = TOKEN_SHAPE.exec(token);
  if (!match) return { ok: false };

  const [, issuedMs, signature] = match;
  const expected = Buffer.from(sign(issuedMs), "hex");
  const given = Buffer.from(signature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false };

  const ageMs = now - Number(issuedMs);
  if (ageMs > FORM_TOKEN_MAX_AGE_MS) return { ok: false };
  return { ok: true, ageSeconds: Math.floor(ageMs / 1000) };
}
