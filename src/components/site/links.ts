/** `tel:` href for a public phone string: only the spaces are removed. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/\s+/g, "")}`;
}

const EXTERNAL = /^(?:https?:)?\/\/|^(?:tel|mailto):|^wa\.me/i;

/** http(s), protocol-relative, tel:, mailto: and wa.me hrefs are rendered as plain anchors. */
export function isExternalHref(href: string): boolean {
  return EXTERNAL.test(href);
}
