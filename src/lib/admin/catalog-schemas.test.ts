// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ADMIN_MESSAGES } from "@/lib/admin/types";
import {
  CATALOG_MESSAGES,
  CATALOG_ROW_ID,
  parseBaseForm,
  parseFamilyForm,
  parseModelForm,
  rowId,
  SPEC_ROW_NUMBERS,
  SPEC_ROWS,
  specFieldNames,
  specsFromJson,
} from "./catalog-schemas";

function form(entries: Record<string, string | string[] | undefined>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => fd.append(key, v));
    else fd.set(key, value);
  }
  return fd;
}

const MODEL = { id: "capitonat", name: " Capitonat ", note: "Tapițat, cu nasturi", description: "  Textul cardului. ", active: "on", sort: "2" };

describe("rowId and CATALOG_ROW_ID", () => {
  it("accepts the catalogue ids and nothing else", () => {
    expect(rowId(form({ id: "capitonat" }))).toBe("capitonat");
    expect(rowId(form({ id: "ct-verde" }))).toBeNull();
    expect(rowId(form({ id: "Capitonat" }))).toBeNull();
    expect(rowId(form({ id: "" }))).toBeNull();
    expect(rowId(form({}))).toBeNull();
    expect(CATALOG_ROW_ID.test("lemn")).toBe(true);
    expect(CATALOG_ROW_ID.test("../x")).toBe(false);
  });
});

describe("parseModelForm", () => {
  it("trims the texts, stores an empty description as null, reads the checkbox and the sort, and dedupes the families", () => {
    const parsed = parseModelForm(form({ ...MODEL, families: ["catifea", "boucle", "catifea"] }));
    expect(parsed).toEqual({
      ok: true,
      data: {
        name: "Capitonat",
        note: "Tapițat, cu nasturi",
        description: "Textul cardului.",
        active: true,
        sort: 2,
        families: ["catifea", "boucle"],
      },
    });
  });

  it("reads an unticked checkbox as false and an empty description as null", () => {
    const parsed = parseModelForm(form({ ...MODEL, active: undefined, description: "", families: ["lemn"] }));
    expect(parsed.ok && parsed.data.active).toBe(false);
    expect(parsed.ok && parsed.data.description).toBeNull();
  });

  it("refuses an empty name or note, a long text and a bad sort, with one message per field", () => {
    const parsed = parseModelForm(
      form({ ...MODEL, name: "  ", note: "x".repeat(121), description: "y".repeat(1001), sort: "7.5", families: ["catifea"] }),
    );
    expect(parsed).toEqual({
      ok: false,
      fieldErrors: {
        name: ADMIN_MESSAGES.required,
        note: ADMIN_MESSAGES.tooLong,
        description: ADMIN_MESSAGES.tooLong,
        sort: ADMIN_MESSAGES.invalid,
      },
    });
  });

  it("refuses a missing field and a sort out of range", () => {
    expect(parseModelForm(form({ ...MODEL, note: undefined, sort: "1000", families: ["catifea"] }))).toEqual({
      ok: false,
      fieldErrors: { note: ADMIN_MESSAGES.required, sort: ADMIN_MESSAGES.invalid },
    });
    expect(parseModelForm(form({ ...MODEL, sort: "-1", families: ["catifea"] }))).toEqual({
      ok: false,
      fieldErrors: { sort: ADMIN_MESSAGES.invalid },
    });
  });

  it("needs at least one family and refuses a value that is not a family id", () => {
    expect(parseModelForm(form(MODEL))).toEqual({ ok: false, fieldErrors: { families: CATALOG_MESSAGES.noFamily } });
    expect(parseModelForm(form({ ...MODEL, families: ["catifea", "Boucle!"] }))).toEqual({
      ok: false,
      fieldErrors: { families: ADMIN_MESSAGES.invalid },
    });
  });
});

