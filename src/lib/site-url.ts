import type { Config } from "@/lib/configurator/types";
import { paramsFromConfig } from "@/lib/configurator/url";

/**
 * The site's public origin, without a trailing slash, read at call time so the
 * app builds with no environment variables:
 * NEXT_PUBLIC_SITE_URL ?? https://VERCEL_PROJECT_PRODUCTION_URL ?? https://VERCEL_URL ?? http://localhost:3000
 * An empty variable counts as unset. Only NEXT_PUBLIC_SITE_URL reaches the browser.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;
  const deployment = process.env.VERCEL_URL;
  if (deployment) return `https://${deployment}`;
  return "http://localhost:3000";
}

/**
 * The link that reopens a configuration (DESIGN §5.3), used in the WhatsApp
 * message and the emails. `base` overrides siteUrl(), e.g. with
 * window.location.origin in a Client Component, where the VERCEL_* variables
 * do not exist.
 */
export function shareUrl(config: Config, base: string = siteUrl()): string {
  return `${base.replace(/\/+$/, "")}/configurator?${paramsFromConfig(config).toString()}`;
}
