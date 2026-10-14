import type { FieldErrors, LeadSource } from "@/lib/leads/types";

// Helpers shared by the request forms (ContactForm, QuoteForm). Pure: no React, no
// actions, so a form can import them without pulling another form's bundle.

/** What the hidden `source` input carries (ARHITECTURA §6.1; `environment` is added on the server). */
export function collectSource(
  page: string,
  location?: Pick<Location, "search">,
  referrer?: string,
): Omit<LeadSource, "environment"> {
  const source: Omit<LeadSource, "environment"> = { page };
  if (referrer) source.referrer = referrer;
  if (location) {
    const utm: Record<string, string> = {};
    for (const [key, value] of new URLSearchParams(location.search)) {
      if (key.startsWith("utm_") && value) utm[key] = value;
    }
    if (Object.keys(utm).length > 0) source.utm = utm;
  }
  return source;
}

/**
 * Focuses the first control, in the form's own field order, that has an error; returns
 * whether one was found. A field whose named control is hidden (e.g. `uploads`) is found
 * through `data-field`.
 */
export function focusFirstInvalid(form: HTMLFormElement, errors: FieldErrors, order: readonly string[]): boolean {
  for (const field of order) {
    if (!errors[field]) continue;
    const named = form.elements.namedItem(field);
    const visible = named instanceof HTMLElement && !(named instanceof HTMLInputElement && named.type === "hidden");
    const target = visible ? named : form.querySelector<HTMLElement>(`[data-field="${field}"]`);
    if (target) {
      target.focus();
      return true;
    }
  }
  return false;
}
