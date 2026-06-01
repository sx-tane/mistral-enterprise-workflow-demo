import { readFile } from "node:fs/promises";

const DEFAULT_CSV_PATH = new URL("../examples/sample-operations-context.csv", import.meta.url);

function parseBoolean(value) {
  return String(value).trim().toLowerCase() === "true";
}

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function splitList(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsvText(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error("CSV must include a header and at least one row.");
  }

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};

    for (let i = 0; i < headers.length; i += 1) {
      row[headers[i]] = values[i] ?? "";
    }

    return row;
  });
}

export function normalizeRowsToOperationsContext(rows) {
  const tours = [];
  const guides = [];

  for (const row of rows) {
    const entity = String(row.entity || "").toLowerCase();

    if (entity === "tour") {
      tours.push({
        tourId: row.id,
        date: row.date,
        city: row.city,
        language: row.language,
        status: row.status,
        travelerCount: parseNumber(row.travelerCount),
        requiresPaymentCheck: parseBoolean(row.requiresPaymentCheck)
      });
      continue;
    }

    if (entity === "guide") {
      guides.push({
        guideId: row.id,
        languages: splitList(row.languages),
        availableDates: splitList(row.availableDates)
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    notes:
      "Loaded from CSV sample data. Public-safe records only; review before business actions.",
    tours,
    guides
  };
}

export async function loadOperationsContextFromCsv({
  csvPath = DEFAULT_CSV_PATH,
  readFileImpl = readFile
} = {}) {
  const csvText = await readFileImpl(csvPath, "utf8");
  const rows = parseCsvText(csvText);
  return normalizeRowsToOperationsContext(rows);
}
