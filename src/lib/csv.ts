/**
 * Minimal CSV utilities — RFC 4180-ish parser and serializer. Built for
 * the import/export pipeline at /settings/import-export. No streaming;
 * loads the whole file into memory. Demo-scale only.
 */

export function serializeCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const lines: string[] = [];
  lines.push(headers.map(escape).join(","));
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h] ?? "")).join(","));
  }
  return lines.join("\n");
}

function escape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

/**
 * RFC 4180 parser with a couple of pragmatic concessions (auto-detects
 * \r\n and \n line endings, treats stray quotes leniently). Rows are
 * returned as { header → cell }.
 */
export function parseCsv(input: string): ParsedCsv {
  const text = input.replace(/^﻿/, ""); // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (c === "\r") {
      // Treat \r\n or bare \r as line break
      if (text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    cell += c;
    i++;
  }
  // Flush trailing cell/row
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Strip blank trailing rows
  while (rows.length && rows[rows.length - 1].every((c) => c === "")) rows.pop();

  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows.shift()!.map((h) => h.trim());
  const data = rows.map((r) => {
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = (r[j] ?? "").trim();
    }
    return obj;
  });
  return { headers, rows: data };
}
