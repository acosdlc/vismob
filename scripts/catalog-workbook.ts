// The shape of docs/atelier/05-catalog.xlsx, the workbook the workshop fills with its
// catalogue and prices (docs/LISTA-ATELIER.md §7–§8, docs/PLAN.md PR-11), and the
// logic the two scripts share: make-catalog-template.ts builds the workbook from the
// seed with fillTemplate(); import-catalog.ts reads a filled one with
// sheetsFromWorkbook() + parseWorkbook() and writes what catalogSql() and
// pricingSql() return. Pure: no file, network or database access (the scripts do
// the I/O, the tests use in-memory workbooks), and every validation that the admin
// already has is reused from src/lib (materialSchema, parsePricingForm,
// materialIdFor, nextMaterialCode), so the import can refuse nothing the admin
// accepts and accept nothing it refuses.
import type { Cell, Workbook, Worksheet } from "exceljs";
import { SPEC_ROWS } from "@/lib/admin/catalog-schemas";
import { materialIdFor, materialSchema, nextMaterialCode, PRICE_CATEGORIES } from "@/lib/admin/materials";
import { ADMIN_MESSAGES } from "@/lib/admin/types";
import { CUSTOM_L, CUSTOM_W, HEIGHTS, SEED_CATALOG, SIZES } from "@/lib/configurator/catalog.seed";
import type { Pricing } from "@/lib/configurator/pricing";
import {
  parsePricingForm,
  PRICING_BASE_IDS,
  PRICING_CATEGORIES,
  PRICING_FIELDS,
  PRICING_HEIGHTS,
  pricingSchema,
} from "@/lib/configurator/pricing-schema";
import type { BaseId, Catalog, FamilyId, ModelId, PriceCategory } from "@/lib/configurator/types";
import { zodFieldErrors } from "@/lib/validation/form-values";

// ───────────── The workbook ─────────────

/** Where the template lives in the repository; the workshop gets a copy to fill. */
export const TEMPLATE_PATH = "docs/atelier/05-catalog.xlsx";

/** The nine sheets of docs/LISTA-ATELIER.md §8, in the workbook's order. */
export const SHEETS = {
  models: "Modele",
  sizes: "Dimensiuni",
  headboards: "Tăblii",
  bases: "Baze",
  materials: "Materiale",
  extras: "Opționale",
  rules: "Reguli",
  pricing: "Prețuri",
  leadTimes: "Termene",
} as const;

export const SHEET_ORDER: readonly string[] = [
  SHEETS.models,
  SHEETS.sizes,
  SHEETS.headboards,
  SHEETS.bases,
  SHEETS.materials,
  SHEETS.extras,
  SHEETS.rules,
  SHEETS.pricing,
  SHEETS.leadTimes,
];

/**
 * Sheets the import reads nothing from: sizes, headboard heights and extras are
 * closed sets of the configurator (catalog.seed.ts), and the lead time shown on the
 * site is a settings key entered in /admin › Setări. They are in the workbook so the
 * workshop confirms them or asks for a change in „Observații”.
 */
export const INFORMATIONAL_SHEETS: readonly string[] = [SHEETS.sizes, SHEETS.headboards, SHEETS.extras, SHEETS.leadTimes];

/** The column names, fixed: the import finds a column by its header, not by its position. */
export const COLUMNS = {
  id: "ID",
  modelId: "ID model",
  familyId: "ID familie",
  name: "Nume",
  model: "Model",
  notes: "Observații",
  modelNote: "Notă scurtă",
  description: "Descriere",
  size: "Dimensiune",
  width: "Lățime (cm)",
  length: "Lungime (cm)",
  height: "Înălțime (cm)",
  baseNote: "Notă",
  spec: "Specificație",
  value: "Valoare",
  colorName: "Nume culoare",
  code: "Cod",
  supplierCode: "Cod furnizor",
  supplier: "Furnizor, colecție",
  hex: "Culoare (#RRGGBB)",
  category: "Categorie de preț (A/B/C)",
  featured: "Pe prima pagină (da/nu)",
  extra: "Opțional",
  parameter: "Parametru",
  key: "Cheie",
  unit: "Unitate",
  orderKind: "Tip de comandă",
  leadTime: "Termen de execuție",
} as const;

/** The header row of every table; `rules` continues with one column per material family. */
export const HEADERS = {
  models: [COLUMNS.id, COLUMNS.name, COLUMNS.modelNote, COLUMNS.description, COLUMNS.notes],
  sizes: [COLUMNS.size, COLUMNS.width, COLUMNS.length, COLUMNS.notes],
  headboards: [COLUMNS.height, COLUMNS.notes],
  bases: [COLUMNS.id, COLUMNS.name, COLUMNS.baseNote, COLUMNS.notes],
  families: [COLUMNS.familyId, COLUMNS.name, COLUMNS.description],
  specs: [COLUMNS.familyId, COLUMNS.spec, COLUMNS.value],
  colors: [
    COLUMNS.familyId,
    COLUMNS.colorName,
    COLUMNS.code,
    COLUMNS.supplierCode,
    COLUMNS.supplier,
    COLUMNS.hex,
    COLUMNS.category,
    COLUMNS.featured,
  ],
  extras: [COLUMNS.id, COLUMNS.extra, COLUMNS.description, COLUMNS.notes],
  rules: [COLUMNS.modelId, COLUMNS.model],
  grid: [COLUMNS.modelId, COLUMNS.model, ...SIZES],
  params: [COLUMNS.parameter, COLUMNS.key, COLUMNS.value, COLUMNS.unit],
  leadTimes: [COLUMNS.orderKind, COLUMNS.leadTime, COLUMNS.notes],
} as const satisfies Record<string, readonly string[]>;

/** The titles above each table; a title row ends the table before it. */
export const TITLES = {
  models: "Modele de tăblie",
  sizes: "Dimensiuni de saltea",
  headboards: "Înălțimi de tăblie",
  bases: "Picioare și baze",
  families: "Familii de materiale",
  specs: "Specificații pe familie",
  colors: "Culori",
  extras: "Opționale",
  rules: "Reguli: ce familie de materiale merge pe ce model",
  grid: "Preț de bază (lei), pe model și lățime, pentru 200 cm lungime",
  params: "Adaosuri și prețuri fixe",
  leadTimes: "Termene de execuție",
} as const;

