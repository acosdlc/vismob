// Turns a filled docs/atelier/05-catalog.xlsx into two SQL migrations for the
// db-change skill (docs/PLAN.md PR-11):
//   npm run catalog:import -- <path/to/05-catalog.xlsx> [--out supabase/migrations]
// It validates the workbook against the configurator's closed sets and the admin's
// own rules, lists every problem and exits 1, or writes
//   <ts>_catalog_from_excel.sql   models, families, materials, rules, bases
//   <ts>_pricing.sql              the price grid (validated with pricingSchema)
// and prints their paths. Nothing is applied here: the migrations go through the
// db-change skill, never automatically.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import {
  catalogSql,
  INFORMATIONAL_SHEETS,
  migrationFileNames,
  parseWorkbook,
  pricingSql,
  sheetsFromWorkbook,
} from "./catalog-workbook";

const DEFAULT_OUT = "supabase/migrations";

function usage(): never {
  console.error("Folosire: npm run catalog:import -- <fișier.xlsx> [--out supabase/migrations]");
  process.exit(2);
}

function parseArgs(argv: string[]): { file: string; out: string } {
  let file: string | undefined;
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") {
      out = argv[i + 1] ?? usage();
      i += 1;
    } else if (arg.startsWith("--out=")) {
      out = arg.slice("--out=".length);
    } else if (!file && !arg.startsWith("-")) {
      file = arg;
    } else {
      usage();
    }
  }
  if (!file) usage();
  return { file, out };
}

async function main(): Promise<void> {
  const { file, out } = parseArgs(process.argv.slice(2));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const outcome = parseWorkbook(sheetsFromWorkbook(workbook));

  if (!outcome.ok) {
    const n = outcome.errors.length;
    console.error(`${file}: ${n === 1 ? "o problemă" : `${n} probleme`}. Nu am scris nimic.`);
    for (const error of outcome.errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  const { catalog } = outcome;
  for (const warning of catalog.warnings) console.warn(`Atenție: ${warning}`);

  const now = new Date();
  const names = migrationFileNames(now);
  const meta = { source: path.basename(file), generatedAt: now };
  await mkdir(out, { recursive: true });
  const catalogPath = path.join(out, names.catalog);
  const pricingPath = path.join(out, names.pricing);
  await writeFile(catalogPath, catalogSql(catalog, meta), "utf8");
  await writeFile(pricingPath, pricingSql(catalog.pricing, meta), "utf8");

  const newCodes = catalog.materials.filter((m) => m.isNew).map((m) => m.code);
  console.log(
    `Citit ${file}: ${catalog.materials.length} culori (${newCodes.length} noi${newCodes.length ? `: ${newCodes.join(", ")}` : ""}), ` +
      `${catalog.models.length} modele, ${catalog.families.length} familii, ${catalog.bases.length} baze, grila de prețuri.`,
  );
  console.log(`Foile ${INFORMATIONAL_SHEETS.map((s) => `„${s}”`).join(", ")} sunt informative și nu se importă.`);
  console.log("Scris:");
  console.log(`  ${catalogPath}`);
  console.log(`  ${pricingPath}`);
  console.log("Se aplică prin skill-ul db-change (apply_migration, apoi redenumirea fișierului), niciodată automat.");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
