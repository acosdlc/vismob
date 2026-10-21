// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ADMIN_MESSAGES } from "./types";
import {
  MATERIAL_MESSAGES,
  materialIdFor,
  nextMaterialCode,
  parseMaterialForm,
  PRICE_CATEGORIES,
  SLUG_MAX,
  slugify,
} from "./materials";

/** A full, valid post of the form; a test overrides what it checks. */
function form(overrides: Record<string, string | undefined> = {}): FormData {
  const values: Record<string, string | undefined> = {
    family_id: "catifea",
    name: "Verde sticlă",
    hex: "#2f4b3c",
    supplier: "Textil SRL",
    supplier_code: "VS-220",
    price_category: "B",
    featured: "on",
    active: "on",
    sort: "7",
    ...overrides,
  };
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) fd.set(key, value);
  }
  return fd;
}

describe("slugify", () => {
  it("lowercases and strips the Romanian diacritics, comma-below and cedilla alike", () => {
    expect(slugify("Verde sticlă")).toBe("verde-sticla");
    expect(slugify("Muștar")).toBe("mustar");
    expect(slugify("Țesătură Înaltă")).toBe("tesatura-inalta");
    expect(slugify("Aşa Ţel")).toBe("asa-tel");
    expect(slugify("Cărămiziu")).toBe("caramiziu");
  });

  it("turns every run of other characters into one dash and trims the ends", () => {
    expect(slugify("  Roz   pudrat!  ")).toBe("roz-pudrat");
    expect(slugify("--Gri / perlă (mat)--")).toBe("gri-perla-mat");
    expect(slugify("Bleu-marin")).toBe("bleu-marin");
  });

  it("keeps digits and is empty when nothing is a letter or a digit", () => {
    expect(slugify("Nuanța 2024")).toBe("nuanta-2024");
    expect(slugify("***")).toBe("");
    expect(slugify("")).toBe("");
  });

  it("stops at SLUG_MAX characters without a trailing dash", () => {
    const slug = slugify("a".repeat(39) + " b");
    expect(slug).toBe("a".repeat(39));
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(slugify("x".repeat(60))).toHaveLength(SLUG_MAX);
  });
});

describe("materialIdFor", () => {
  it("joins the family code in lowercase and the slug of the name", () => {
    expect(materialIdFor("CT", "Verde sticlă", [])).toBe("ct-verde-sticla");
    expect(materialIdFor("LM", "Stejar natur", ["ct-verde-sticla"])).toBe("lm-stejar-natur");
  });

  it("appends -2, -3… while the id is taken", () => {
    expect(materialIdFor("CT", "Verde", ["ct-verde"])).toBe("ct-verde-2");
    expect(materialIdFor("CT", "Verde", ["ct-verde", "ct-verde-2"])).toBe("ct-verde-3");
    expect(materialIdFor("CT", "Verde", ["ct-verde", "ct-verde-3"])).toBe("ct-verde-2");
  });

  it("falls back to a generic slug when nothing of the name survives", () => {
    expect(materialIdFor("CT", "***", [])).toBe("ct-material");
    expect(materialIdFor("CT", "***", ["ct-material"])).toBe("ct-material-2");
  });
});

describe("nextMaterialCode", () => {
  it("starts at 01 and continues after the highest number of the family", () => {
    expect(nextMaterialCode("CT", [])).toBe("CT01");
    expect(nextMaterialCode("CT", ["CT01", "CT02"])).toBe("CT03");
    expect(nextMaterialCode("CT", ["CT02", "CT01", "CT03"])).toBe("CT04");
  });

  it("never fills a gap: a number once assigned stays used", () => {
    expect(nextMaterialCode("CT", ["CT01", "CT05"])).toBe("CT06");
    expect(nextMaterialCode("CT", ["CT05"])).toBe("CT06");
  });

  it("ignores the codes of other families, including one whose code starts the same way", () => {
    expect(nextMaterialCode("CT", ["BC01", "BC02"])).toBe("CT01");
    expect(nextMaterialCode("C", ["CT01", "CT02", "C02"])).toBe("C03");
    expect(nextMaterialCode("C", ["CT01"])).toBe("C01");
    expect(nextMaterialCode("CT", ["CTX", "CT1a", "CT"])).toBe("CT01");
  });

  it("grows past two digits without truncating", () => {
    expect(nextMaterialCode("CT", ["CT99"])).toBe("CT100");
    expect(nextMaterialCode("CT", ["CT100"])).toBe("CT101");
  });
});