/** The line under each title: how the table is filled. */
const NOTES = {
  models:
    "Cele patru modele sunt fixate în configurator (au desene și reguli în cod). Completați doar ce vreți să schimbați pe site; o celulă goală păstrează textul de acum. „Observații” nu apare pe site.",
  sizes:
    "Dimensiunile standard și limitele celor nestandard sunt fixate în configurator. Lățimile pe care nu le oferiți le lăsați fără preț în foaia „Prețuri”. Dacă vreți alte dimensiuni sau alte limite, scrieți la „Observații”.",
  headboards:
    "Cele trei înălțimi sunt fixate în configurator. Adaosul pe înălțime se scrie în foaia „Prețuri”. Dacă vreți alte înălțimi, scrieți la „Observații”.",
  bases:
    "Cele patru baze sunt fixate în configurator. „Notă” e textul scurt de sub nume (de exemplu esența și înălțimea picioarelor); o celulă goală păstrează textul de acum. Prețul fiecărei baze se scrie în foaia „Prețuri”.",
  families:
    "Cele cinci familii sunt fixate în configurator. „Descriere” e paragraful de pe pagina Materiale; o celulă goală păstrează textul de acum.",
  specs:
    "Tabelul de specificații al fiecărei familii, cel mult 6 rânduri pe familie. Rândurile cu „Valoare” completată înlocuiesc tabelul de pe site; o familie fără niciun rând completat rămâne cum e.",
  colors:
    "Un rând pentru fiecare culoare care se poate alege pe site, în ordinea în care vreți să apară. Rândurile existente au deja „Cod” și „Culoare”: nu le schimbați codul. Pentru o culoare nouă lăsați „Cod” gol (se dă automat) și scrieți culoarea aproximativă ca #RRGGBB (de exemplu #2F4B3C): până vin pozele, pe site apare un pătrat de acea culoare. „Categorie de preț” e obligatorie pe fiecare rând. O culoare pe care nu o mai oferiți se dezactivează din /admin, nu se șterge din foaie.",
  extras:
    "Cele două opționale sunt fixate în configurator, cu textele de mai jos. Prețul lor se scrie în foaia „Prețuri”. Alte opționale cer o modificare a configuratorului: scrieți-le la „Observații”.",
  rules:
    "Scrieți „da” sau „nu” în fiecare celulă; o celulă goală înseamnă „nu”. „nu” înseamnă că familia nu se poate alege la acel model (de exemplu: bouclé nu se face capitonat). Fiecare model are nevoie de cel puțin un „da”.",
  grid: "Numere, fără „lei” și fără punct la mii (3450, nu 3.450). Lăsați gol lățimile pe care nu le oferiți la acel model. Prețurile pot fi aproximative: pe site apar ca „preț orientativ”, iar prețul final îl dați voi în scris.",
  params:
    "Completați coloana „Valoare”: procentele ca numere (12, nu 12 %), prețurile în lei. „Rotunjire” e pasul la care se rotunjește prețul orientativ (de exemplu 50). Nu schimbați coloana „Cheie”.",
  leadTimes:
    "Nu se importă automat: termenul care apare pe site se scrie în /admin › Setări. Completați ce promiteți pentru fiecare tip de comandă.",
} as const;

/** The two extras of the configurator, as src/components/configurator/steps/StepExtras.tsx shows them (docs/PLAN.md, „Texts DESIGN leaves blank”). */
export const EXTRAS = [
  { id: "led", title: "LED sub pat", note: "Bandă de lumină discretă, sub cadru." },
  { id: "nightstands", title: "2 noptiere", note: "Asortate cu patul, în același material." },
] as const;

/** The order kinds of docs/LISTA-ATELIER.md §8, „Termene”. */
export const ORDER_KINDS = ["standard", "nestandard", "materiale la comandă"] as const;

export const YES = "da";
export const NO = "nu";

/** One row of the „Adaosuri și prețuri fixe” table: its label, its PRICING_FIELDS key and its unit. */
export interface PricingParam {
  label: string;
  key: string;
  unit: "%" | "lei";
}

/** The parameter rows of the Prețuri sheet, in the admin form's order (PRICING_FIELD_ORDER minus the grid). */
export function pricingParams(catalog: Catalog = SEED_CATALOG): PricingParam[] {
  const baseName = (id: BaseId) => catalog.bases.find((base) => base.id === id)?.name ?? id;
  return [
    ...PRICING_CATEGORIES.map((c): PricingParam => ({ label: `Adaos categorie de preț ${c}`, key: PRICING_FIELDS.categoryPct(c), unit: "%" })),
    ...PRICING_HEIGHTS.map((h): PricingParam => ({ label: `Adaos tăblie ${h} cm`, key: PRICING_FIELDS.hbPct(h), unit: "%" })),
    ...PRICING_BASE_IDS.map((b): PricingParam => ({ label: baseName(b), key: PRICING_FIELDS.base(b), unit: "lei" })),
    { label: EXTRAS[0].title, key: PRICING_FIELDS.extras.led, unit: "lei" },
    { label: EXTRAS[1].title, key: PRICING_FIELDS.extras.nightstands, unit: "lei" },
    { label: "Adaos dimensiune nestandard", key: PRICING_FIELDS.customPct, unit: "%" },
    { label: "Rotunjire", key: PRICING_FIELDS.roundTo, unit: "lei" },
  ];
}

// ───────────── Writing the template ─────────────

type CellValue = string | number;

interface TableSpec {
  title: string;
  note: string;
  headers: readonly string[];
  rows: readonly (readonly CellValue[])[];
  /** Drop-down lists on a column, from the first data row over `rows.length + spare` rows. */
  lists?: readonly { column: string; options: readonly string[]; spare?: number }[];
}

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E2D8" } } as const;
const NOTE_COLOR = { argb: "FF5C5C57" } as const;

