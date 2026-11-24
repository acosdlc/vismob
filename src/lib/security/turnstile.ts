import "server-only";
import { optionalEnv } from "@/lib/env";

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const SITEVERIFY_TIMEOUT_MS = 5_000;

/**
 * Cloudflare Turnstile siteverify (ARHITECTURA §6.1 step 3.2). Turnstile is on
 * only with both keys: NEXT_PUBLIC_TURNSTILE_SITE_KEY renders the widget that
 * posts the token, TURNSTILE_SECRET_KEY checks it. With either one missing it is
 * off and every submit passes (PLAN principle 3); when only one is missing, that
 * is a configuration mistake and each submit logs which one. With both, only a
 * token Cloudflare confirms passes, and any network or parsing error fails closed.
 */
export async function verifyTurnstile(token: string | null, ip: string): Promise<boolean> {
  const secret = optionalEnv("TURNSTILE_SECRET_KEY");
  // The literal reference, not a lookup by name: Next.js inlines it at build time,
  // so the server reads the value the browser bundle (the widget) was built with.
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!secret || !siteKey) {
    // Failing closed on half a pair would refuse every visitor: a secret alone has
    // no widget to mint a token, a site key alone has nothing to check one with.
    if (secret || siteKey) {
      const missing = secret ? "NEXT_PUBLIC_TURNSTILE_SITE_KEY" : "TURNSTILE_SECRET_KEY";
      console.error(
        `verifyTurnstile: Missing environment variable ${missing}. Turnstile needs both of its keys, so it is off and this submit was not verified. Add it on the Vercel project's Environment Variables page.`,
      );
    }
    return true;
  }
  if (!token) return false;

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      // A hanging siteverify must not hold the Server Action; the catch below answers false.
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    if (!response.ok) return false;

    const result = (await response.json()) as { success?: unknown };
    return result.success === true;
  } catch (error) {
    console.error("verifyTurnstile", error);
    return false;
  }
}
