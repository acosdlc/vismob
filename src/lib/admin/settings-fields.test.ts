import { describe, expect, it } from "vitest";
import { SEED_SETTINGS } from "@/lib/data/settings.seed";
import { SETTINGS_FIELDS, SETTINGS_GROUPS, SETTINGS_MAX } from "./settings-fields";

const CEDILLA = /[şţŞŢ]/;

describe("SETTINGS_FIELDS", () => {
  it("covers every Settings key exactly once", () => {
    const keys = SETTINGS_FIELDS.map((field) => field.key);
    expect([...keys].sort()).toEqual(Object.keys(SEED_SETTINGS).sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("is the groups flattened, in the seed's order", () => {
    expect(SETTINGS_FIELDS).toEqual(SETTINGS_GROUPS.flatMap((group) => group.fields));
    expect(SETTINGS_GROUPS.map((group) => group.title)).toEqual([
      "Firmă și contact",
      "Promisiuni și termeni",
      "Prețuri",
      "Atelier",
      "Pagina Materiale",
    ]);
    expect(SETTINGS_FIELDS[0].key).toBe("workshop_name");
    expect(SETTINGS_FIELDS.at(-1)?.key).toBe("oil_refresh_interval");
  });

  it("marks as boolean exactly the keys the seed holds as booleans", () => {
    const booleanKeys = Object.entries(SEED_SETTINGS)
      .filter(([, value]) => typeof value === "boolean")
      .map(([key]) => key)
      .sort();
    const booleanFields = SETTINGS_FIELDS.filter((field) => field.kind === "boolean")
      .map((field) => field.key)
      .sort();
    expect(booleanFields).toEqual(booleanKeys);
    expect(booleanFields).toEqual(["show_prices"]);
  });

  it("gives the special kinds to the keys PLAN names", () => {
    const kind = (key: string) => SETTINGS_FIELDS.find((field) => field.key === key)?.kind;
    expect(kind("whatsapp_number")).toBe("digits");
    for (const key of ["instagram_url", "facebook_url", "google_profile_url"]) expect(kind(key)).toBe("url");
    for (const key of [
      "story_text",
      "delivery_note",
      "mattresses_note",
      "structure_text",
      "slats_text",
      "foam_text",
      "fabrics_text",
      "registered_office",
      "address",
      "hours",
    ]) {
      expect(kind(key)).toBe("textarea");
    }
    expect(kind("workshop_name")).toBe("text");
  });

  it("bounds every field by its kind and keeps the texts in Romanian with comma-below diacritics", () => {
    for (const field of SETTINGS_FIELDS) {
      expect(field.maxLength).toBe(SETTINGS_MAX[field.kind]);
      expect(field.label.length).toBeGreaterThan(0);
      expect(field.label).not.toMatch(CEDILLA);
      if (field.hint) expect(field.hint).not.toMatch(CEDILLA);
    }
    for (const group of SETTINGS_GROUPS) expect(group.title).not.toMatch(CEDILLA);
  });
});