describe("parseFamilyForm", () => {
  const FAMILY = { id: "catifea", name: " Catifea ", description: "Moale." };

  it("posts SPEC_ROWS rows as spec_k_n / spec_v_n", () => {
    expect(SPEC_ROWS).toBe(6);
    expect(SPEC_ROW_NUMBERS).toEqual([1, 2, 3, 4, 5, 6]);
    expect(specFieldNames(3)).toEqual({ k: "spec_k_3", v: "spec_v_3" });
  });

  it("keeps the filled rows in order, trimmed, and drops the empty ones", () => {
    const parsed = parseFamilyForm(
      form({
        ...FAMILY,
        spec_k_1: " Compoziție ",
        spec_v_1: "100% poliester ",
        spec_k_2: "",
        spec_v_2: "",
        spec_k_4: "Animale",
        spec_v_4: "potrivit",
        spec_k_6: " ",
        spec_v_6: " ",
      }),
    );
    expect(parsed).toEqual({
      ok: true,
      data: {
        name: "Catifea",
        description: "Moale.",
        specs: [
          { k: "Compoziție", v: "100% poliester" },
          { k: "Animale", v: "potrivit" },
        ],
      },
    });
  });

  it("accepts no rows at all and an empty description", () => {
    expect(parseFamilyForm(form({ ...FAMILY, description: "" }))).toEqual({
      ok: true,
      data: { name: "Catifea", description: null, specs: [] },
    });
  });

  it("refuses a row with only one side filled", () => {
    expect(parseFamilyForm(form({ ...FAMILY, spec_k_2: "Frecare", spec_v_2: "" }))).toEqual({
      ok: false,
      fieldErrors: { specs: CATALOG_MESSAGES.specs },
    });
    expect(parseFamilyForm(form({ ...FAMILY, spec_v_5: "40.000 cicluri" }))).toEqual({
      ok: false,
      fieldErrors: { specs: CATALOG_MESSAGES.specs },
    });
  });

  it("refuses a specification side over 80 characters, under the specs field", () => {
    expect(parseFamilyForm(form({ ...FAMILY, spec_k_1: "Frecare", spec_v_1: "x".repeat(81) }))).toEqual({
      ok: false,
      fieldErrors: { specs: ADMIN_MESSAGES.tooLong },
    });
  });

  it("refuses an empty name and a long description, and ignores a posted tab", () => {
    const parsed = parseFamilyForm(form({ ...FAMILY, name: "", description: "d".repeat(1001), tab: "lemn" }));
    expect(parsed).toEqual({ ok: false, fieldErrors: { name: ADMIN_MESSAGES.required, description: ADMIN_MESSAGES.tooLong } });
    const ok = parseFamilyForm(form({ ...FAMILY, tab: "lemn", code: "XX" }));
    expect(ok.ok && Object.keys(ok.data)).toEqual(["name", "description", "specs"]);
  });
});

describe("parseBaseForm", () => {
  const BASE = { id: "lemn", name: "Picioare din lemn", note: " Stejar, 12 cm ", active: "on", sort: "0" };

  it("reads name, note, active and sort", () => {
    expect(parseBaseForm(form(BASE))).toEqual({
      ok: true,
      data: { name: "Picioare din lemn", note: "Stejar, 12 cm", active: true, sort: 0 },
    });
    expect(parseBaseForm(form({ ...BASE, active: undefined, sort: "12" }))).toEqual({
      ok: true,
      data: { name: "Picioare din lemn", note: "Stejar, 12 cm", active: false, sort: 12 },
    });
  });

  it("refuses an empty note, a long name and a non-numeric sort", () => {
    expect(parseBaseForm(form({ ...BASE, name: "n".repeat(81), note: "", sort: "abc" }))).toEqual({
      ok: false,
      fieldErrors: { name: ADMIN_MESSAGES.tooLong, note: ADMIN_MESSAGES.required, sort: ADMIN_MESSAGES.invalid },
    });
  });
});

describe("specsFromJson", () => {
  it("reads an array of {k, v} strings", () => {
    expect(specsFromJson([{ k: "Frecare", v: "40.000" }, { k: "Animale", v: "da" }])).toEqual([
      { k: "Frecare", v: "40.000" },
      { k: "Animale", v: "da" },
    ]);
    expect(specsFromJson([])).toEqual([]);
  });

  it("gives [] for anything else, including one bad row", () => {
    expect(specsFromJson(null)).toEqual([]);
    expect(specsFromJson("x")).toEqual([]);
    expect(specsFromJson({ k: "a", v: "b" })).toEqual([]);
    expect(specsFromJson([{ k: "a", v: 1 }])).toEqual([]);
    expect(specsFromJson([{ k: "a", v: "b" }, null])).toEqual([]);
    expect(specsFromJson([{ k: "a", v: "b" }, ["c"]])).toEqual([]);
  });
});
