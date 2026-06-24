// Synthetic .xlsx fixtures for the curriculum parser tests. Each fixture isolates one
// drift hazard. Built with the same library the parser reads (xlsx/SheetJS) so the
// round-trip (write → read) exercises real cell objects, hyperlinks, and error cells.

import * as XLSX from 'xlsx';

/** A cell: plain value, a hyperlink {text,url}, or null for blank. `"#REF!"` literal
 *  strings are read back as error sentinels by the parser. */
export type CellSpec = string | number | null | { text: string; url: string };

export function makeSheet(rows: CellSpec[][]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  let maxC = 0;
  rows.forEach((row, r) => {
    row.forEach((spec, c) => {
      if (spec == null || spec === '') return;
      const addr = XLSX.utils.encode_cell({ r, c });
      if (typeof spec === 'object') {
        ws[addr] = { t: 's', v: spec.text, w: spec.text, l: { Target: spec.url } };
      } else if (typeof spec === 'number') {
        ws[addr] = { t: 'n', v: spec, w: String(spec) };
      } else {
        ws[addr] = { t: 's', v: spec, w: spec };
      }
      if (c > maxC) maxC = c;
    });
  });
  const nR = Math.max(rows.length - 1, 0);
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: nR, c: maxC } });
  return ws;
}

/** Build a workbook buffer from {sheetName: rows}. */
export function makeWorkbook(sheets: Record<string, CellSpec[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, makeSheet(rows), name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** A 3-row header block: band row, the real "Column header" row, the description row. */
export function headerBlock(headers: CellSpec[]): CellSpec[][] {
  const band: CellSpec[] = ['Period', ...headers.slice(1).map(() => '')];
  const desc: CellSpec[] = ['Description', ...headers.slice(1).map(() => 'desc')];
  return [band, ['Column header', ...headers.slice(1)], desc];
}