/** Writes one sheet: for each table a title row, a note row, the header row and the rows, with a blank row between tables. */
function writeSheet(workbook: Workbook, name: string, tables: readonly TableSpec[], widths: readonly number[]): Worksheet {
  const ws = workbook.addWorksheet(name);
  widths.forEach((width, i) => {
    ws.getColumn(i + 1).width = width;
  });
  let r = 1;
  for (const table of tables) {
    const span = Math.max(table.headers.length, 2);
    ws.getCell(r, 1).value = table.title;
    ws.getCell(r, 1).font = { bold: true, size: 13 };
    r += 1;

    ws.mergeCells(r, 1, r, span);
    const note = ws.getCell(r, 1);
    note.value = table.note;
    note.font = { italic: true, color: NOTE_COLOR };
    note.alignment = { wrapText: true, vertical: "top" };
    // A merged cell gets no automatic height: estimate it from the text and the columns it spans.
    const chars = widths.slice(0, span).reduce((sum, w) => sum + w, 0) || 60;
    ws.getRow(r).height = 15 * Math.max(1, Math.ceil(table.note.length / Math.max(chars * 1.1, 40)));
    r += 1;

    const headerRow = r;
    table.headers.forEach((header, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = header;
      cell.font = { bold: true };
      cell.fill = HEADER_FILL;
      cell.alignment = { wrapText: true, vertical: "top" };
    });
    r += 1;

    for (const row of table.rows) {
      row.forEach((value, i) => {
        if (value !== "") ws.getCell(r, i + 1).value = value;
      });
      r += 1;
    }

    for (const list of table.lists ?? []) {
      const column = table.headers.indexOf(list.column) + 1;
      if (column === 0) continue;
      const last = headerRow + table.rows.length + (list.spare ?? 0);
      for (let i = headerRow + 1; i <= last; i += 1) {
        ws.getCell(i, column).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`"${list.options.join(",")}"`],
        };
      }
    }
    r += 1;
  }
  return ws;
}

/**
 * Fills an empty workbook with the nine sheets: the closed sets of the configurator
 * pre-filled from the catalogue (ids, names, codes, colours, the rules matrix, the
 * grid rows and the parameter keys), every price, text and supplier cell empty.
 */
export function fillTemplate(workbook: Workbook, catalog: Catalog = SEED_CATALOG): void {
  const params = pricingParams(catalog);
  const dash = (flag: boolean | undefined) => (flag ? YES : NO);

  writeSheet(
    workbook,
    SHEETS.models,
    [{ title: TITLES.models, note: NOTES.models, headers: HEADERS.models, rows: catalog.models.map((m) => [m.id, m.name, "", "", ""]) }],
    [14, 20, 28, 60, 40],
  );

  writeSheet(
    workbook,
    SHEETS.sizes,
    [
      {
        title: TITLES.sizes,
        note: NOTES.sizes,
        headers: HEADERS.sizes,
        rows: [
          ...SIZES.map((w) => ["Standard", Number(w), 200, ""]),
          ["Nestandard, minim", CUSTOM_W.min, CUSTOM_L.min, ""],
          ["Nestandard, maxim", CUSTOM_W.max, CUSTOM_L.max, ""],
        ],
      },
    ],
    [20, 14, 14, 50],
  );

  writeSheet(
    workbook,
    SHEETS.headboards,
    [{ title: TITLES.headboards, note: NOTES.headboards, headers: HEADERS.headboards, rows: HEIGHTS.map((h) => [h, ""]) }],
    [16, 50],
  );

  writeSheet(
    workbook,
    SHEETS.bases,
    [{ title: TITLES.bases, note: NOTES.bases, headers: HEADERS.bases, rows: catalog.bases.map((b) => [b.id, b.name, "", ""]) }],
    [12, 24, 40, 40],
  );

  writeSheet(
    workbook,
    SHEETS.materials,
    [
      { title: TITLES.families, note: NOTES.families, headers: HEADERS.families, rows: catalog.families.map((f) => [f.id, f.name, ""]) },
      {
        title: TITLES.specs,
        note: NOTES.specs,
        headers: HEADERS.specs,
        rows: catalog.families.flatMap((f) => (f.specs ?? []).map((spec) => [f.id, spec.k, ""])),
      },
      {
        title: TITLES.colors,
        note: NOTES.colors,
        headers: HEADERS.colors,
        rows: catalog.families.flatMap((f) => f.colors.map((c) => [f.id, c.name, c.code, "", "", c.hex, "", dash(c.featured)])),
        lists: [
          { column: COLUMNS.category, options: PRICE_CATEGORIES, spare: 200 },
          { column: COLUMNS.featured, options: [YES, NO], spare: 200 },
        ],
      },
    ],
    [12, 24, 10, 16, 28, 18, 24, 22],
  );

  writeSheet(
    workbook,
    SHEETS.extras,
    [{ title: TITLES.extras, note: NOTES.extras, headers: HEADERS.extras, rows: EXTRAS.map((e) => [e.id, e.title, e.note, ""]) }],
    [14, 16, 40, 40],
  );

  writeSheet(
    workbook,
    SHEETS.rules,
    [
      {
        title: TITLES.rules,
        note: NOTES.rules,
        headers: [...HEADERS.rules, ...catalog.families.map((f) => f.name)],
        rows: catalog.models.map((m) => [m.id, m.name, ...catalog.families.map((f) => dash(m.families.includes(f.id)))]),
        lists: catalog.families.map((f) => ({ column: f.name, options: [YES, NO] })),
      },
    ],
    [14, 16, ...catalog.families.map(() => 16)],
  );

  writeSheet(
    workbook,
    SHEETS.pricing,
    [
      {
        title: TITLES.grid,
        note: NOTES.grid,
        headers: HEADERS.grid,
        rows: catalog.models.map((m) => [m.id, m.name, ...SIZES.map(() => "")]),
      },
      {
        title: TITLES.params,
        note: NOTES.params,
        headers: HEADERS.params,
        rows: params.map((p) => [p.label, p.key, "", p.unit]),
      },
    ],
    [30, 22, 12, 12, 12, 12, 12, 12],
  );

  writeSheet(
    workbook,
    SHEETS.leadTimes,
    [{ title: TITLES.leadTimes, note: NOTES.leadTimes, headers: HEADERS.leadTimes, rows: ORDER_KINDS.map((k) => [k, "", ""]) }],
    [24, 24, 50],
  );
}

// ───────────── Reading a workbook ─────────────

