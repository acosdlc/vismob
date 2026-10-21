import { describe, expect, it } from "vitest";
import { SEED_SETTINGS, type Settings } from "@/lib/data/settings.seed";
import { SETTINGS_FIELDS, SETTINGS_MAX } from "./settings-fields";
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

  it("accepts empty texts, trims the rest and reads the checkbox", () => {
    const empty = Object.fromEntries(
      SETTINGS_FIELDS.map((f) => [f.key, f.kind === "boolean" ? true : ""]),
    ) as Record<keyof Settings, string | boolean>;
    const result = parseSettingsForm(formFor({ ...empty, workshop_name: "  Atelierul  ", whatsapp_number: " 40722123456 " }));
    expect(result).toEqual({
      ok: true,
      data: { ...Object.fromEntries(SETTINGS_FIELDS.map((f) => [f.key, ""])), show_prices: true, workshop_name: "Atelierul", whatsapp_number: "40722123456" },
    });
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

  it("takes the WhatsApp number as 8 to 15 digits without +, or empty", () => {
    for (const value of ["", "40722123456", "12345678", "123456789012345"]) {
      expect(parseSettingsForm(formFor({ ...SEED_SETTINGS, whatsapp_number: value })).ok).toBe(true);
    }
    for (const value of ["+40722123456", "0722 123 456", "1234567", "1234567890123456", "abc"]) {
      expect(parseSettingsForm(formFor({ ...SEED_SETTINGS, whatsapp_number: value }))).toEqual({
        ok: false,
        fieldErrors: { whatsapp_number: SETTINGS_MESSAGES.digits },
      });
    }
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
      }),
    );
    expect(tooLong).toEqual({
      ok: false,
      fieldErrors: {
        workshop_name: ADMIN_MESSAGES.tooLong,
        story_text: ADMIN_MESSAGES.tooLong,
        instagram_url: ADMIN_MESSAGES.tooLong,
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
