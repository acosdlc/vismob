// @vitest-environment node
import { describe, expect, it } from "vitest";
import { QUOTE_FIELDS } from "@/components/configurator/types";
import { DEFAULT_CONFIG } from "@/lib/configurator/catalog.seed";
import { paramsFromConfig } from "@/lib/configurator/url";
import { FORM_FIELDS, FORM_MESSAGES, UPLOAD_LIMITS } from "@/lib/leads/types";
import { contactSchema, formValues, leadBaseSchema, parseLeadForm, quoteSchema } from "./schemas";

const UUID = "0b3a9a1e-1234-4abc-8def-0123456789ab";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

const VALID = {
  name: "Ana Pop",
  phone: "0722 123 456",
  email: "Ana.Pop@Example.com",
  mattressSize: "160 × 200 cm",
  privacy: "on",
};

describe("leadBaseSchema", () => {
  it("normalises a Romanian number to E.164", () => {
    const result = leadBaseSchema.safeParse({ ...VALID, phone: "0722 123 456" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe("+40722123456");
  });

  it("keeps an international number", () => {
    const result = leadBaseSchema.safeParse({ ...VALID, phone: "+44 20 7946 0958" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe("+442079460958");
  });

  it("rejects an invalid phone with the phone message", () => {
    const result = leadBaseSchema.safeParse({ ...VALID, phone: "12 34" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.find((i) => i.path[0] === "phone")?.message).toBe(FORM_MESSAGES.phone);
    }
  });

  it("requires the email and lowercases it", () => {
    const missing = leadBaseSchema.safeParse({ ...VALID, email: "" });
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.issues.find((i) => i.path[0] === "email")?.message).toBe(FORM_MESSAGES.required);
    }

    const invalid = leadBaseSchema.safeParse({ ...VALID, email: "ana@" });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues.find((i) => i.path[0] === "email")?.message).toBe(FORM_MESSAGES.email);
    }

    const ok = leadBaseSchema.safeParse({ ...VALID, email: "  Ana.Pop@Example.com " });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.email).toBe("ana.pop@example.com");
  });

  it("bounds the name to 2–120 characters after trimming", () => {
    const short = leadBaseSchema.safeParse({ ...VALID, name: " A " });
    expect(short.success).toBe(false);
    if (!short.success) {
      expect(short.error.issues.find((i) => i.path[0] === "name")?.message).toBe(FORM_MESSAGES.name);
    }

    const empty = leadBaseSchema.safeParse({ ...VALID, name: "   " });
    expect(empty.success).toBe(false);
    if (!empty.success) {
      expect(empty.error.issues.find((i) => i.path[0] === "name")?.message).toBe(FORM_MESSAGES.required);
    }

    const long = leadBaseSchema.safeParse({ ...VALID, name: "a".repeat(121) });
    expect(long.success).toBe(false);

    const ok = leadBaseSchema.safeParse({ ...VALID, name: "  Ana  " });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.name).toBe("Ana");
  });

  it("turns empty optional texts into undefined and bounds them", () => {
    const ok = leadBaseSchema.safeParse({ ...VALID, city: "  ", message: " Un pat. " });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.city).toBeUndefined();
      expect(ok.data.message).toBe("Un pat.");
    }

    const long = leadBaseSchema.safeParse({ ...VALID, message: "x".repeat(4001) });
    expect(long.success).toBe(false);
    if (!long.success) {
      expect(long.error.issues.find((i) => i.path[0] === "message")?.message).toBe(FORM_MESSAGES.tooLong);
    }
  });

  it("reads the checkboxes: wantsMeasurement defaults to false, privacy must be on", () => {
    const unchecked = leadBaseSchema.safeParse(VALID);
    expect(unchecked.success).toBe(true);
    if (unchecked.success) expect(unchecked.data.wantsMeasurement).toBe(false);

    const checked = leadBaseSchema.safeParse({ ...VALID, wantsMeasurement: "on" });
    expect(checked.success).toBe(true);
    if (checked.success) expect(checked.data.wantsMeasurement).toBe(true);

    const noPrivacy = leadBaseSchema.safeParse({ ...VALID, privacy: undefined });
    expect(noPrivacy.success).toBe(false);
    if (!noPrivacy.success) {
      expect(noPrivacy.error.issues.find((i) => i.path[0] === "privacy")?.message).toBe(FORM_MESSAGES.privacy);
    }
  });
});