/** A sheet as text: `grid[row][column]`, 0-based, every cell trimmed, "" where empty. */
export type Grid = string[][];
export type WorkbookData = Map<string, Grid>;

function cellText(cell: Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  try {
    return cell.text.trim();
  } catch {
    return String(value).trim();
  }
}

/** Every sheet of the workbook as text grids; what parseWorkbook() reads. */
export function sheetsFromWorkbook(workbook: Workbook): WorkbookData {
  const data: WorkbookData = new Map();
  for (const ws of workbook.worksheets) {
    const grid: Grid = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, c) => {
        cells[c - 1] = cellText(cell);
      });
      grid[n - 1] = cells;
    });
    for (let i = 0; i < grid.length; i += 1) {
      if (!grid[i]) grid[i] = [];
      for (let c = 0; c < grid[i].length; c += 1) grid[i][c] = grid[i][c] ?? "";
    }
    data.set(ws.name, grid);
  }
  return data;
}

interface TableRow {
  /** The sheet's row number, as Excel shows it. */
  n: number;
  cells: string[];
}

interface Table {
  columns: Map<string, number>;
  rows: TableRow[];
}

const startsWith = (row: readonly string[], prefix: readonly string[]) => prefix.every((h, i) => (row[i] ?? "") === h);

const TITLE_SET = new Set<string>(Object.values(TITLES));

/**
 * The table whose header row starts with `prefix`: its columns by header and its
 * non-empty rows, up to the next table's title or header row.
 */
function findTable(grid: Grid, prefix: readonly string[]): Table | null {
  const start = grid.findIndex((row) => startsWith(row, prefix));
  if (start < 0) return null;
  const columns = new Map<string, number>();
  grid[start].forEach((header, i) => {
    if (header && !columns.has(header)) columns.set(header, i);
  });
  const rows: TableRow[] = [];
  for (let i = start + 1; i < grid.length; i += 1) {
    const row = grid[i];
    if (TITLE_SET.has(row[0] ?? "")) break;
    if (Object.values(HEADERS).some((headers) => startsWith(row, headers.slice(0, 2)))) break;
    if (row.every((c) => !c)) continue;
    rows.push({ n: i + 1, cells: row });
  }
  return { columns, rows };
}

// ───────────── Parsing ─────────────

/** What the SQL will write; only the filled cells are carried (an empty text cell keeps the current value). */
export interface ImportedCatalog {
  models: { id: ModelId; name?: string; note?: string; description?: string }[];
  families: { id: FamilyId; name?: string; description?: string; specs?: { k: string; v: string }[] }[];
  materials: {
    id: string;
    familyId: FamilyId;
    name: string;
    code: string;
    hex: string;
    supplier: string | null;
    supplierCode: string | null;
    priceCategory: PriceCategory;
    featured: boolean;
    sort: number;
    /** The code was allocated by the import, not read from the sheet. */
    isNew: boolean;
  }[];
  /** The allowed families of every model (the Reguli matrix). */
  rules: Record<ModelId, FamilyId[]>;
  bases: { id: BaseId; name?: string; note?: string }[];
  pricing: Pricing;
  warnings: string[];
}

export type ParseOutcome = { ok: true; catalog: ImportedCatalog } | { ok: false; errors: string[] };

// The admin's limits (src/lib/admin/catalog-schemas.ts, materials.ts), so a text the
// import accepts can also be saved from /admin.
const LIMITS = { name: 80, note: 120, description: 1000, spec: 80 } as const;
/** Below this, a lei price in the sheet is read as a thousands-separator slip (see parsePricing). */
export const LEI_FLOOR = 100;

const MODEL_IDS: readonly ModelId[] = ["capitonat", "arcuit", "canale", "lamele"];
const FAMILY_IDS: readonly FamilyId[] = ["catifea", "boucle", "stofa", "piele", "lemn"];
const BASE_IDS: readonly BaseId[] = ["lemn", "metal", "lada", "sertare"];

const isModelId = (v: string): v is ModelId => (MODEL_IDS as readonly string[]).includes(v);
const isFamilyId = (v: string): v is FamilyId => (FAMILY_IDS as readonly string[]).includes(v);
const isBaseId = (v: string): v is BaseId => (BASE_IDS as readonly string[]).includes(v);
const isCategory = (v: string): v is PriceCategory => (PRICE_CATEGORIES as readonly string[]).includes(v);

/** "da" / "nu" and the spellings a hurried hand types; null for anything else. */
export function yesNo(text: string): boolean | null {
  const v = text.trim().toLowerCase();
  if (["da", "x", "1", "yes", "true", "✓"].includes(v)) return true;
  if (["nu", "-", "0", "no", "false", ""].includes(v)) return false;
  return null;
}

/** A number as the admin form takes it: spaces out, a decimal comma made a point ("3450,5" → "3450.5"). */
export function numberText(text: string): string {
  const v = text.replace(/[\s  ]/g, "");
  return /^\d+,\d+$/.test(v) ? v.replace(",", ".") : v;
}

class Problems {
  readonly errors: string[] = [];
  readonly warnings: string[] = [];

  sheet(sheet: string, message: string): void {
    this.errors.push(`Foaia „${sheet}”: ${message}`);
  }

  row(sheet: string, n: number, message: string): void {
    this.errors.push(`Foaia „${sheet}”, rândul ${n}: ${message}`);
  }

  warn(message: string): void {
    this.warnings.push(message);
  }
}

/** The table, or null with an error per missing sheet or column. */
function table(
  data: WorkbookData,
  sheet: string,
  headers: readonly string[],
  required: readonly string[],
  problems: Problems,
  prefixLength = 2,
): Table | null {
  const grid = data.get(sheet);
  if (!grid) {
    problems.sheet(sheet, "lipsește foaia.");
    return null;
  }
  const found = findTable(grid, headers.slice(0, prefixLength));
  if (!found) {
    problems.sheet(sheet, `nu am găsit tabelul „${headers.slice(0, prefixLength).join(" | ")}”.`);
    return null;
  }
  let complete = true;
  for (const header of required) {
    if (!found.columns.has(header)) {
      problems.sheet(sheet, `lipsește coloana „${header}”.`);
      complete = false;
    }
  }
  return complete ? found : null;
}

