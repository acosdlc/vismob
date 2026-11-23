import { describe, expect, it } from "vitest";
import { SEED_SETTINGS, type Settings } from "@/lib/data/settings.seed";
import { SETTINGS_FIELDS, SETTINGS_FINGERPRINT_FIELD, SETTINGS_MAX } from "./settings-fields";
import { parseSettingsForm, SETTINGS_MESSAGES, settingsSchema } from "./settings-schema";
import { ADMIN_MESSAGES } from "./types";

/** The form's post for a Settings object: every text as a string, a ticked checkbox as "on". */
function formFor(settings: Partial<Record<keyof Settings, string | boolean>>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value === "boolean") {
      if (value) fd.set(key, "on");
    } else {
      fd.set(key, value);
    }
  }
  return fd;
}

const field = (key: keyof Settings) => SETTINGS_FIELDS.find((f) => f.key === key)!;

describe("settingsSchema", () => {
  it("has one entry per Settings key", () => {
    expect(Object.keys(settingsSchema.shape).sort()).toEqual(Object.keys(SEED_SETTINGS).sort());
  });
});

describe("parseSettingsForm", () => {
  it("accepts the seed as posted by the form, placeholders included, and gives back a Settings", () => {
    const result = parseSettingsForm(formFor(SEED_SETTINGS));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data: Settings = result.data;
    expect(data).toEqual(SEED_SETTINGS);
  });

  // What the site hides while the value is empty, and nothing else: the WhatsApp buttons, the two
  // footer links, the profile link (it only feeds the JSON-LD), the Google line (it needs both
  // values), the end of the Atelier paragraph and the photo. Written out here, not read from the
  // descriptors: a key that joins or leaves this list has to be a decision.
  const MAY_BE_EMPTY: readonly string[] = [
    "whatsapp_number",
    "instagram_url",
    "facebook_url",
    "google_profile_url",
    "google_rating",
    "google_reviews_count",
    "story_text",
    "atelier_photo_path",
  ];

  it("refuses an empty value, or one of spaces only, for every text the site prints inside a sentence", () => {
    const required = SETTINGS_FIELDS.filter((f) => f.kind !== "boolean" && !MAY_BE_EMPTY.includes(f.key)).map((f) => f.key);
    // „Telefon” and „Email” among them: empty, they answer `required`, not the message of their shape.
    expect(required).toHaveLength(30);
    expect(required).toEqual(expect.arrayContaining(["cui", "mattresses_note", "phone_public", "email_public"]));

    for (const blank of ["", "   "]) {
      const emptied = Object.fromEntries(
        SETTINGS_FIELDS.map((f) => [f.key, f.kind === "boolean" ? true : blank]),
      ) as Record<keyof Settings, string | boolean>;
      // Exactly the required keys: the eight above bring no error.
      expect(parseSettingsForm(formFor(emptied))).toEqual({
        ok: false,
        fieldErrors: Object.fromEntries(required.map((key) => [key, ADMIN_MESSAGES.required])),
      });
    }
    expect(ADMIN_MESSAGES.required).toBe("Completează acest câmp.");

    // One emptied box in a form that is otherwise filled in: its own error, and only that one.
    for (const key of required) {
      expect(parseSettingsForm(formFor({ ...SEED_SETTINGS, [key]: "" }))).toEqual({
        ok: false,
        fieldErrors: { [key]: ADMIN_MESSAGES.required },
      });
    }
  });

  it("stores as empty the pieces the site hides, trims every text and reads the checkbox", () => {
    const hidden = Object.fromEntries(MAY_BE_EMPTY.map((key) => [key, ""]));
    const result = parseSettingsForm(
      formFor({ ...SEED_SETTINGS, ...hidden, show_prices: true, workshop_name: "  Atelierul  ", story_text: "   " }),
    );
    expect(result).toEqual({
      ok: true,
      data: { ...SEED_SETTINGS, ...hidden, show_prices: true, workshop_name: "Atelierul" },
    });

    const typed = parseSettingsForm(
      formFor({ ...SEED_SETTINGS, whatsapp_number: " 40722123456 ", google_rating: " 4,9 ", story_text: " Lucrăm la comandă. " }),
    );
    expect(typed.ok && typed.data).toMatchObject({
      whatsapp_number: "40722123456",
      google_rating: "4,9",
      story_text: "Lucrăm la comandă.",
    });
  });

  it("takes a bracket placeholder in any required text: it is not empty, so the form saves before all the content is in", () => {
    const required = SETTINGS_FIELDS.filter((f) => f.kind === "text" || f.kind === "textarea").filter((f) => !f.optional);
    for (const f of required) {
      // The seed's own placeholders (DESIGN §8) and one typed by hand.
      expect(SEED_SETTINGS[f.key]).toContain("[");
      const result = parseSettingsForm(formFor({ ...SEED_SETTINGS, [f.key]: "[de completat]" }));
      expect(result.ok && result.data[f.key]).toBe("[de completat]");
    }
  });

  it("reads an unticked checkbox as false", () => {
    const result = parseSettingsForm(formFor({ ...SEED_SETTINGS, show_prices: false }));
    expect(result.ok && result.data.show_prices).toBe(false);
    const on = parseSettingsForm(formFor({ ...SEED_SETTINGS, show_prices: true }));
    expect(on.ok && on.data.show_prices).toBe(true);
  });

  it("takes only complete http(s) links", () => {
    const valid = parseSettingsForm(
      formFor({ ...SEED_SETTINGS, instagram_url: "https://www.instagram.com/atelier", facebook_url: "http://fb.com/x" }),
    );
    expect(valid.ok).toBe(true);

    const invalid = parseSettingsForm(
      formFor({ ...SEED_SETTINGS, instagram_url: "instagram.com/atelier", facebook_url: "ftp://fb.com/x", google_profile_url: "nu" }),
    );
    expect(invalid).toEqual({
      ok: false,
      fieldErrors: {
        instagram_url: SETTINGS_MESSAGES.url,
        facebook_url: SETTINGS_MESSAGES.url,
        google_profile_url: SETTINGS_MESSAGES.url,
      },
    });
  });

  it("stores the WhatsApp number as international digits, typed with the country code or the Romanian way", () => {
    const stored = (value: string) => {
      const result = parseSettingsForm(formFor({ ...SEED_SETTINGS, whatsapp_number: value }));
      return result.ok ? result.data.whatsapp_number : result.fieldErrors;
    };
    // wa.me needs the country code first: the same mobile, however it was typed.
    expect(stored("40722123456")).toBe("40722123456");
    expect(stored("0722123456")).toBe("40722123456");
    expect(stored(" 0722123456 ")).toBe("40722123456");
    expect(stored("0040722123456")).toBe("40722123456");
    expect(stored("722123456")).toBe("40722123456");
    // A foreign number is read as international first, so it keeps its own country.
    expect(stored("447911123456")).toBe("447911123456");
    // Empty stays empty: it hides the buttons.
    expect(stored("")).toBe("");
  });

  it("refuses a WhatsApp value that is not digits only, or is no real number in either reading", () => {
    for (const value of [
      "+40722123456",
      "0722 123 456",
      "1234567",
      "12345678",
      "123456789012345",
      "1234567890123456",
      "072212345",
      "abc",
    ]) {
      expect(parseSettingsForm(formFor({ ...SEED_SETTINGS, whatsapp_number: value }))).toEqual({
        ok: false,
        fieldErrors: { whatsapp_number: SETTINGS_MESSAGES.digits },
      });
    }
  });

  it("takes „Telefon” as a valid number written with digits, spaces and + . - ( ), and stores it as typed", () => {
    for (const value of [
      "0722 123 456",
      "+40 722 123 456",
      "(+40) 722 123 456",
      "0040 722 123 456",
      "0256 123 456",
      "(0256) 123-456",
      "0722.123.456",
      "+44 7911 123456",
      // Pasted with no-break spaces: telHref drops every kind of space.
      "0722 123 456",
    ]) {
      const result = parseSettingsForm(formFor({ ...SEED_SETTINGS, phone_public: ` ${value} ` }));
      expect(result.ok && result.data.phone_public).toBe(value);
    }
    for (const value of [
      "sunați după 9",
      "0722 123 456 / 0733 111 222",
      // libphonenumber alone finds the number inside these two; the tel: link would carry the rest.
      "Tel: 0722 123 456",
      "0722 123 456 (Alex)",
      "0722 123 456 0733 111 222",
      "0722 123 45",
      "0722",
    ]) {
      expect(parseSettingsForm(formFor({ ...SEED_SETTINGS, phone_public: value }))).toEqual({
        ok: false,
        fieldErrors: { phone_public: SETTINGS_MESSAGES.phone },
      });
    }
    // The public forms' wording (FORM_MESSAGES.phone).
    expect(SETTINGS_MESSAGES.phone).toBe("Scrie un număr de telefon valid.");
  });

  it("refuses a „Telefon” that only libphonenumber's repairs make valid: the tel: link dials what was typed", () => {
    for (const value of [
      // The country code without „+” or „00”: the format the WhatsApp hint shows, one field below.
      "40722123456",
      "40 722 123 456",
      // No leading 0.
      "722 123 456",
      // The 0 kept after the country code.
      "+40 (0) 722 123 456",
      "+40 0722 123 456",
      // A „+” anywhere but in front.
      "+40722123456+",
    ]) {
      expect(parseSettingsForm(formFor({ ...SEED_SETTINGS, phone_public: value }))).toEqual({
        ok: false,
        fieldErrors: { phone_public: SETTINGS_MESSAGES.phone },
      });
    }
  });

  it("takes „Email” as one well-formed address, and stores it as typed", () => {
    for (const value of ["contact@atelier.ro", "Contact.Atelier+site@Atelier.ro"]) {
      const result = parseSettingsForm(formFor({ ...SEED_SETTINGS, email_public: ` ${value} ` }));
      expect(result.ok && result.data.email_public).toBe(value);
    }
    for (const value of [
      "nu avem",
      "contact@atelier",
      "contact @atelier.ro",
      "a@b.ro, c@d.ro",
      "mailto:contact@atelier.ro",
    ]) {
      expect(parseSettingsForm(formFor({ ...SEED_SETTINGS, email_public: value }))).toEqual({
        ok: false,
        fieldErrors: { email_public: ADMIN_MESSAGES.email },
      });
    }
  });

  it("lets a „Telefon” or „Email” that still carries „[” through untouched: it is the placeholder", () => {
    const values = { phone_public: "[07xx xxx xxx]", email_public: "[contact@domeniu.ro]" };
    expect(values).toEqual({ phone_public: SEED_SETTINGS.phone_public, email_public: SEED_SETTINGS.email_public });
    const seed = parseSettingsForm(formFor({ ...SEED_SETTINGS, ...values }));
    expect(seed.ok && seed.data).toMatchObject(values);

    // Any text with „[” counts, as on the site and in the launch gate, not only the seed's own.
    const own = { phone_public: "[telefonul atelierului]", email_public: "[adresa de email]" };
    const result = parseSettingsForm(formFor({ ...SEED_SETTINGS, ...own }));
    expect(result.ok && result.data).toMatchObject(own);
  });

  it("takes the workshop photo as empty or a PhotoField path in the site folder", () => {
    for (const value of ["", "site/atelier-1792569508760.webp", " site/atelier-1792569508760.webp "]) {
      const result = parseSettingsForm(formFor({ ...SEED_SETTINGS, atelier_photo_path: value }));
      expect(result.ok && result.data.atelier_photo_path).toBe(value.trim());
    }
    for (const value of [
      "materials/ct-verde-1792569508760.webp",
      "bases/lamele-1792569508760.webp",
      "site/atelier.webp",
      "https://example.supabase.co/storage/v1/object/public/media/site/atelier-1792569508760.webp",
      "../site/atelier-1792569508760.webp",
      "nu",
    ]) {
      expect(parseSettingsForm(formFor({ ...SEED_SETTINGS, atelier_photo_path: value }))).toEqual({
        ok: false,
        fieldErrors: { atelier_photo_path: SETTINGS_MESSAGES.photo },
      });
    }
  });

  it("drops the photo field's `_before` input instead of storing it", () => {
    const fd = formFor({ ...SEED_SETTINGS, atelier_photo_path: "site/atelier-1792569508760.webp" });
    fd.set("atelier_photo_path_before", "site/atelier-1792569508000.webp");
    const result = parseSettingsForm(fd);
    expect(result.ok).toBe(true);
    expect(result.ok && Object.keys(result.data)).not.toContain("atelier_photo_path_before");
  });

  it("drops the fingerprint input instead of storing it", () => {
    const fd = formFor(SEED_SETTINGS);
    fd.set(SETTINGS_FINGERPRINT_FIELD, "a".repeat(64));
    const result = parseSettingsForm(fd);
    expect(result.ok && result.data).toEqual(SEED_SETTINGS);
  });

  it("bounds every text by its kind", () => {
    const ok = parseSettingsForm(
      formFor({
        ...SEED_SETTINGS,
        workshop_name: "a".repeat(SETTINGS_MAX.text),
        story_text: "b".repeat(SETTINGS_MAX.textarea),
      }),
    );
    expect(ok.ok).toBe(true);

    const tooLong = parseSettingsForm(
      formFor({
        ...SEED_SETTINGS,
        workshop_name: "a".repeat(SETTINGS_MAX.text + 1),
        story_text: "b".repeat(SETTINGS_MAX.textarea + 1),
        instagram_url: `https://x.ro/${"c".repeat(SETTINGS_MAX.url)}`,
        phone_public: `[${"d".repeat(SETTINGS_MAX.phone)}]`,
        email_public: `${"e".repeat(SETTINGS_MAX.email)}@atelier.ro`,
      }),
    );
    expect(tooLong).toEqual({
      ok: false,
      fieldErrors: {
        workshop_name: ADMIN_MESSAGES.tooLong,
        story_text: ADMIN_MESSAGES.tooLong,
        instagram_url: ADMIN_MESSAGES.tooLong,
        phone_public: ADMIN_MESSAGES.tooLong,
        email_public: ADMIN_MESSAGES.tooLong,
      },
    });
    expect(field("workshop_name").maxLength).toBe(SETTINGS_MAX.text);
  });

  it("refuses a post that leaves a text field out", () => {
    const fd = formFor(SEED_SETTINGS);
    fd.delete("city");
    expect(parseSettingsForm(fd)).toEqual({ ok: false, fieldErrors: { city: ADMIN_MESSAGES.required } });
  });

  it("skips React's $ACTION entries and keeps the first value per field", () => {
    const fd = formFor(SEED_SETTINGS);
    fd.set("$ACTION_ID_abc", "x");
    fd.append("city", "a doua valoare");
    const result = parseSettingsForm(fd);
    expect(result.ok && result.data.city).toBe(SEED_SETTINGS.city);
    expect(result.ok && Object.keys(result.data)).not.toContain("$ACTION_ID_abc");
  });
});
