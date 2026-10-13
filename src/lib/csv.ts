// Parser for the game's "session results" export: a UTF-8 (BOM) file with fully quoted
// fields holding two tables separated by a blank line — the classification, then incidents.

function parseLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

export type Row = Record<string, string>;

export function parseSessionCsv(text: string): { results: Row[]; incidents: Row[] } {
  const blocks = text
    .replace(/^﻿/, '')
    .split(/\r?\n\s*\r?\n/)
    .map((b) => b.split(/\r?\n/).filter((l) => l.trim() !== ''))
    .filter((b) => b.length > 0);

  const tables = blocks.map(([header, ...rows]) => {
    const keys = parseLine(header);
    return rows.map((r) => Object.fromEntries(parseLine(r).map((v, i) => [keys[i], v.trim()])));
  });

  return { results: tables[0] ?? [], incidents: tables[1] ?? [] };
}
