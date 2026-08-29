/**
 * Lightweight CSV parser — no external dependency.
 * Handles: quoted fields, embedded commas/newlines, CRLF + LF, UTF-8 BOM.
 * Returns an array of objects keyed by the header row.
 */
export function parseCSV(raw: string): Record<string, string>[] {
  // Strip UTF-8 BOM if present
  const text = raw.startsWith("﻿") ? raw.slice(1) : raw;

  const lines = splitLines(text);
  if (lines.length < 2) return [];

  const headers = parseRow(lines[0]).map(h => h.trim());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

/** Split on newlines, respecting quoted fields that may contain newlines. */
function splitLines(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      // Escaped quote inside a quoted field
      if (inQuote && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
        current += ch;
      }
    } else if ((ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) && !inQuote) {
      if (ch === "\r") i++; // skip \n of \r\n pair
      lines.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Parse a single CSV row into an array of cell values. */
function parseRow(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === "," && !inQuote) {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

/** Build a CSV string from an array of objects + optional column order. */
export function buildCSVFromRows(
  rows: Record<string, unknown>[],
  cols?: string[]
): string {
  if (!rows.length) return "";
  const headers = cols ?? Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(","),
    ...rows.map(r => headers.map(h => esc(r[h])).join(",")),
  ];
  return lines.join("\r\n");
}

export type ImportError = { row: number; field: string; message: string };
