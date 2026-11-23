// @vitest-environment node
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { SEED_CATALOG, SIZES } from "@/lib/configurator/catalog.seed";
import { LEI_FLOOR as PANEL_LEI_FLOOR, PRICING_MESSAGES, pricingSchema } from "@/lib/configurator/pricing-schema";
import {
  catalogSql,
  COLUMNS,
  fillTemplate,
  HEADERS,
  migrationFileNames,
  numberText,
  parseWorkbook,
  pricingParams,
  pricingSql,
  SHEET_ORDER,
  SHEETS,
  sheetsFromWorkbook,
  sqlString,
  yesNo,
  type ImportedCatalog,
  LEI_FLOOR,
} from "./catalog-workbook";

// ───────────── Helpers on an in-memory workbook ─────────────

type Sheet = ExcelJS.Worksheet;

function template(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  fillTemplate(workbook);
  return workbook;
}

function sheet(workbook: ExcelJS.Workbook, name: string): Sheet {
  const ws = workbook.getWorksheet(name);
  if (!ws) throw new Error(`no sheet ${name}`);
  return ws;
}

const textAt = (ws: Sheet, row: number, column: number) => ws.getRow(row).getCell(column).text;

/** The 1-based row whose first cells are `prefix` (a table's header row). */
function headerRow(ws: Sheet, prefix: readonly string[]): number {
  for (let n = 1; n <= ws.rowCount; n += 1) {
    if (prefix.every((h, i) => textAt(ws, n, i + 1) === h)) return n;
  }
  throw new Error(`no header ${prefix.join(" | ")} on ${ws.name}`);
}

function columnOf(ws: Sheet, header: number, name: string): number {
  for (let c = 1; c <= ws.getRow(header).cellCount; c += 1) {
    if (textAt(ws, header, c) === name) return c;
  }
  throw new Error(`no column ${name} on ${ws.name}`);
}

/** The first row after `header` whose cells start with `match`. */
function rowOf(ws: Sheet, header: number, match: readonly string[]): number {
  for (let n = header + 1; n <= ws.rowCount; n += 1) {
    if (match.every((m, i) => textAt(ws, n, i + 1) === m)) return n;
  }
  throw new Error(`no row ${match.join(" | ")} on ${ws.name}`);
}

/** Sets one cell of a table: the row matched by its first cells, the column by its header. */
function put(ws: Sheet, prefix: readonly string[], match: readonly string[], column: string, value: string | number): void {
  const header = headerRow(ws, prefix);
  ws.getCell(rowOf(ws, header, match), columnOf(ws, header, column)).value = value;
}

/** Appends a row to a table: the first row after the header whose first cell is empty. */
function append(ws: Sheet, prefix: readonly string[], values: readonly (string | number)[]): number {
  let n = headerRow(ws, prefix) + 1;
  while (textAt(ws, n, 1) !== "") n += 1;
  values.forEach((value, i) => {
    if (value !== "") ws.getCell(n, i + 1).value = value;
  });
  return n;
}

function putParam(ws: Sheet, key: string, value: string | number): void {
  const header = headerRow(ws, HEADERS.params);
  const keyColumn = columnOf(ws, header, COLUMNS.key);
  const valueColumn = columnOf(ws, header, COLUMNS.value);
  for (let n = header + 1; n <= ws.rowCount; n += 1) {
    if (textAt(ws, n, keyColumn) === key) {
      ws.getCell(n, valueColumn).value = value;
      return;
    }
  }
  throw new Error(`no parameter ${key}`);
}

const PARAMS: Record<string, number> = {
  "categoryPct.A": 0,
  "categoryPct.B": 10,
  "categoryPct.C": 20,
  "hbPct.100": 0,
  "hbPct.120": 5,
  "hbPct.140": 10,
  "base.lemn": 0,
  "base.metal": 100,
  "base.lada": 900,
  "base.sertare": 700,
  "extras.led": 250,
  "extras.nightstands": 800,
  customPct: 15,
  roundTo: 50,
};

/** The least a workshop must fill for the import to pass: a category per colour, a 160 price per model, every parameter. */
function complete(workbook: ExcelJS.Workbook): ExcelJS.Workbook {
  const materials = sheet(workbook, SHEETS.materials);
  const header = headerRow(materials, HEADERS.colors);
  const category = columnOf(materials, header, COLUMNS.category);
  for (let n = header + 1; n <= materials.rowCount; n += 1) {
    if (textAt(materials, n, 1)) materials.getCell(n, category).value = "A";
  }
  const pricing = sheet(workbook, SHEETS.pricing);
  for (const model of SEED_CATALOG.models) put(pricing, HEADERS.grid, [model.id], "160", 3000);
  for (const [key, value] of Object.entries(PARAMS)) putParam(pricing, key, value);
  return workbook;
}