const cell = (row: TableRow, t: Table, header: string) => row.cells[t.columns.get(header) ?? -1] ?? "";

function text(problems: Problems, sheet: string, row: TableRow, value: string, label: string, max: number): string | undefined {
  if (!value) return undefined;
  if (value.length > max) {
    problems.row(sheet, row.n, `„${label}”: ${ADMIN_MESSAGES.tooLong} (cel mult ${max} de caractere).`);
    return undefined;
  }
  return value;
}

const known = (list: readonly string[]) => list.join(", ");

function parseModels(data: WorkbookData, problems: Problems): ImportedCatalog["models"] {
  const sheet = SHEETS.models;
  const t = table(data, sheet, HEADERS.models, [COLUMNS.id, COLUMNS.name, COLUMNS.modelNote, COLUMNS.description], problems);
  if (!t) return [];
  const out: ImportedCatalog["models"] = [];
  const seen = new Set<string>();
  for (const row of t.rows) {
    const id = cell(row, t, COLUMNS.id);
    if (!isModelId(id)) {
      problems.row(sheet, row.n, `modelul „${id}” nu există în configurator (${known(MODEL_IDS)}).`);
      continue;
    }
    if (seen.has(id)) {
      problems.row(sheet, row.n, `modelul „${id}” apare de două ori.`);
      continue;
    }
    seen.add(id);
    out.push({
      id,
      name: text(problems, sheet, row, cell(row, t, COLUMNS.name), COLUMNS.name, LIMITS.name),
      note: text(problems, sheet, row, cell(row, t, COLUMNS.modelNote), COLUMNS.modelNote, LIMITS.note),
      description: text(problems, sheet, row, cell(row, t, COLUMNS.description), COLUMNS.description, LIMITS.description),
    });
  }
  return out;
}

function parseBases(data: WorkbookData, problems: Problems): ImportedCatalog["bases"] {
  const sheet = SHEETS.bases;
  const t = table(data, sheet, HEADERS.bases, [COLUMNS.id, COLUMNS.name, COLUMNS.baseNote], problems);
  if (!t) return [];
  const out: ImportedCatalog["bases"] = [];
  const seen = new Set<string>();
  for (const row of t.rows) {
    const id = cell(row, t, COLUMNS.id);
    if (!isBaseId(id)) {
      problems.row(sheet, row.n, `baza „${id}” nu există în configurator (${known(BASE_IDS)}).`);
      continue;
    }
    if (seen.has(id)) {
      problems.row(sheet, row.n, `baza „${id}” apare de două ori.`);
      continue;
    }
    seen.add(id);
    out.push({
      id,
      name: text(problems, sheet, row, cell(row, t, COLUMNS.name), COLUMNS.name, LIMITS.name),
      note: text(problems, sheet, row, cell(row, t, COLUMNS.baseNote), COLUMNS.baseNote, LIMITS.note),
    });
  }
  return out;
}

function parseFamilies(data: WorkbookData, problems: Problems): ImportedCatalog["families"] {
  const sheet = SHEETS.materials;
  const out: ImportedCatalog["families"] = [];
  const byId = new Map<FamilyId, ImportedCatalog["families"][number]>();

  const families = table(data, sheet, HEADERS.families, [COLUMNS.familyId, COLUMNS.name, COLUMNS.description], problems);
  if (families) {
    for (const row of families.rows) {
      const id = cell(row, families, COLUMNS.familyId);
      if (!isFamilyId(id)) {
        problems.row(sheet, row.n, `familia „${id}” nu există în configurator (${known(FAMILY_IDS)}).`);
        continue;
      }
      if (byId.has(id)) {
        problems.row(sheet, row.n, `familia „${id}” apare de două ori.`);
        continue;
      }
      const family = {
        id,
        name: text(problems, sheet, row, cell(row, families, COLUMNS.name), COLUMNS.name, LIMITS.name),
        description: text(problems, sheet, row, cell(row, families, COLUMNS.description), COLUMNS.description, LIMITS.description),
      };
      byId.set(id, family);
      out.push(family);
    }
  }

  const specs = table(data, sheet, HEADERS.specs, [COLUMNS.familyId, COLUMNS.spec, COLUMNS.value], problems);
  if (specs) {
    const filled = new Map<FamilyId, { k: string; v: string }[]>();
    for (const row of specs.rows) {
      const id = cell(row, specs, COLUMNS.familyId);
      if (!isFamilyId(id)) {
        problems.row(sheet, row.n, `familia „${id}” nu există în configurator (${known(FAMILY_IDS)}).`);
        continue;
      }
      const v = text(problems, sheet, row, cell(row, specs, COLUMNS.value), COLUMNS.value, LIMITS.spec);
      if (!v) continue;
      const k = text(problems, sheet, row, cell(row, specs, COLUMNS.spec), COLUMNS.spec, LIMITS.spec);
      if (!k) {
        if (!cell(row, specs, COLUMNS.spec)) problems.row(sheet, row.n, `„${COLUMNS.spec}” lipsește.`);
        continue;
      }
      const list = filled.get(id) ?? [];
      list.push({ k, v });
      filled.set(id, list);
    }
    for (const [id, list] of filled) {
      if (list.length > SPEC_ROWS) {
        problems.sheet(sheet, `familia „${id}” are ${list.length} specificații completate; cel mult ${SPEC_ROWS}.`);
        continue;
      }
      const family = byId.get(id);
      if (family) family.specs = list;
      else {
        const added = { id, specs: list };
        byId.set(id, added);
        out.push(added);
      }
    }
  }
  return out;
}

const COLOR_FIELD_LABELS: Record<string, string> = {
  family_id: COLUMNS.familyId,
  name: COLUMNS.colorName,
  hex: COLUMNS.hex,
  supplier: COLUMNS.supplier,
  supplier_code: COLUMNS.supplierCode,
  price_category: COLUMNS.category,
};

