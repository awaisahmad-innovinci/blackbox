import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const csvDir = path.join(repoRoot, "docs/import-templates/master-data");
const outputPath = path.join(
  repoRoot,
  "docs/import-templates/Blackbox-Master-Data-Import-Templates.xlsx",
);

const TEMPLATE_CSV_FILES = [
  "01_units.csv",
  "02_brands.csv",
  "03_categories.csv",
  "04_warehouses.csv",
  "05_vendor_groups.csv",
  "06_products.csv",
  "07_product_skus.csv",
  "08_vendors.csv",
  "09_vendor_skus.csv",
  "10_product_sku_barcodes.csv",
];

/** Parse a single CSV record line (header row). */
function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      fields.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  fields.push(current);
  return fields;
}

function readCsvHeader(filename) {
  const filePath = path.join(csvDir, filename);
  const raw = fs.readFileSync(filePath, "utf8");
  const firstLine = raw.split(/\r?\n/)[0] ?? "";
  if (!firstLine.trim()) {
    throw new Error(`Empty or missing header in ${filename}`);
  }
  return parseCsvLine(firstLine);
}

function addInstructionsSheet(workbook) {
  const sheet = workbook.addWorksheet("Instructions");
  sheet.getColumn(1).width = 100;
  const lines = [
    "Blackbox master-data import templates (combined workbook)",
    "",
    "How to use:",
    "• Fill data on each template tab (01_units through 09_vendor_skus).",
    "• Do not change header row column names.",
    "• Upload one CSV at a time via Dashboard > Upload Old Data.",
    "• Import in dependency order: 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 (barcodes with qty per scan).",
    "• Export the sheet you need as CSV UTF-8 (Excel: File > Save As > CSV UTF-8).",
    "• Save the exported file with the matching template name (e.g. 01_units.csv).",
    "• ZIP and multi-file uploads are not supported.",
    "",
    "Full rules and example values: docs/import-templates/master-data/README.md",
    "",
    "Regenerate this workbook from CSV headers: pnpm build:import-templates-xlsx",
  ];
  for (const text of lines) {
    sheet.addRow([text]);
  }
  sheet.getRow(1).font = { bold: true, size: 14 };
}

function addTemplateSheet(workbook, csvFilename, headers) {
  const sheetName = csvFilename.replace(/\.csv$/i, "");
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(headers);
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", wrapText: true };
  sheet.views = [{ state: "frozen", ySplit: 1, activeCell: "A2" }];
  headers.forEach((header, index) => {
    const col = sheet.getColumn(index + 1);
    col.width = Math.min(Math.max(String(header).length + 2, 12), 48);
  });
}

async function main() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Blackbox";
  workbook.created = new Date();

  addInstructionsSheet(workbook);

  for (const csvFile of TEMPLATE_CSV_FILES) {
    const headers = readCsvHeader(csvFile);
    addTemplateSheet(workbook, csvFile, headers);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await workbook.xlsx.writeFile(outputPath);
  console.log(`Wrote ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
