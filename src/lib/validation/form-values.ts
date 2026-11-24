import type { FieldErrors } from "@/lib/leads/types";

// The two helpers every form parser needs, with no dependencies of their own: a
// Client Component that imports a parser module for its constants must not drag
// libphonenumber-js (src/lib/validation/schemas.ts) or the configurator seed
// (src/lib/admin/leads.ts) into its bundle. Both modules re-export these.

/**
 * The form's string fields, first value per name; files and React's `$ACTION_*` entries are skipped.
 * CR LF and a lone CR are read as LF, as a textarea's own value holds them: a browser
 * posts every line break of a textarea as CR LF, while the field's `maxLength` counted it
 * once, so a text typed up to the limit would come back as too long. Nothing else in a
 * value changes.
 */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string" || key.startsWith("$ACTION") || key in values) continue;
    values[key] = value.replace(/\r\n?/g, "\n");
  }
  return values;
}

/** The first message per field from Zod issues (the admin actions' `fieldErrors`). */
export function zodFieldErrors(issues: readonly { path: PropertyKey[]; message: string }[], fallback: string): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "");
    if (!field || fieldErrors[field]) continue;
    fieldErrors[field] = issue.message || fallback;
  }
  return fieldErrors;
}