describe("parseMaterialForm", () => {
  it("accepts a full form, uppercases the hex and keeps the texts trimmed", () => {
    const result = parseMaterialForm(form({ name: "  Verde sticlă ", supplier: " Textil SRL " }));
    expect(result).toEqual({
      ok: true,
      data: {
        family_id: "catifea",
        name: "Verde sticlă",
        hex: "#2F4B3C",
        supplier: "Textil SRL",
        supplier_code: "VS-220",
        price_category: "B",
        featured: true,
        active: true,
        sort: 7,
      },
    });
  });

  it("stores an empty supplier and supplier code as null, and unticked boxes as false", () => {
    const result = parseMaterialForm(form({ supplier: "", supplier_code: "  ", featured: undefined, active: undefined }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.supplier).toBeNull();
    expect(result.data.supplier_code).toBeNull();
    expect(result.data.featured).toBe(false);
    expect(result.data.active).toBe(false);
  });

  it("accepts a missing supplier and supplier code (a form without the inputs)", () => {
    const result = parseMaterialForm(form({ supplier: undefined, supplier_code: undefined }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.supplier).toBeNull();
    expect(result.data.supplier_code).toBeNull();
  });

  it("takes 0 for an empty or missing sort", () => {
    const empty = parseMaterialForm(form({ sort: "" }));
    expect(empty.ok && empty.data.sort).toBe(0);
    const missing = parseMaterialForm(form({ sort: undefined }));
    expect(missing.ok && missing.data.sort).toBe(0);
  });

  it("refuses a sort that is negative, fractional, above 999 or not a number", () => {
    for (const sort of ["-1", "1.5", "1000", "abc"]) {
      const result = parseMaterialForm(form({ sort }));
      expect(result).toEqual({ ok: false, fieldErrors: { sort: ADMIN_MESSAGES.invalid } });
    }
  });

  it("requires the family and the name, and bounds the name", () => {
    expect(parseMaterialForm(form({ family_id: "" }))).toEqual({
      ok: false,
      fieldErrors: { family_id: MATERIAL_MESSAGES.familyUnknown },
    });
    expect(parseMaterialForm(form({ family_id: undefined }))).toEqual({
      ok: false,
      fieldErrors: { family_id: MATERIAL_MESSAGES.familyUnknown },
    });
    expect(parseMaterialForm(form({ name: "   " }))).toEqual({ ok: false, fieldErrors: { name: ADMIN_MESSAGES.required } });
    expect(parseMaterialForm(form({ name: "x".repeat(81) }))).toEqual({ ok: false, fieldErrors: { name: ADMIN_MESSAGES.tooLong } });
  });

  it("refuses a colour that is not #RRGGBB", () => {
    for (const hex of ["2F4B3C", "#2F4B3", "#2F4B3CA", "#GGGGGG", "", "rgb(1,2,3)"]) {
      expect(parseMaterialForm(form({ hex }))).toEqual({ ok: false, fieldErrors: { hex: MATERIAL_MESSAGES.hex } });
    }
    expect(parseMaterialForm(form({ hex: undefined }))).toEqual({ ok: false, fieldErrors: { hex: MATERIAL_MESSAGES.hex } });
  });

  it("accepts only A, B or C as the price category", () => {
    for (const category of PRICE_CATEGORIES) {
      const result = parseMaterialForm(form({ price_category: category }));
      expect(result.ok && result.data.price_category).toBe(category);
    }
    expect(parseMaterialForm(form({ price_category: "D" }))).toEqual({
      ok: false,
      fieldErrors: { price_category: ADMIN_MESSAGES.invalid },
    });
    expect(parseMaterialForm(form({ price_category: undefined }))).toEqual({
      ok: false,
      fieldErrors: { price_category: ADMIN_MESSAGES.invalid },
    });
  });

  it("bounds the supplier texts", () => {
    expect(parseMaterialForm(form({ supplier: "x".repeat(121) }))).toEqual({
      ok: false,
      fieldErrors: { supplier: ADMIN_MESSAGES.tooLong },
    });
    expect(parseMaterialForm(form({ supplier_code: "x".repeat(61) }))).toEqual({
      ok: false,
      fieldErrors: { supplier_code: ADMIN_MESSAGES.tooLong },
    });
  });

  it("reports the first message per field, every invalid field at once", () => {
    const result = parseMaterialForm(form({ name: "", hex: "zzz", sort: "-3" }));
    expect(result).toEqual({
      ok: false,
      fieldErrors: { name: ADMIN_MESSAGES.required, hex: MATERIAL_MESSAGES.hex, sort: ADMIN_MESSAGES.invalid },
    });
  });
});
