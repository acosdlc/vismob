import type { Settings } from "@/lib/data/settings.seed";
import { oneLine } from "@/lib/one-line";

// ARHITECTURA §10, PLAN „JSON-LD”: a FurnitureStore built only from what `settings`
// holds (no geo, no structured hours in v1). Pure: the page passes getSettings()
// and siteUrl(); JsonLd.tsx renders the result.

/** Same rule as `isReal` in src/emails/shared.tsx: filled in and not a `[...]` placeholder. */
function real(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim() !== "" && !value.includes("[");
}

/**
 * The schema.org object for Acasă, or null while the workshop's name is still a
 * placeholder. Every field is present only when its value is real; the address
 * only when at least one of its fields is.
 */
export function furnitureStoreJsonLd(settings: Settings, origin: string): Record<string, unknown> | null {
  if (!real(settings.workshop_name)) return null;
  const base = origin.replace(/\/+$/, "");

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "FurnitureStore",
    name: settings.workshop_name.trim(),
    url: base,
  };
  if (real(settings.phone_public)) data.telephone = settings.phone_public.trim();
  if (real(settings.email_public)) data.email = settings.email_public.trim();

  const address: Record<string, string> = {};
  // The address may be typed on several lines in Setări; the field takes one.
  if (real(settings.address)) address.streetAddress = oneLine(settings.address);
  if (real(settings.city)) address.addressLocality = settings.city.trim();
  if (Object.keys(address).length > 0) {
    data.address = { "@type": "PostalAddress", ...address, addressCountry: "RO" };
  }

  const sameAs = [settings.instagram_url, settings.facebook_url, settings.google_profile_url]
    .filter(real)
    .map((url) => url.trim());
  if (sameAs.length > 0) data.sameAs = sameAs;

  // The file-convention OG image (src/app/opengraph-image.tsx).
  data.image = `${base}/opengraph-image`;
  return data;
}

/** The script's body: JSON with `<` escaped, so no value can close the script tag. */
export function jsonLdScript(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