const parse = (workbook: ExcelJS.Workbook) => parseWorkbook(sheetsFromWorkbook(workbook));

function expectOk(workbook: ExcelJS.Workbook): ImportedCatalog {
  const outcome = parse(workbook);
  if (!outcome.ok) throw new Error(`unexpected errors:\n${outcome.errors.join("\n")}`);
  return outcome.catalog;
}

function expectErrors(workbook: ExcelJS.Workbook): string[] {
  const outcome = parse(workbook);
  if (outcome.ok) throw new Error("expected errors, got a catalogue");
  return outcome.errors;
}

/** The workshop's filled workbook of the happy path, built once per test. */
function filled(): ExcelJS.Workbook {
  const workbook = complete(template());
  const models = sheet(workbook, SHEETS.models);
  put(models, HEADERS.models, ["capitonat"], COLUMNS.description, "Tăblia clasică, cu nasturi.");
  put(models, HEADERS.models, ["arcuit"], COLUMNS.modelNote, "Linie curbă");

  const bases = sheet(workbook, SHEETS.bases);
  put(bases, HEADERS.bases, ["lemn"], COLUMNS.baseNote, "Stejar, 12 cm");
  put(bases, HEADERS.bases, ["metal"], COLUMNS.baseNote, "Oțel vopsit negru 'mat', 12 cm");

  const materials = sheet(workbook, SHEETS.materials);
  put(materials, HEADERS.families, ["catifea"], COLUMNS.description, "Catifea de bumbac, țesută în Italia.");
  put(materials, HEADERS.specs, ["catifea", "Compoziție"], COLUMNS.value, "100% poliester");
  put(materials, HEADERS.specs, ["catifea", "Frecare"], COLUMNS.value, "40.000 cicluri Martindale");
  put(materials, HEADERS.colors, ["catifea", "Verde sticlă"], COLUMNS.category, "B");
  put(materials, HEADERS.colors, ["catifea", "Verde sticlă"], COLUMNS.supplier, "Furnizor, colecția Velluto");
  put(materials, HEADERS.colors, ["catifea", "Verde sticlă"], COLUMNS.supplierCode, "VL-204");
  append(materials, HEADERS.colors, ["catifea", "Verde smarald", "", "VL-310", "Furnizor X", "#1a5e3a", "C", "da"]);

  const rules = sheet(workbook, SHEETS.rules);
  put(rules, HEADERS.rules, ["capitonat"], "Bouclé", "nu");

  const pricing = sheet(workbook, SHEETS.pricing);
  put(pricing, HEADERS.grid, ["capitonat"], "160", 3450);
  put(pricing, HEADERS.grid, ["capitonat"], "180", "3 900");
  put(pricing, HEADERS.grid, ["arcuit"], "160", "3450,50");
  put(pricing, HEADERS.grid, ["lamele"], "160", "");
  return workbook;
}

// ───────────── The template ─────────────

