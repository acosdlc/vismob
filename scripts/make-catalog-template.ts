// Builds docs/atelier/05-catalog.xlsx, the workbook the workshop fills with its
// catalogue and prices (docs/LISTA-ATELIER.md §8, docs/PLAN.md PR-11):
//   npm run catalog:template            → docs/atelier/05-catalog.xlsx
//   npm run catalog:template -- <path>  → elsewhere
// The sheets, their columns and what is pre-filled come from scripts/catalog-workbook.ts.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { fillTemplate, TEMPLATE_PATH } from "./catalog-workbook";

async function main(): Promise<void> {
  const out = process.argv[2] ?? TEMPLATE_PATH;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VisMob";
  // Fixed so the workbook's XML parts are reproducible; the zip entries still carry the
  // write time, so a regenerated file differs in bytes even when its content is the same.
  workbook.created = new Date(Date.UTC(2026, 0, 1));
  workbook.modified = workbook.created;
  fillTemplate(workbook);
  await mkdir(path.dirname(out), { recursive: true });
  await workbook.xlsx.writeFile(out);
  console.log(`Scris ${out}: ${workbook.worksheets.length} foi (${workbook.worksheets.map((ws) => ws.name).join(", ")}).`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