function parseColors(data: WorkbookData, catalog: Catalog, problems: Problems): ImportedCatalog["materials"] {
  const sheet = SHEETS.materials;
  const t = table(
    data,
    sheet,
    HEADERS.colors,
    [COLUMNS.familyId, COLUMNS.colorName, COLUMNS.code, COLUMNS.supplierCode, COLUMNS.supplier, COLUMNS.hex, COLUMNS.category, COLUMNS.featured],
    problems,
  );
  if (!t) return [];

  // Codes are assigned once and never reused: the ones the catalogue already has count
  // even when their row was removed from the sheet, and so do the ids. `catalog` is the
  // one the sheet was filled from, not the live table: catalogSql() guards the allocated
  // codes and ids against that table before anything is written.
  const seedCodes = new Map<string, string>(); // code → id
  for (const family of catalog.families) for (const color of family.colors) seedCodes.set(color.code, color.id);
  const takenCodes = new Set(seedCodes.keys());
  const takenIds = new Set(seedCodes.values());
  const sheetCodes = new Set<string>();

  interface Pending {
    row: TableRow;
    familyId: FamilyId;
    familyCode: string;
    code: string;
    input: Record<string, string | undefined>;
    featured: boolean;
  }
  const pending: Pending[] = [];
  const perFamily = new Map<FamilyId, number>();

  for (const row of t.rows) {
    const familyId = cell(row, t, COLUMNS.familyId);
    if (!isFamilyId(familyId)) {
      problems.row(sheet, row.n, `familia „${familyId}” nu există în configurator (${known(FAMILY_IDS)}).`);
      continue;
    }
    const family = catalog.families.find((f) => f.id === familyId);
    if (!family) {
      problems.row(sheet, row.n, `familia „${familyId}” nu e în catalog.`);
      continue;
    }
    const category = cell(row, t, COLUMNS.category);
    if (!category) problems.row(sheet, row.n, "categoria de preț lipsește (A, B sau C).");
    else if (!isCategory(category)) problems.row(sheet, row.n, `categoria de preț „${category}” nu e A, B sau C.`);

    const featuredText = cell(row, t, COLUMNS.featured);
    const featured = yesNo(featuredText);
    if (featured === null) problems.row(sheet, row.n, `„${COLUMNS.featured}”: scrieți da sau nu, nu „${featuredText}”.`);

    const code = cell(row, t, COLUMNS.code).toUpperCase();
    if (code) {
      if (!new RegExp(`^${family.code}\\d{2,}$`).test(code)) {
        problems.row(sheet, row.n, `codul „${code}” nu e al familiei ${familyId} (${family.code}01, ${family.code}02…).`);
        continue;
      }
      if (sheetCodes.has(code)) {
        problems.row(sheet, row.n, `codul „${code}” apare de două ori.`);
        continue;
      }
      sheetCodes.add(code);
      takenCodes.add(code);
    }

    const sort = perFamily.get(familyId) ?? 0;
    perFamily.set(familyId, sort + 1);
    pending.push({
      row,
      familyId,
      familyCode: family.code,
      code,
      featured: featured ?? false,
      input: {
        family_id: familyId,
        name: cell(row, t, COLUMNS.colorName),
        hex: cell(row, t, COLUMNS.hex),
        supplier: cell(row, t, COLUMNS.supplier),
        supplier_code: cell(row, t, COLUMNS.supplierCode),
        price_category: category,
        featured: featured ? "on" : undefined,
        active: "on",
        sort: String(sort),
      },
    });
  }

  const out: ImportedCatalog["materials"] = [];
  for (const item of pending) {
    const parsed = materialSchema.safeParse(item.input);
    if (!parsed.success) {
      const fieldErrors = zodFieldErrors(parsed.error.issues, ADMIN_MESSAGES.invalid);
      for (const [field, message] of Object.entries(fieldErrors)) {
        if (field === "price_category") continue; // reported above, in plainer words
        problems.row(sheet, item.row.n, `„${COLOR_FIELD_LABELS[field] ?? field}”: ${message}`);
      }
      continue;
    }
    const isNew = !item.code;
    const code = item.code || nextMaterialCode(item.familyCode, [...takenCodes]);
    takenCodes.add(code);
    const seedId = seedCodes.get(code);
    const id = seedId ?? materialIdFor(item.familyCode, parsed.data.name, [...takenIds]);
    takenIds.add(id);
    out.push({
      id,
      familyId: item.familyId,
      name: parsed.data.name,
      code,
      hex: parsed.data.hex,
      supplier: parsed.data.supplier,
      supplierCode: parsed.data.supplier_code,
      priceCategory: parsed.data.price_category,
      featured: item.featured,
      sort: parsed.data.sort,
      isNew,
    });
  }

  for (const family of catalog.families) {
    if (!perFamily.has(family.id)) {
      problems.warn(`Familia „${family.id}” nu are nicio culoare în foaia „${sheet}”: culorile ei de acum rămân cum sunt.`);
    }
  }
  return out;
}

function parseRules(data: WorkbookData, catalog: Catalog, problems: Problems): ImportedCatalog["rules"] | null {
  const sheet = SHEETS.rules;
  const t = table(data, sheet, HEADERS.rules, [COLUMNS.modelId], problems);
  if (!t) return null;

  // The family columns: headed by a family's name or id, every family present.
  const familyColumns = new Map<FamilyId, number>();
  for (const [header, index] of t.columns) {
    if ((HEADERS.rules as readonly string[]).includes(header)) continue;
    const family = catalog.families.find((f) => f.name.toLowerCase() === header.toLowerCase() || f.id === header.toLowerCase());
    if (!family) {
      problems.sheet(sheet, `coloana „${header}” nu e o familie de materiale (${known(catalog.families.map((f) => f.name))}).`);
      continue;
    }
    familyColumns.set(family.id, index);
  }
  for (const family of catalog.families) {
    if (!familyColumns.has(family.id)) problems.sheet(sheet, `lipsește coloana familiei „${family.name}”.`);
  }

  const rules: Partial<Record<ModelId, FamilyId[]>> = {};
  for (const row of t.rows) {
    const id = cell(row, t, COLUMNS.modelId);
    if (!isModelId(id)) {
      problems.row(sheet, row.n, `modelul „${id}” nu există în configurator (${known(MODEL_IDS)}).`);
      continue;
    }
    if (rules[id]) {
      problems.row(sheet, row.n, `modelul „${id}” apare de două ori.`);
      continue;
    }
    const allowed: FamilyId[] = [];
    for (const [familyId, index] of familyColumns) {
      const value = row.cells[index] ?? "";
      const flag = yesNo(value);
      if (flag === null) {
        problems.row(sheet, row.n, `coloana „${catalog.families.find((f) => f.id === familyId)?.name ?? familyId}”: scrieți da sau nu, nu „${value}”.`);
        continue;
      }
      if (flag) allowed.push(familyId);
    }
    if (allowed.length === 0) problems.row(sheet, row.n, `modelul „${id}” nu are nicio familie permisă; are nevoie de cel puțin un „da”.`);
    rules[id] = allowed;
  }
  for (const model of catalog.models) {
    if (!rules[model.id]) problems.sheet(sheet, `lipsește rândul modelului „${model.id}”.`);
  }
  return Object.keys(rules).length === catalog.models.length ? (rules as Record<ModelId, FamilyId[]>) : null;
}

