import { z } from "zod";
import type { Settings } from "@/lib/data/settings.seed";
import type { FieldErrors } from "@/lib/leads/types";
import { formValues } from "@/lib/validation/schemas";
import { isMediaPath } from "./media";
import { SETTINGS_FIELDS, type SettingsField } from "./settings-fields";
import { ADMIN_MESSAGES } from "./types";

// Validation of the Setări form (PR-7), built from the same descriptors the form
// renders. Every text may be empty: an empty string means "not provided" and the
// site hides the piece (settings.seed.ts); the seed's "[...]" placeholders pass
// too, they are replaced in PR-11. Only the shape is checked here, never the content.

/** Texts of this form that ADMIN_MESSAGES does not carry (listed in the PR for approval). */
export const SETTINGS_MESSAGES = {
  url: "Scrie un link complet, cu https://",
  digits: "Scrie numărul internațional, doar cifre, fără +",
  photo: "Poza nu e validă; încarc-o din nou.",
} as const;

export type ParseSettingsResult = { ok: true; data: Settings } | { ok: false; fieldErrors: FieldErrors };

/** The international number without "+": 8 to 15 digits (ITU E.164). */
export const WHATSAPP_DIGITS = /^\d{8,15}$/;

const httpUrl = z.url({ protocol: /^https?$/ });

/** A posted text: present (the form always posts it), trimmed, bounded; "" allowed. */
const text = (field: SettingsField) =>
  z.string({ error: ADMIN_MESSAGES.required }).trim().max(field.maxLength, ADMIN_MESSAGES.tooLong);

/** "" or an http(s) URL. */
const url = (field: SettingsField) =>
  text(field).refine((value) => value === "" || httpUrl.safeParse(value).success, SETTINGS_MESSAGES.url);

/** "" or the digits of an international number; the pattern bounds the length, so one message covers both. */
const digits = () =>
  z
    .string({ error: ADMIN_MESSAGES.required })
    .trim()
    .refine((value) => value === "" || WHATSAPP_DIGITS.test(value), SETTINGS_MESSAGES.digits);

/**
 * "" or a path PhotoField produced in the `site/` folder of the media bucket (PR-9,
 * the FOTO 08 photo). The photo itself is uploaded by the browser; only its path
 * is stored, so nothing but such a path may reach `settings.data`.
 */
const photo = (field: SettingsField) =>
  text(field).refine((value) => value === "" || isMediaPath(value, "site"), SETTINGS_MESSAGES.photo);

/** A checkbox posts "on" when ticked and nothing when not. */
const checkbox = z
  .string()
  .optional()
  .transform((value) => value === "on");

function schemaFor(field: SettingsField): z.ZodType<string> | z.ZodType<boolean> {
  switch (field.kind) {
    case "text":
    case "textarea":
      return text(field);
    case "url":
      return url(field);
    case "digits":
      return digits();
    case "photo":
      return photo(field);
    case "boolean":
      return checkbox;
  }
}

type SettingsShape = { [K in keyof Settings]: z.ZodType<Settings[K]> };

// The cast holds because settings-fields.test.ts proves every Settings key appears
// exactly once and that the boolean kinds are exactly the seed's boolean keys.
const shape = Object.fromEntries(SETTINGS_FIELDS.map((field) => [field.key, schemaFor(field)])) as SettingsShape;

export const settingsSchema = z.object(shape);

/** Validates the posted Setări form; on failure, the first message per field. */
export function parseSettingsForm(formData: FormData): ParseSettingsResult {
  const result = settingsSchema.safeParse(formValues(formData));
  // `result.data` is `z.output<typeof settingsSchema>`; returning it as `Settings` is the type check.
  if (result.success) return { ok: true, data: result.data };

  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? "");
    if (!field || fieldErrors[field]) continue;
    fieldErrors[field] = issue.message || ADMIN_MESSAGES.invalid;
  }
  return { ok: false, fieldErrors };
}