describe("fillTemplate", () => {
  it("writes the nine sheets of LISTA-ATELIER §8, in order", () => {
    expect(template().worksheets.map((ws) => ws.name)).toEqual(SHEET_ORDER);
    expect(SHEET_ORDER).toEqual(["Modele", "Dimensiuni", "Tăblii", "Baze", "Materiale", "Opționale", "Reguli", "Prețuri", "Termene"]);
  });

  it("pre-fills the closed sets and leaves every price, text and supplier cell empty", () => {
    const data = sheetsFromWorkbook(template());
    const rowsAfter = (name: string, prefix: readonly string[]) => {
      const grid = data.get(name)!;
      const start = grid.findIndex((row) => prefix.every((h, i) => row[i] === h));
      expect(start, `${name}: ${prefix[0]}`).toBeGreaterThan(0);
      return grid.slice(start + 1).filter((row) => row.some((cell) => cell));
    };

    const models = rowsAfter(SHEETS.models, HEADERS.models);
    expect(models).toEqual(SEED_CATALOG.models.map((m) => [m.id, m.name]));

    const bases = rowsAfter(SHEETS.bases, HEADERS.bases);
    expect(bases).toEqual(SEED_CATALOG.bases.map((b) => [b.id, b.name]));

    const sizes = rowsAfter(SHEETS.sizes, HEADERS.sizes).map((row) => row.slice(0, 3));
    expect(sizes).toEqual([...SIZES.map((w) => ["Standard", w, "200"]), ["Nestandard, minim", "80", "180"], ["Nestandard, maxim", "220", "220"]]);

    expect(rowsAfter(SHEETS.headboards, HEADERS.headboards)).toEqual([["100"], ["120"], ["140"]]);

    const families = rowsAfter(SHEETS.materials, HEADERS.families).slice(0, 5);
    expect(families).toEqual(SEED_CATALOG.families.map((f) => [f.id, f.name]));

    const colors = rowsAfter(SHEETS.materials, HEADERS.colors);
    expect(colors).toHaveLength(24);
    expect(colors[0]).toEqual(["catifea", "Verde sticlă", "CT01", "", "", "#2F4B3C", "", "da"]);
    expect(colors[23]).toEqual(["lemn", "Negru mat", "LM05", "", "", "#262626", "", "nu"]);
    for (const row of colors) {
      expect(row[3], "supplier code").toBe("");
      expect(row[4], "supplier").toBe("");
      expect(row[6], "category").toBe("");
    }

    const rules = rowsAfter(SHEETS.rules, HEADERS.rules);
    // Row 3 of the sheet is the header: the two fixed columns, then one per family.
    expect(data.get(SHEETS.rules)![2]).toEqual([...HEADERS.rules, ...SEED_CATALOG.families.map((f) => f.name)]);
    expect(rules).toEqual(
      SEED_CATALOG.models.map((m) => [m.id, m.name, ...SEED_CATALOG.families.map((f) => (m.families.includes(f.id) ? "da" : "nu"))]),
    );

    const grid = rowsAfter(SHEETS.pricing, HEADERS.grid).slice(0, 4);
    expect(grid).toEqual(SEED_CATALOG.models.map((m) => [m.id, m.name]));
    const params = rowsAfter(SHEETS.pricing, HEADERS.params);
    expect(params.map((row) => row[1])).toEqual(pricingParams().map((p) => p.key));
    expect(params.map((row) => row[0])).toEqual(pricingParams().map((p) => p.label));
    for (const row of params) expect(row[2], row[1]).toBe("");

    expect(rowsAfter(SHEETS.extras, HEADERS.extras).map((row) => row[0])).toEqual(["led", "nightstands"]);
    expect(rowsAfter(SHEETS.leadTimes, HEADERS.leadTimes).map((row) => row[0])).toEqual(["standard", "nestandard", "materiale la comandă"]);
  });

  it("offers da/nu and A/B/C drop-downs where a closed value goes", () => {
    const workbook = template();
    const materials = sheet(workbook, SHEETS.materials);
    const header = headerRow(materials, HEADERS.colors);
    const category = materials.getCell(header + 1, columnOf(materials, header, COLUMNS.category)).dataValidation;
    expect(category).toMatchObject({ type: "list", formulae: ['"A,B,C"'] });
    // The same list well below the last pre-filled row, where new colours go.
    expect(materials.getCell(header + 100, columnOf(materials, header, COLUMNS.category)).dataValidation).toMatchObject({ type: "list" });
    const rules = sheet(workbook, SHEETS.rules);
    const rulesHeader = headerRow(rules, HEADERS.rules);
    expect(rules.getCell(rulesHeader + 1, 3).dataValidation).toMatchObject({ type: "list", formulae: ['"da,nu"'] });
  });

  it("says under the price grid what an empty cell does, and nowhere that an empty width is not offered", () => {
    // An empty cell does not take a width out of the configurator: the bed is still
    // priced, from another cell of the row (estimatePrice): the next filled width or,
    // with none wider, the widest filled one. No note may tell the workshop to leave
    // empty the widths it does not make. The sentence is the one above the grid of
    // /admin/preturi (PRICING_MESSAGES.grid).
    const data = sheetsFromWorkbook(template());
    /** Row 2 of a sheet: the note under its first table's title. */
    const note = (name: string) => data.get(name)![1][0];
    const emptyCell =
      "O celulă goală nu scoate lățimea din configurator: patul ia prețul următoarei lățimi completate sau, dacă nu e niciuna mai lată, al celei mai late completate.";
    expect(note(SHEETS.pricing)).toContain("fără punct la mii (3450, nu 3.450)");
    expect(note(SHEETS.pricing)).toContain(emptyCell);
    expect(PRICING_MESSAGES.grid.endsWith(emptyCell)).toBe(true);
    for (const [name, grid] of data) {
      for (const row of grid) for (const text of row) expect(text, name).not.toMatch(/nu le oferiți/);
    }
  });
});

// ───────────── Reading ─────────────

describe("sheetsFromWorkbook", () => {
  it("reads numbers as plain text and empty cells as empty strings", () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("T");
    ws.getCell(1, 1).value = 3450;
    ws.getCell(1, 3).value = " text ";
    ws.getCell(2, 2).value = 0.5;
    expect(sheetsFromWorkbook(workbook).get("T")).toEqual([
      ["3450", "", "text"],
      ["", "0.5"],
    ]);
  });
});

describe("yesNo / numberText", () => {
  it("accepts the hurried spellings and refuses the rest", () => {
    expect(yesNo("da")).toBe(true);
    expect(yesNo(" DA ")).toBe(true);
    expect(yesNo("x")).toBe(true);
    expect(yesNo("nu")).toBe(false);
    expect(yesNo("")).toBe(false);
    expect(yesNo("poate")).toBeNull();
  });

  it("normalises spaces and a decimal comma, nothing else", () => {
    expect(numberText("3 450")).toBe("3450");
    expect(numberText("3450,50")).toBe("3450.50");
    expect(numberText("3.450")).toBe("3.450");
    expect(numberText("abc")).toBe("abc");
  });
});