function parsePricing(data: WorkbookData, catalog: Catalog, problems: Problems): Pricing | null {
  const sheet = SHEETS.pricing;
  const grid = table(data, sheet, HEADERS.grid, HEADERS.grid, problems);
  const params = table(data, sheet, HEADERS.params, [COLUMNS.parameter, COLUMNS.key, COLUMNS.value], problems);
  if (!grid || !params) return null;

  const labels = new Map<string, string>();
  const form = new FormData();

  const modelName = (id: ModelId) => catalog.models.find((m) => m.id === id)?.name ?? id;
  const seenModels = new Set<ModelId>();
  for (const row of grid.rows) {
    const id = cell(row, grid, COLUMNS.modelId);
    if (!isModelId(id)) {
      problems.row(sheet, row.n, `modelul „${id}” nu există în configurator (${known(MODEL_IDS)}).`);
      continue;
    }
    if (seenModels.has(id)) {
      problems.row(sheet, row.n, `modelul „${id}” apare de două ori.`);
      continue;
    }
    seenModels.add(id);
    let priced = 0;
    for (const width of SIZES) {
      const field = PRICING_FIELDS.grid(id, width);
      labels.set(field, `${modelName(id)} × ${width} cm`);
      const value = numberText(cell(row, grid, width));
      if (!value) continue;
      form.set(field, value);
      priced += 1;
    }
    if (priced === 0) problems.warn(`Modelul „${id}” nu are niciun preț în grilă: pe site nu va avea preț.`);
  }
  for (const model of catalog.models) {
    if (!seenModels.has(model.id)) problems.warn(`Modelul „${model.id}” lipsește din grila de prețuri: pe site nu va avea preț.`);
  }

  const expected = new Map(pricingParams(catalog).map((p) => [p.key, p.label]));
  for (const [key, label] of expected) labels.set(key, label);
  for (const row of params.rows) {
    const key = cell(row, params, COLUMNS.key);
    if (!expected.has(key)) {
      problems.row(sheet, row.n, `cheia „${key}” nu e cunoscută (${known([...expected.keys()])}).`);
      continue;
    }
    form.set(key, numberText(cell(row, params, COLUMNS.value)));
  }

  const parsed = parsePricingForm(form);
  if (!parsed.ok) {
    for (const [field, message] of Object.entries(parsed.fieldErrors)) {
      problems.sheet(sheet, `${labels.get(field) ?? field} (${field}): ${message}`);
    }
    return null;
  }
  // The grid is what the site reads (src/lib/data/pricing.ts): the same schema, run once more on the output.
  const checked = pricingSchema.safeParse(parsed.data);
  if (!checked.success) {
    problems.sheet(sheet, `grila nu trece validarea: ${checked.error.issues.map((i) => i.message).join("; ")}`);
    return null;
  }
  // A lei price under LEI_FLOOR is a formatting slip, not a price: „3.450” typed as text or in an
  // English-locale Excel reads as 3.45 lei. The percentages and roundTo are small by nature.
  const implausible: string[] = [];
  for (const [model, widths] of Object.entries(checked.data.grid)) {
    for (const [width, lei] of Object.entries(widths)) {
      if (lei > 0 && lei < LEI_FLOOR) implausible.push(`${labels.get(PRICING_FIELDS.grid(model as ModelId, width as (typeof SIZES)[number])) ?? `${model} × ${width}`}: ${lei}`);
    }
  }
  for (const [base, lei] of Object.entries(checked.data.base)) {
    if (lei > 0 && lei < LEI_FLOOR) implausible.push(`${labels.get(`base.${base}`) ?? `base.${base}`}: ${lei}`);
  }
  if (implausible.length > 0) {
    problems.sheet(
      sheet,
      `prețuri sub ${LEI_FLOOR} lei, probabil cu separator de mii (scrieți 3450, nu 3.450): ${implausible.join("; ")}.`,
    );
    return null;
  }
  return checked.data;
}

/**
 * The workbook, validated against the closed sets of the catalogue and the admin's
 * own rules. Every problem is collected, so the workshop gets the whole list once.
 */
export function parseWorkbook(data: WorkbookData, catalog: Catalog = SEED_CATALOG): ParseOutcome {
  const problems = new Problems();
  const models = parseModels(data, problems);
  const bases = parseBases(data, problems);
  const families = parseFamilies(data, problems);
  const materials = parseColors(data, catalog, problems);
  const rules = parseRules(data, catalog, problems);
  const pricing = parsePricing(data, catalog, problems);
  if (problems.errors.length || !rules || !pricing) {
    return { ok: false, errors: problems.errors.length ? problems.errors : ["nu am putut citi fișierul."] };
  }
  return { ok: true, catalog: { models, families, materials, rules, bases, pricing, warnings: problems.warnings } };
}

// ───────────── SQL ─────────────

/** A SQL string literal: `'` doubled, NUL (which text cannot hold) dropped. */
export function sqlString(value: string): string {
  return `'${value.replace(/\u0000/g, "").replace(/'/g, "''")}'`;
}

const sqlText = (value: string | null | undefined) => (value === null || value === undefined ? "null" : sqlString(value));
const sqlJson = (value: unknown) => `${sqlString(JSON.stringify(value))}::jsonb`;

export interface SqlMeta {
  /** The workbook's file name, for the header comment. */
  source: string;
  generatedAt: Date;
}

