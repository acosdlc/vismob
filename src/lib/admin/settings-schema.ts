import { parsePhoneNumberFromString } from "libphonenumber-js";
import { z } from "zod";
import type { Settings } from "@/lib/data/settings.seed";
import type { FieldErrors } from "@/lib/leads/types";
import { formValues } from "@/lib/validation/schemas";
import { isMediaPath } from "./media";
import { SETTINGS_FIELDS, type SettingsField } from "./settings-fields";
import { ADMIN_MESSAGES } from "./types";

// Validation of the Setări form (PR-7), built from the same descriptors the form
// renders. „Telefon” and „Email” are required and checked as a phone number and an
// email address: the site links them (tel:, mailto:) wherever it shows them, and the
// email is the reply-to of the client's confirmation. Every text and textarea is
// required as well, with at least one character after the trim: the site prints it
// inside a fixed sentence, so an empty one would leave a gap there („CUI” with no
// number, a question with no answer). Only what the site hides while it is empty may
// be saved empty: the texts marked `optional` in settings-fields.ts (google_rating
// with google_reviews_count, the Google line; story_text, which only ends the Atelier
// paragraph) and, by their kind, whatsapp_number (the WhatsApp buttons), instagram_url
// and facebook_url (the footer links), google_profile_url (it only feeds the JSON-LD)
// and atelier_photo_path (the FOTO 08 box shows instead). The seed's "[...]"
// placeholders are not empty: they pass everywhere, in „Telefon” and „Email” as well,
// so the form can be saved before all the content is in; they are replaced in PR-11.
// In those two fields only a value that is one whole bracket counts as a placeholder
// (isPlaceholder); a number or an address with a bracketed note is checked like any other.
// Beyond that only the shape is checked here, never the content.
//
// Only the Server Action imports this module: libphonenumber-js must not reach a
// browser bundle. What a Client Component needs is in settings-fields.ts.

/** Texts of this form that ADMIN_MESSAGES does not carry (listed in the PR for approval). */
export const SETTINGS_MESSAGES = {
  url: "Scrie un link complet, cu https://",
  digits: "Scrie numărul internațional, doar cifre, fără +",
  /** The public forms' wording (FORM_MESSAGES.phone). */
  phone: "Scrie un număr de telefon valid.",
  photo: "Poza nu e validă; încarc-o din nou.",
  /** saveSettings: the stored row is no longer the one the open page was filled from (settings-fingerprint.ts). */
  stale: "Setările au fost schimbate între timp din altă fereastră. Reîncarcă pagina și reia modificarea.",
} as const;

export type ParseSettingsResult = { ok: true; data: Settings } | { ok: false; fieldErrors: FieldErrors };

/** What the WhatsApp field takes: digits only, 8 to 15 (an international number has at most 15, ITU E.164). */
export const WHATSAPP_DIGITS = /^\d{8,15}$/;

/**
 * What „Telefon” may carry besides digits and a "+" in front: spaces, which telHref
 * drops, and . - ( ), which a tel: link takes.
 */
const PHONE_SEPARATORS = /[\s.\-()]/g;

const httpUrl = z.url({ protocol: /^https?$/ });

/** The check the public forms run on the client's address (src/lib/validation/schemas.ts). */
const emailAddress = z.email();

/**
 * In „Telefon” and „Email” a value is still a placeholder only when it is one whole
 * bracket, as the seed's „[07xx xxx xxx]” and „[contact@domeniu.ro]” are: it opens with
 * "[", closes with "]" and has no other "]" inside. The value arrives trimmed. The
 * emails and the JSON-LD take any text that carries "[" for a placeholder (`isReal` in
 * src/emails/shared.tsx) and leave it unlinked; here that rule would switch the check
 * off for „0722 123 456 [Alex]”, which the public pages link as it is.
 */
const isPlaceholder = (value: string) => /^\[[^\]]*\]$/.test(value);

/** A posted text: present (the form always posts it), trimmed, bounded; "" allowed. */
const text = (field: SettingsField) =>
  z.string({ error: ADMIN_MESSAGES.required }).trim().max(field.maxLength, ADMIN_MESSAGES.tooLong);

/** A text that may not be empty. This check comes before the one of its shape, so "" answers `required`. */
const requiredText = (field: SettingsField) => text(field).min(1, ADMIN_MESSAGES.required);

/** "" or an http(s) URL. */
const url = (field: SettingsField) =>
  text(field).refine((value) => value === "" || httpUrl.safeParse(value).success, SETTINGS_MESSAGES.url);

/**
 * True when the value is a valid number (Romanian unless it carries a country code)
 * that a phone can dial exactly as typed, because the tel: link carries it with only
 * the spaces removed (telHref). libphonenumber-js repairs what it reads: it finds the
 * number inside „Tel: 0722 123 456” or „0722 123 456 (Alex)”, and it calls
 * „40 722 123 456”, „722 123 456” and „+40 (0) 722 123 456” valid. A link built from
 * any of those does not reach the workshop. So, with the separators out, what was
 * typed has to be the number itself, international (+40722…, 0040722…) or Romanian
 * national (0722…): nothing but digits, separators and a "+" in front can pass.
 */
function dialsAsTyped(value: string): boolean {
  const parsed = parsePhoneNumberFromString(value, "RO");
  if (!parsed?.isValid()) return false;
  const typed = value.replace(PHONE_SEPARATORS, "");
  return (
    typed === parsed.number ||
    typed === `00${parsed.number.slice(1)}` ||
    (parsed.countryCallingCode === "40" && typed === `0${parsed.nationalNumber}`)
  );
}

/** „Telefon”: a "[...]" placeholder or a number that dials as typed. Stored as typed: the site shows it that way. */
const phone = (field: SettingsField) =>
  requiredText(field).refine((value) => isPlaceholder(value) || dialsAsTyped(value), SETTINGS_MESSAGES.phone);

/** „Email”: a "[...]" placeholder or one well-formed address, stored as typed. */
const email = (field: SettingsField) =>
  requiredText(field).refine(
    (value) => isPlaceholder(value) || emailAddress.safeParse(value).success,
    ADMIN_MESSAGES.email,
  );

/**
 * The digits wa.me needs, country code first, for a number typed without "+" (PLAN
 * „WhatsApp”). Read as an international number first, so a foreign number keeps its
 * country, then as a Romanian national one: 0722123456 becomes 40722123456. Null
 * when neither reading is a valid number.
 */
function whatsappDigits(value: string): string | null {
  for (const reading of [parsePhoneNumberFromString(`+${value}`), parsePhoneNumberFromString(value, "RO")]) {
    // `number` is E.164, "+40722123456": the link takes it without the plus.
    if (reading?.isValid()) return reading.number.slice(1);
  }
  return null;
}

/**
 * "" or a number typed as digits only, stored as its international digits. The
 * pattern bounds the length, so one message covers a wrong shape and a wrong number.
 */
const digits = () =>
  z
    .string({ error: ADMIN_MESSAGES.required })
    .trim()
    .transform((value, ctx) => {
      if (value === "") return value;
      const international = WHATSAPP_DIGITS.test(value) ? whatsappDigits(value) : null;
      if (international === null) {
        ctx.addIssue({ code: "custom", message: SETTINGS_MESSAGES.digits });
        return z.NEVER;
      }
      return international;
    });

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
      // Required, unless the site hides the piece while the value is empty.
      return field.optional ? text(field) : requiredText(field);
    case "url":
      return url(field);
    case "digits":
      return digits();
    case "phone":
      return phone(field);
    case "email":
      return email(field);
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