// ───────────── Parsing: the happy path ─────────────

describe("parseWorkbook", () => {
  it("carries the filled cells, allocates the next code to a new colour and validates the grid", () => {
    const catalog = expectOk(filled());

    // The pre-filled names travel as the sheet carries them; the empty cells carry nothing.
    expect(catalog.models).toEqual([
      { id: "capitonat", name: "Capitonat", note: undefined, description: "Tăblia clasică, cu nasturi." },
      { id: "arcuit", name: "Arcuit", note: "Linie curbă", description: undefined },
      { id: "canale", name: "Canale", note: undefined, description: undefined },
      { id: "lamele", name: "Lamele", note: undefined, description: undefined },
    ]);
    expect(catalog.bases.find((b) => b.id === "lemn")).toEqual({ id: "lemn", name: "Picioare din lemn", note: "Stejar, 12 cm" });

    const catifea = catalog.families.find((f) => f.id === "catifea");
    expect(catifea).toEqual({
      id: "catifea",
      name: "Catifea",
      description: "Catifea de bumbac, țesută în Italia.",
      specs: [
        { k: "Compoziție", v: "100% poliester" },
        { k: "Frecare", v: "40.000 cicluri Martindale" },
      ],
    });
    // Nothing filled for boucle: its specs and description stay as they are.
    expect(catalog.families.find((f) => f.id === "boucle")).toEqual({ id: "boucle", name: "Bouclé", description: undefined });

    expect(catalog.materials).toHaveLength(25);
    expect(catalog.materials[0]).toEqual({
      id: "ct-verde",
      familyId: "catifea",
      name: "Verde sticlă",
      code: "CT01",
      hex: "#2F4B3C",
      supplier: "Furnizor, colecția Velluto",
      supplierCode: "VL-204",
      priceCategory: "B",
      featured: true,
      sort: 0,
      isNew: false,
    });
    const added = catalog.materials.find((m) => m.isNew);
    expect(added).toEqual({
      id: "ct-verde-smarald",
      familyId: "catifea",
      name: "Verde smarald",
      code: "CT07",
      hex: "#1A5E3A",
      supplier: "Furnizor X",
      supplierCode: "VL-310",
      priceCategory: "C",
      featured: true,
      sort: 6,
      isNew: true,
    });
    expect(catalog.materials.filter((m) => m.familyId === "lemn").map((m) => m.sort)).toEqual([0, 1, 2, 3, 4]);

    expect(catalog.rules).toEqual({
      capitonat: ["catifea", "stofa", "piele"],
      arcuit: ["catifea", "boucle", "stofa", "piele"],
      canale: ["catifea", "boucle", "stofa", "piele"],
      lamele: ["lemn"],
    });

    expect(catalog.pricing.grid).toEqual({
      capitonat: { "160": 3450, "180": 3900 },
      arcuit: { "160": 3450.5 },
      canale: { "160": 3000 },
      lamele: {},
    });
    expect(catalog.pricing).toMatchObject({
      categoryPct: { A: 0, B: 10, C: 20 },
      hbPct: { "100": 0, "120": 5, "140": 10 },
      base: { lemn: 0, metal: 100, lada: 900, sertare: 700 },
      extras: { led: 250, nightstands: 800 },
      customPct: 15,
      roundTo: 50,
    });
    expect(() => pricingSchema.parse(catalog.pricing)).not.toThrow();
    expect(catalog.warnings).toEqual(["Modelul „lamele” nu are niciun preț în grilă: pe site nu va avea preț."]);
  });

  it("refuses a lei price under the floor, the thousands-separator slip", () => {
    const workbook = filled();
    put(sheet(workbook, SHEETS.pricing), HEADERS.grid, ["capitonat"], "160", "3.450");
    const errors = expectErrors(workbook);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`sub ${LEI_FLOOR} lei`);
    expect(errors[0]).toContain("Capitonat × 160 cm: 3.45");
  });

  it("shares that floor with the Prețuri form and holds a base amount to it too", () => {
    // One constant (pricing-schema.ts), so a grid price is refused by the import exactly when
    // /admin/preturi refuses it. A base is held to the floor only here; the panel refuses a
    // base for the typed shape of the slip alone (fieldsUnderLeiFloor). Both refuse „1.200”.
    expect(LEI_FLOOR).toBe(PANEL_LEI_FLOOR);
    const workbook = filled();
    putParam(sheet(workbook, SHEETS.pricing), "base.lada", "1.200");
    const errors = expectErrors(workbook);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`sub ${LEI_FLOOR} lei`);
    expect(errors[0]).toContain("Ladă de depozitare: 1.2");
  });

  it("never reuses the code of a colour whose row was removed from the sheet", () => {
    const workbook = complete(template());
    const materials = sheet(workbook, SHEETS.materials);
    const header = headerRow(materials, HEADERS.colors);
    materials.spliceRows(rowOf(materials, header, ["catifea", "Cărămiziu"]), 1);
    append(materials, HEADERS.colors, ["catifea", "Teracotă", "", "", "", "#B0613F", "A", "nu"]);
    const catalog = expectOk(workbook);
    const codes = catalog.materials.filter((m) => m.familyId === "catifea").map((m) => m.code);
    expect(codes).toEqual(["CT01", "CT02", "CT03", "CT04", "CT05", "CT07"]);
    expect(catalog.materials.find((m) => m.code === "CT07")).toMatchObject({ id: "ct-teracota", isNew: true });
  });

  it("keeps a code the workshop wrote itself, when it belongs to the family and is unique", () => {
    const workbook = complete(template());
    append(sheet(workbook, SHEETS.materials), HEADERS.colors, ["boucle", "Scoică", "bc09", "", "", "#D9CFC1", "B", "nu"]);
    const catalog = expectOk(workbook);
    expect(catalog.materials.find((m) => m.name === "Scoică")).toMatchObject({ code: "BC09", id: "bc-scoica", isNew: false });
  });

  it("reads a family column of Reguli by its id as well as its name", () => {
    const workbook = complete(template());
    const rules = sheet(workbook, SHEETS.rules);
    const header = headerRow(rules, HEADERS.rules);
    rules.getCell(header, columnOf(rules, header, "Catifea")).value = "catifea";
    expect(expectOk(workbook).rules.capitonat).toEqual(["catifea", "boucle", "stofa", "piele"]);
  });

  it("warns about a family with no colour in the sheet instead of refusing", () => {
    const workbook = complete(template());
    const materials = sheet(workbook, SHEETS.materials);
    const header = headerRow(materials, HEADERS.colors);
    const first = rowOf(materials, header, ["piele"]);
    materials.spliceRows(first, 4);
    expect(expectOk(workbook).warnings).toContain("Familia „piele” nu are nicio culoare în foaia „Materiale”: culorile ei de acum rămân cum sunt.");
  });
});

