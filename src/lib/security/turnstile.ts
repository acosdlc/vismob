import "server-only";
import { optionalEnv } from "@/lib/env";

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Cloudflare Turnstile siteverify (ARHITECTURA §6.1 step 3.2). Without
 * TURNSTILE_SECRET_KEY the widget is off and every submit passes; with it, only
 * a token Cloudflare confirms passes. Any network or parsing error fails closed.
 */
export async function verifyTurnstile(token: string | null, ip: string): Promise<boolean> {
  const secret = optionalEnv("TURNSTILE_SECRET_KEY");
  if (!secret) return true;
  if (!token) return false;

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) return false;

    const result = (await response.json()) as { success?: unknown };
    return result.success === true;
  } catch (error) {
    console.error("verifyTurnstile", error);
    return false;
  }
}
