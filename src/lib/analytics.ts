import { track } from "@vercel/analytics";

// ARHITECTURA §10: the six Vercel Web Analytics events. Every call goes through trackEvent,
// which never throws and never blocks the UI. track() itself is a no-op without the
// <Analytics /> script (src/app/layout.tsx), so nothing is sent in development or in tests.

export const EVENTS = ["config_start", "config_step", "quote_submit", "contact_submit", "whatsapp_click", "phone_click"] as const;
export type EventName = (typeof EVENTS)[number];

/** Flat properties only: Vercel accepts strings, numbers and booleans, no nested objects. */
export type EventProperties = Record<string, string | number | boolean>;

export function trackEvent(name: EventName, properties?: EventProperties): void {
  try {
    track(name, properties);
  } catch {
    // Analytics is best effort: a failure here must never reach the visitor.
  }
}