// ───────────── Parsing: every validation error ─────────────

describe("parseWorkbook refuses", () => {
  const cases: [string, (workbook: ExcelJS.Workbook) => void, string][] = [
    [
      "a missing sheet",
      (wb) => wb.removeWorksheet(sheet(wb, SHEETS.rules).id),
      "Foaia „Reguli”: lipsește foaia.",
    ],
    [
      "a missing column",
      (wb) => {
        const ws = sheet(wb, SHEETS.materials);
        const header = headerRow(ws, HEADERS.colors);
        ws.getCell(header, columnOf(ws, header, COLUMNS.category)).value = "Categorie";
      },
      "Foaia „Materiale”: lipsește coloana „Categorie de preț (A/B/C)”.",
    ],
    [
      "an unknown model id",
      (wb) => put(sheet(wb, SHEETS.models), HEADERS.models, ["capitonat"], COLUMNS.id, "rotund"),
      "Foaia „Modele”, rândul 4: modelul „rotund” nu există în configurator (capitonat, arcuit, canale, lamele).",
    ],
    [
      "an unknown family id on a colour",
      (wb) => put(sheet(wb, SHEETS.materials), HEADERS.colors, ["catifea", "Verde sticlă"], COLUMNS.familyId, "matase"),
      "Foaia „Materiale”, rândul 37: familia „matase” nu există în configurator (catifea, boucle, stofa, piele, lemn).",
    ],
    [
      "an unknown family id on a specification",
      (wb) => put(sheet(wb, SHEETS.materials), HEADERS.specs, ["lemn", "Esențe"], COLUMNS.familyId, "lemn-masiv"),
      "Foaia „Materiale”, rândul 29: familia „lemn-masiv” nu există în configurator",
    ],
    [
      "an unknown base id",
      (wb) => put(sheet(wb, SHEETS.bases), HEADERS.bases, ["lada"], COLUMNS.id, "picioare"),
      "Foaia „Baze”, rândul 6: baza „picioare” nu există în configurator (lemn, metal, lada, sertare).",
    ],
    [
      "a wrong price category",
      (wb) => put(sheet(wb, SHEETS.materials), HEADERS.colors, ["catifea", "Bleumarin"], COLUMNS.category, "D"),
      "Foaia „Materiale”, rândul 38: categoria de preț „D” nu e A, B sau C.",
    ],
    [
      "a missing price category",
      (wb) => put(sheet(wb, SHEETS.materials), HEADERS.colors, ["catifea", "Bleumarin"], COLUMNS.category, ""),
      "Foaia „Materiale”, rândul 38: categoria de preț lipsește (A, B sau C).",
    ],
    [
      "a colour that is not #RRGGBB",
      (wb) => put(sheet(wb, SHEETS.materials), HEADERS.colors, ["catifea", "Bleumarin"], COLUMNS.hex, "verde"),
      "Foaia „Materiale”, rândul 38: „Culoare (#RRGGBB)”: Scrie culoarea ca #RRGGBB.",
    ],
    [
      "a new colour without a colour value",
      (wb) => append(sheet(wb, SHEETS.materials), HEADERS.colors, ["stofa", "Oliv", "", "", "", "", "A", "nu"]),
      "Foaia „Materiale”, rândul 61: „Culoare (#RRGGBB)”: Scrie culoarea ca #RRGGBB.",
    ],
    [
      "a colour without a name",
      (wb) => put(sheet(wb, SHEETS.materials), HEADERS.colors, ["catifea", "Bleumarin"], COLUMNS.colorName, ""),
      "Foaia „Materiale”, rândul 38: „Nume culoare”: Completează acest câmp.",
    ],
    [
      "a code of another family",
      (wb) => put(sheet(wb, SHEETS.materials), HEADERS.colors, ["catifea", "Bleumarin"], COLUMNS.code, "BC01"),
      "Foaia „Materiale”, rândul 38: codul „BC01” nu e al familiei catifea (CT01, CT02…).",
    ],
    [
      "a code used twice",
      (wb) => put(sheet(wb, SHEETS.materials), HEADERS.colors, ["catifea", "Bleumarin"], COLUMNS.code, "CT01"),
      "Foaia „Materiale”, rândul 38: codul „CT01” apare de două ori.",
    ],
    [
      "a family with more than six specifications",
      (wb) => {
        const ws = sheet(wb, SHEETS.materials);
        for (const spec of ["Compoziție", "Frecare", "Întreținere", "Animale"]) put(ws, HEADERS.specs, ["stofa", spec], COLUMNS.value, "x");
        for (let i = 0; i < 3; i += 1) {
          const header = headerRow(ws, HEADERS.specs);
          const last = rowOf(ws, header, ["lemn", "Proveniență"]);
          ws.insertRow(last + 1, ["stofa", `Extra ${i}`, "y"]);
        }
      },
      "Foaia „Materiale”: familia „stofa” are 7 specificații completate; cel mult 6.",
    ],
    [
      "a specification value without a name",
      (wb) => {
        const ws = sheet(wb, SHEETS.materials);
        put(ws, HEADERS.specs, ["piele", "Grosime"], COLUMNS.spec, "");
        ws.getCell(26, 3).value = "1,2 mm";
      },
      "Foaia „Materiale”, rândul 26: „Specificație” lipsește.",
    ],
    [
      "a text over the admin's limit",
      (wb) => put(sheet(wb, SHEETS.models), HEADERS.models, ["canale"], COLUMNS.name, "C".repeat(81)),
      "Foaia „Modele”, rândul 6: „Nume”: Textul e prea lung. (cel mult 80 de caractere).",
    ],
    [
      "a price that is not a number",
      (wb) => put(sheet(wb, SHEETS.pricing), HEADERS.grid, ["capitonat"], "160", "trei mii"),
      "Foaia „Prețuri”: Capitonat × 160 cm (grid.capitonat.160): Scrie un număr.",
    ],
    [
      "a grid price of zero",
      (wb) => put(sheet(wb, SHEETS.pricing), HEADERS.grid, ["arcuit"], "140", 0),
      "Foaia „Prețuri”: Arcuit × 140 cm (grid.arcuit.140): Scrie un număr mai mare ca zero.",
    ],
    [
      "a parameter left empty",
      (wb) => putParam(sheet(wb, SHEETS.pricing), "hbPct.100", ""),
      "Foaia „Prețuri”: Adaos tăblie 100 cm (hbPct.100): Scrie un număr.",
    ],
    [
      "a rounding step of zero",
      (wb) => putParam(sheet(wb, SHEETS.pricing), "roundTo", 0),
      "Foaia „Prețuri”: Rotunjire (roundTo): Scrie un număr mai mare ca zero.",
    ],
    [
      "a parameter key it does not know",
      (wb) => {
        const ws = sheet(wb, SHEETS.pricing);
        const header = headerRow(ws, HEADERS.params);
        ws.getCell(rowOf(ws, header, ["Rotunjire"]), columnOf(ws, header, COLUMNS.key)).value = "rounding";
      },
      "Foaia „Prețuri”, rândul 25: cheia „rounding” nu e cunoscută",
    ],
    [
      "an unknown model in the grid",
      (wb) => put(sheet(wb, SHEETS.pricing), HEADERS.grid, ["lamele"], COLUMNS.modelId, "lamelle"),
      "Foaia „Prețuri”, rândul 7: modelul „lamelle” nu există în configurator",
    ],
    [
      "a rule column that names no family",
      (wb) => {
        const ws = sheet(wb, SHEETS.rules);
        const header = headerRow(ws, HEADERS.rules);
        ws.getCell(header, columnOf(ws, header, "Catifea")).value = "Mătase";
      },
      "Foaia „Reguli”: coloana „Mătase” nu e o familie de materiale (Catifea, Bouclé, Stofă, Piele ecologică, Lemn masiv).",
    ],
    [
      "a rule column that is missing",
      (wb) => {
        const ws = sheet(wb, SHEETS.rules);
        const header = headerRow(ws, HEADERS.rules);
        ws.getCell(header, columnOf(ws, header, "Catifea")).value = "Mătase";
      },
      "Foaia „Reguli”: lipsește coloana familiei „Catifea”.",
    ],
    [
      "a rule cell that is neither da nor nu",
      (wb) => put(sheet(wb, SHEETS.rules), HEADERS.rules, ["capitonat"], "Catifea", "poate"),
      "Foaia „Reguli”, rândul 4: coloana „Catifea”: scrieți da sau nu, nu „poate”.",
    ],
    [
      "a model left with no family",
      (wb) => put(sheet(wb, SHEETS.rules), HEADERS.rules, ["lamele"], "Lemn masiv", "nu"),
      "Foaia „Reguli”, rândul 7: modelul „lamele” nu are nicio familie permisă; are nevoie de cel puțin un „da”.",
    ],
    [
      "a model missing from the rules",
      (wb) => {
        const ws = sheet(wb, SHEETS.rules);
        ws.spliceRows(rowOf(ws, headerRow(ws, HEADERS.rules), ["lamele"]), 1);
      },
      "Foaia „Reguli”: lipsește rândul modelului „lamele”.",
    ],
    [
      "a rule row naming an unknown model",
      (wb) => put(sheet(wb, SHEETS.rules), HEADERS.rules, ["canale"], COLUMNS.modelId, "canal"),
      "Foaia „Reguli”, rândul 6: modelul „canal” nu există în configurator (capitonat, arcuit, canale, lamele).",
    ],
  ];

  it.each(cases)("%s", (_name, mutate, message) => {
    const workbook = complete(template());
    mutate(workbook);
    const errors = expectErrors(workbook);
    expect(errors.some((error) => error.includes(message)), errors.join("\n")).toBe(true);
  });

  it("lists every problem at once", () => {
    const workbook = complete(template());
    put(sheet(workbook, SHEETS.materials), HEADERS.colors, ["catifea", "Bleumarin"], COLUMNS.category, "D");
    put(sheet(workbook, SHEETS.pricing), HEADERS.grid, ["capitonat"], "160", "trei mii");
    put(sheet(workbook, SHEETS.rules), HEADERS.rules, ["lamele"], "Lemn masiv", "nu");
    const errors = expectErrors(workbook);
    expect(errors).toHaveLength(3);
  });
});

