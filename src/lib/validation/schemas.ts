import { parsePhoneNumberFromString } from "libphonenumber-js";
import { z } from "zod";
import { QUOTE_FIELDS } from "@/components/configurator/types";
import { configFromParams } from "@/lib/configurator/url";
import { FORM_FIELDS, FORM_MESSAGES, MATTRESS_SIZES, UPLOAD_LIMITS, type FieldErrors } from "@/lib/leads/types";
import { formValues } from "./form-values";

// Zod schemas for the request forms (ARHITECTURA §6.1 table). Every message is a
// FORM_MESSAGES entry, so the forms show the texts listed for approval and
// nothing else. The schemas read plain strings (what FormData carries), and
// `parseLeadForm` turns a FormData into that record.

export type ParseResult<T> = { ok: true; data: T } | { ok: false; fieldErrors: FieldErrors };

/** `pending/<uuid>/<n>.<ext>`: the only path shape `createUploadUrls` hands out. */
export const PENDING_UPLOAD_PATH = /^pending\/[0-9a-f-]{36}\/\d+\.(jpg|png|webp)$/;

const requiredText = (message: string, min: number, max: number) =>
  z
    .string({ error: FORM_MESSAGES.required })
    .trim()
    .min(1, FORM_MESSAGES.required)
    .min(min, message)
    .max(max, message);

/** Optional free text: trimmed, bounded, and `undefined` when left empty. */
const optionalText = (max: number) =>
  z
    .string({ error: FORM_MESSAGES.tooLong })
    .trim()
    .max(max, FORM_MESSAGES.tooLong)
    .optional()
    .transform((value) => (value ? value : undefined));

/** A checkbox posts "on" when ticked and nothing when not. */
const checkbox = z
  .string()
  .optional()
  .transform((value) => value === "on");

const phone = z
  .string({ error: FORM_MESSAGES.required })
  .trim()
  .min(1, FORM_MESSAGES.required)
  .transform((value, ctx) => {
    const parsed = parsePhoneNumberFromString(value, "RO");
    if (!parsed || !parsed.isValid()) {
      ctx.addIssue({ code: "custom", message: FORM_MESSAGES.phone });
      return z.NEVER;
    }
    return parsed.number as string;
  });

// `z.email()` is a format schema, so trimming and lowercasing run first through a pipe.
const email = z
  .string({ error: FORM_MESSAGES.required })
  .trim()
  .min(1, FORM_MESSAGES.required)
  .toLowerCase()
  .max(254, FORM_MESSAGES.email)
  .pipe(z.email({ error: FORM_MESSAGES.email }));

/** The hidden `uploads` input carries a JSON array of pending paths; absent means none. */
const uploads = z.preprocess(
  (value) => {
    if (value === undefined || value === "") return [];
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  },
  z
    .array(z.string({ error: FORM_MESSAGES.uploads }).regex(PENDING_UPLOAD_PATH, FORM_MESSAGES.uploads), {
      error: FORM_MESSAGES.uploads,
    })
    .max(UPLOAD_LIMITS.maxFiles, FORM_MESSAGES.uploads),
);

export const leadBaseSchema = z.object({
  name: requiredText(FORM_MESSAGES.name, 2, 120),
  phone,
  email,
  city: optionalText(120),
  message: optionalText(4000),
  wantsMeasurement: checkbox,
  privacy: z.literal("on", { error: FORM_MESSAGES.privacy }),
});

export const contactSchema = leadBaseSchema.extend({
  mattressSize: z.enum(MATTRESS_SIZES, { error: FORM_MESSAGES.required }),
  [FORM_FIELDS.uploads]: uploads,
});

/**
 * The configurator's hidden `config` input: `paramsFromConfig(cfg).toString()` (DESIGN
 * §5.3). Only its presence is checked here; `resolve()` repairs every value on the
 * server, and the code and the price are recomputed from the result (§5.7).
 */
const config = z
  .string({ error: FORM_MESSAGES.required })
  .trim()
  .min(1, FORM_MESSAGES.required)
  .transform((value) => configFromParams(new URLSearchParams(value)));

export const quoteSchema = leadBaseSchema.extend({
  [QUOTE_FIELDS.config]: config,
});

export type LeadBaseInput = z.output<typeof leadBaseSchema>;
export type ContactInput = z.output<typeof contactSchema>;
export type QuoteInput = z.output<typeof quoteSchema>;

export { formValues } from "./form-values";

/** Validates a posted form; on failure, the first FORM_MESSAGES text per field. */
export function parseLeadForm<S extends z.ZodType>(formData: FormData, schema: S): ParseResult<z.output<S>> {
  const result = schema.safeParse(formValues(formData));
  if (result.success) return { ok: true, data: result.data };

  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? "");
    if (!field || fieldErrors[field]) continue;
    fieldErrors[field] = issue.message || FORM_MESSAGES.required;
  }
  return { ok: false, fieldErrors };
}