const header = (what: string, meta: SqlMeta) =>
  [
    `-- ${what} from ${meta.source}, generated ${meta.generatedAt.toISOString()} by`,
    "-- scripts/import-catalog.ts (docs/PLAN.md PR-11). Applied through the db-change",
    "-- skill, never automatically. Re-runnable: updates by id, upserts by code. The sheet",
    "-- carries the catalogue it was filled from: run it before editing the catalogue in /admin.",
    "",
  ].join("\n");

/** The catalogue migration: models, families, materials, rules and bases. */
export function catalogSql(c: ImportedCatalog, meta: SqlMeta): string {
  const lines: string[] = [header("Catalogue", meta)];

  const sets = (pairs: [string, string | null | undefined][]) =>
    pairs.filter(([, v]) => v !== undefined).map(([k, v]) => `${k} = ${v === null ? "null" : v}`);

  // The import allocated the new colours' codes and ids against the catalogue the sheet
  // was filled from (parseColors), not against the live table: a colour added in /admin
  // meanwhile holds the same code, and the upsert below would write the sheet's colour
  // over it. The guard aborts the migration first, before any statement writes. A row
  // holding both the code and the id is this colour itself, from an earlier run of the
  // same file: the upsert updates it, so the file stays re-runnable.
  const added = c.materials.filter((m) => m.isNew);
  if (added.length) {
    lines.push(
      "-- guard: the new colours' codes and ids were allocated against the catalogue the sheet was",
      "-- filled from. If /admin gave one of them to another colour meanwhile, stop here, before",
      "-- anything is written. A row holding both the code and the id is this colour, from an",
      "-- earlier run of this file: it is updated below.",
      "do $$",
      "begin",
    );
    for (const m of added) {
      const code = sqlString(m.code);
      const id = sqlString(m.id);
      lines.push(
        `  if exists (select 1 from public.materials where (code = ${code} or id = ${id}) and not (code = ${code} and id = ${id})) then`,
        `    raise exception ${sqlString(`materials: ${m.code} or ${m.id} belongs to another colour; the catalogue changed since the sheet was filled (compare the row with /admin/catalog)`)};`,
        "  end if;",
      );
    }
    lines.push("end $$;", "");
  }

  lines.push("-- models: the texts the workshop filled in; an empty cell kept the current value.");
  for (const m of c.models) {
    const assignments = sets([
      ["name", m.name && sqlString(m.name)],
      ["note", m.note && sqlString(m.note)],
      ["description", m.description && sqlString(m.description)],
    ]);
    if (assignments.length) lines.push(`update public.models set ${assignments.join(", ")} where id = ${sqlString(m.id)};`);
  }

  lines.push("", "-- material_families: description and the specification rows of /materiale.");
  for (const f of c.families) {
    const assignments = sets([
      ["name", f.name && sqlString(f.name)],
      ["description", f.description && sqlString(f.description)],
      ["specs", f.specs && sqlJson(f.specs)],
    ]);
    if (assignments.length) lines.push(`update public.material_families set ${assignments.join(", ")} where id = ${sqlString(f.id)};`);
  }

  lines.push(
    "",
    "-- materials: upsert by code (a code is assigned once and never reused). A new colour starts active; an",
    "-- existing one keeps its active flag (a colour no longer offered is deactivated in /admin and stays in",
    "-- the sheet) and, where the sheet's cell is empty, its supplier and supplier code.",
  );
  for (const m of c.materials) {
    lines.push(
      "insert into public.materials as m (id, family_id, name, code, hex, supplier, supplier_code, price_category, featured, active, sort)",
      `  values (${[
        sqlString(m.id),
        sqlString(m.familyId),
        sqlString(m.name),
        sqlString(m.code),
        sqlString(m.hex),
        sqlText(m.supplier),
        sqlText(m.supplierCode),
        sqlString(m.priceCategory),
        String(m.featured),
        "true",
        String(m.sort),
      ].join(", ")})`,
      "  on conflict (code) do update set name = excluded.name, hex = excluded.hex,",
      "    supplier = coalesce(excluded.supplier, m.supplier), supplier_code = coalesce(excluded.supplier_code, m.supplier_code),",
      "    price_category = excluded.price_category, featured = excluded.featured, sort = excluded.sort;",
    );
  }

  lines.push("", "-- model_families: the Reguli matrix, per model (the allowed pairs upserted, the others deleted).");
  for (const model of MODEL_IDS) {
    const families = c.rules[model];
    if (!families || families.length === 0) continue;
    const pairs = families.map((f) => `(${sqlString(model)}, ${sqlString(f)})`).join(", ");
    lines.push(
      `insert into public.model_families (model_id, family_id) values ${pairs} on conflict do nothing;`,
      `delete from public.model_families where model_id = ${sqlString(model)} and family_id not in (${families.map(sqlString).join(", ")});`,
    );
  }

  lines.push("", "-- bases: the notes under the names.");
  for (const b of c.bases) {
    const assignments = sets([
      ["name", b.name && sqlString(b.name)],
      ["note", b.note && sqlString(b.note)],
    ]);
    if (assignments.length) lines.push(`update public.bases set ${assignments.join(", ")} where id = ${sqlString(b.id)};`);
  }

  return `${lines.join("\n")}\n`;
}

/** The price grid, upserted as /admin/preturi does (the row may not exist yet). */
export function pricingSql(pricing: Pricing, meta: SqlMeta): string {
  return [
    header("Prices", meta),
    "-- pricing: the Pricing type of ARHITECTURA §7, validated with pricingSchema before writing.",
    `insert into public.pricing (id, data, updated_at) values (1, ${sqlJson(pricing)}, now())`,
    "  on conflict (id) do update set data = excluded.data, updated_at = now();",
    "",
  ].join("\n");
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `<UTC yyyymmddhhmmss>` as the db-change skill names migrations. */
export function migrationStamp(at: Date): string {
  return `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}`;
}

/** The two file names, the prices one second after the catalogue so they apply in that order. */
export function migrationFileNames(at: Date): { catalog: string; pricing: string } {
  return {
    catalog: `${migrationStamp(at)}_catalog_from_excel.sql`,
    pricing: `${migrationStamp(new Date(at.getTime() + 1000))}_pricing.sql`,
  };
}