// ───────────── SQL ─────────────

describe("sqlString", () => {
  it("doubles the quotes and drops NUL", () => {
    expect(sqlString("L'Atelier")).toBe("'L''Atelier'");
    expect(sqlString("a\u0000b")).toBe("'ab'");
    expect(sqlString("")).toBe("''");
  });
});

describe("catalogSql", () => {
  const meta = { source: "05-catalog.xlsx", generatedAt: new Date("2026-11-23T09:21:05Z") };

  it("writes idempotent statements for what was filled, with every text escaped", () => {
    const sql = catalogSql(expectOk(filled()), meta);

    expect(sql).toContain("-- Catalogue from 05-catalog.xlsx, generated 2026-11-23T09:21:05.000Z by");
    expect(sql).toContain("update public.models set name = 'Capitonat', description = 'Tăblia clasică, cu nasturi.' where id = 'capitonat';");
    expect(sql).toContain("update public.models set name = 'Arcuit', note = 'Linie curbă' where id = 'arcuit';");
    // Nothing but the pre-filled name for canale: an idempotent no-op, never a null over the current text.
    expect(sql).toContain("update public.models set name = 'Canale' where id = 'canale';");
    expect(sql).toContain(
      `update public.material_families set name = 'Catifea', description = 'Catifea de bumbac, țesută în Italia.', specs = '[{"k":"Compoziție","v":"100% poliester"},{"k":"Frecare","v":"40.000 cicluri Martindale"}]'::jsonb where id = 'catifea';`,
    );
    expect(sql).toContain("update public.material_families set name = 'Bouclé' where id = 'boucle';");
    expect(sql).not.toContain("description = null");
    expect(sql).not.toContain("specs = null");
    expect(sql).toContain(
      "  values ('ct-verde', 'catifea', 'Verde sticlă', 'CT01', '#2F4B3C', 'Furnizor, colecția Velluto', 'VL-204', 'B', true, true, 0)",
    );
    expect(sql).toContain("  values ('ct-verde-smarald', 'catifea', 'Verde smarald', 'CT07', '#1A5E3A', 'Furnizor X', 'VL-310', 'C', true, true, 6)");
    expect(sql).toContain("  values ('ct-bleumarin', 'catifea', 'Bleumarin', 'CT02', '#1F2A44', null, null, 'A', false, true, 1)");
    expect(sql).toContain(
      "insert into public.materials as m (id, family_id, name, code, hex, supplier, supplier_code, price_category, featured, active, sort)",
    );
    expect(sql).toContain(
      "insert into public.model_families (model_id, family_id) values ('capitonat', 'catifea'), ('capitonat', 'stofa'), ('capitonat', 'piele') on conflict do nothing;",
    );
    expect(sql).toContain("delete from public.model_families where model_id = 'capitonat' and family_id not in ('catifea', 'stofa', 'piele');");
    expect(sql).toContain("delete from public.model_families where model_id = 'lamele' and family_id not in ('lemn');");
    expect(sql).toContain("update public.bases set name = 'Picioare din lemn', note = 'Stejar, 12 cm' where id = 'lemn';");
    expect(sql).toContain("update public.bases set name = 'Picioare metalice', note = 'Oțel vopsit negru ''mat'', 12 cm' where id = 'metal';");
    expect((sql.match(/insert into public.materials/g) ?? []).length).toBe(25);
  });

  it("guards the codes it allocated before anything is written, and only those", () => {
    // The sheet was filled from a catalogue /admin may have changed since: a new colour's
    // code or id held by another row aborts the migration instead of renaming that colour.
    // A row holding both is this colour from an earlier run: the file stays re-runnable.
    const sql = catalogSql(expectOk(filled()), meta);
    expect(sql).toContain(
      [
        "do $$",
        "begin",
        "  if exists (select 1 from public.materials where (code = 'CT07' or id = 'ct-verde-smarald') and not (code = 'CT07' and id = 'ct-verde-smarald')) then",
        "    raise exception 'materials: CT07 or ct-verde-smarald belongs to another colour; the catalogue changed since the sheet was filled (compare the row with /admin/catalog)';",
        "  end if;",
        "end $$;",
      ].join("\n"),
    );
    expect(sql.indexOf("do $$")).toBeLessThan(sql.indexOf("update public.models"));
    expect((sql.match(/raise exception/g) ?? []).length).toBe(1);

    // Nothing new in the sheet: no guard. A code the workshop wrote itself is upserted by code, not guarded.
    expect(catalogSql(expectOk(complete(template())), meta)).not.toContain("do $$");
    const own = complete(template());
    append(sheet(own, SHEETS.materials), HEADERS.colors, ["boucle", "Scoică", "bc09", "", "", "#D9CFC1", "B", "nu"]);
    expect(catalogSql(expectOk(own), meta)).not.toContain("do $$");
  });

  it("keeps an existing colour's active flag, and its supplier where the sheet's cell is empty", () => {
    const sql = catalogSql(expectOk(filled()), meta);
    expect(sql).toContain(
      [
        "  on conflict (code) do update set name = excluded.name, hex = excluded.hex,",
        "    supplier = coalesce(excluded.supplier, m.supplier), supplier_code = coalesce(excluded.supplier_code, m.supplier_code),",
        "    price_category = excluded.price_category, featured = excluded.featured, sort = excluded.sort;",
      ].join("\n"),
    );
    // A colour no longer offered is deactivated in /admin and stays in the sheet (the note above
    // „Culori”): `active` is written on insert only, so a re-import does not bring it back.
    expect(sql).not.toMatch(/do update set[^;]*active/);
  });
});

describe("pricingSql", () => {
  it("upserts the grid as /admin/preturi does, with JSON the schema accepts", () => {
    const { pricing } = expectOk(filled());
    const sql = pricingSql(pricing, { source: "05-catalog.xlsx", generatedAt: new Date("2026-11-23T09:21:05Z") });
    expect(sql).toContain("insert into public.pricing (id, data, updated_at) values (1, '");
    expect(sql).toContain("'::jsonb, now())\n  on conflict (id) do update set data = excluded.data, updated_at = now();");
    const json = /values \(1, '(.*)'::jsonb/.exec(sql)?.[1];
    expect(json).toBeDefined();
    expect(pricingSchema.parse(JSON.parse(json!.replace(/''/g, "'")))).toEqual(pricing);
  });
});

describe("migrationFileNames", () => {
  it("names the two files as db-change does, the prices one second after the catalogue", () => {
    expect(migrationFileNames(new Date("2026-11-23T09:21:05Z"))).toEqual({
      catalog: "20261123092105_catalog_from_excel.sql",
      pricing: "20261123092106_pricing.sql",
    });
  });
});