describe("contactSchema", () => {
  it("accepts only the listed mattress sizes", () => {
    expect(contactSchema.safeParse({ ...VALID, mattressSize: "Încă nu știu" }).success).toBe(true);
    const bad = contactSchema.safeParse({ ...VALID, mattressSize: "150 × 200 cm" });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues.find((i) => i.path[0] === "mattressSize")?.message).toBe(FORM_MESSAGES.required);
    }
  });

  it("parses the uploads JSON and defaults to none", () => {
    const none = contactSchema.safeParse(VALID);
    expect(none.success).toBe(true);
    if (none.success) expect(none.data.uploads).toEqual([]);

    const paths = [`pending/${UUID}/1.jpg`, `pending/${UUID}/2.webp`];
    const some = contactSchema.safeParse({ ...VALID, [FORM_FIELDS.uploads]: JSON.stringify(paths) });
    expect(some.success).toBe(true);
    if (some.success) expect(some.data.uploads).toEqual(paths);
  });

  it("refuses paths outside pending/ and more than the limit", () => {
    const outside = contactSchema.safeParse({
      ...VALID,
      [FORM_FIELDS.uploads]: JSON.stringify([`other/${UUID}/1.jpg`]),
    });
    expect(outside.success).toBe(false);
    if (!outside.success) {
      expect(outside.error.issues.find((i) => i.path[0] === "uploads")?.message).toBe(FORM_MESSAGES.uploads);
    }

    const traversal = contactSchema.safeParse({
      ...VALID,
      [FORM_FIELDS.uploads]: JSON.stringify([`pending/${UUID}/../x/1.jpg`]),
    });
    expect(traversal.success).toBe(false);

    const tooMany = Array.from({ length: UPLOAD_LIMITS.maxFiles + 1 }, (_, i) => `pending/${UUID}/${i + 1}.jpg`);
    const many = contactSchema.safeParse({ ...VALID, [FORM_FIELDS.uploads]: JSON.stringify(tooMany) });
    expect(many.success).toBe(false);

    const notJson = contactSchema.safeParse({ ...VALID, [FORM_FIELDS.uploads]: "nope" });
    expect(notJson.success).toBe(false);
    if (!notJson.success) {
      expect(notJson.error.issues.find((i) => i.path[0] === "uploads")?.message).toBe(FORM_MESSAGES.uploads);
    }

    // A crafted element that is not a string gets the same Romanian text, never Zod's default.
    const notStrings = contactSchema.safeParse({ ...VALID, [FORM_FIELDS.uploads]: JSON.stringify([1]) });
    expect(notStrings.success).toBe(false);
    if (!notStrings.success) {
      expect(notStrings.error.issues.find((i) => i.path[0] === "uploads")?.message).toBe(FORM_MESSAGES.uploads);
    }
  });
});

describe("quoteSchema", () => {
  const QUOTE = { name: VALID.name, phone: VALID.phone, email: VALID.email, privacy: VALID.privacy };

  it("round-trips the default configuration through the hidden field", () => {
    const result = quoteSchema.safeParse({ ...QUOTE, [QUOTE_FIELDS.config]: paramsFromConfig(DEFAULT_CONFIG).toString() });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.config).toEqual(DEFAULT_CONFIG);
  });

  it("round-trips a custom size with its extras", () => {
    const custom = { ...DEFAULT_CONFIG, size: "custom" as const, customW: 150, customL: 210, led: true, nightstands: true };
    const result = quoteSchema.safeParse({ ...QUOTE, [QUOTE_FIELDS.config]: paramsFromConfig(custom).toString() });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.config).toEqual(custom);
  });

  it("requires the field; an unknown value is left to resolve()", () => {
    for (const value of [undefined, "", "   "]) {
      const result = quoteSchema.safeParse({ ...QUOTE, [QUOTE_FIELDS.config]: value });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.find((i) => i.path[0] === QUOTE_FIELDS.config)?.message).toBe(FORM_MESSAGES.required);
      }
    }
    const odd = quoteSchema.safeParse({ ...QUOTE, [QUOTE_FIELDS.config]: "m=nope&h=abc" });
    expect(odd.success).toBe(true);
    if (odd.success) expect(odd.data.config).toMatchObject({ model: "nope", hb: DEFAULT_CONFIG.hb });
  });

  it("maps a missing config to its FORM_MESSAGES text through parseLeadForm", () => {
    const result = parseLeadForm(form(QUOTE), quoteSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors).toEqual({ [QUOTE_FIELDS.config]: FORM_MESSAGES.required });
  });
});

describe("formValues", () => {
  it("keeps the first string value per field and skips files and $ACTION entries", () => {
    const fd = new FormData();
    fd.append("name", "Ana");
    fd.append("name", "Dup");
    fd.append("$ACTION_ID_abc", "x");
    fd.append("file", new Blob(["x"]), "x.txt");
    expect(formValues(fd)).toEqual({ name: "Ana" });
  });
});

describe("parseLeadForm", () => {
  it("returns the parsed data for a valid contact form", () => {
    const result = parseLeadForm(form({ ...VALID, wantsMeasurement: "on", city: "Cluj" }), contactSchema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        name: "Ana Pop",
        phone: "+40722123456",
        email: "ana.pop@example.com",
        city: "Cluj",
        message: undefined,
        wantsMeasurement: true,
        privacy: "on",
        mattressSize: "160 × 200 cm",
        uploads: [],
      });
    }
  });

  it("maps the first issue per field to its FORM_MESSAGES text", () => {
    const result = parseLeadForm(form({ name: "", phone: "abc", email: "x" }), contactSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toEqual({
        name: FORM_MESSAGES.required,
        phone: FORM_MESSAGES.phone,
        email: FORM_MESSAGES.email,
        privacy: FORM_MESSAGES.privacy,
        mattressSize: FORM_MESSAGES.required,
      });
    }
  });
});
