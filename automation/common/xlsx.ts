/** Parse an .xlsx export (from a Playwright APIResponse body) into headers + rows for assertions. */
import ExcelJS from 'exceljs';
import type { APIResponse } from '@playwright/test';

export interface ParsedSheet {
  /** Every row of the first worksheet (an export may have a metadata preamble before the table). */
  rows: Array<Array<string | number | null>>;
}

/** Load the first worksheet of an xlsx response into all-row form. */
export async function parseXlsx(res: APIResponse): Promise<ParsedSheet> {
  const buf = await res.body();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0]!;
  const cellVal = (c: ExcelJS.Cell): string | number | null => {
    const v = c.value as any;
    if (v == null) return null;
    if (typeof v === 'object' && v.text) return String(v.text); // rich text / hyperlink
    if (v instanceof Date) return v.toISOString();
    return v as string | number;
  };
  const rows: Array<Array<string | number | null>> = [];
  ws.eachRow((row) => {
    const values: Array<string | number | null> = [];
    row.eachCell({ includeEmpty: true }, (cell) => values.push(cellVal(cell)));
    rows.push(values);
  });
  return { rows };
}

/** Locate the column-header row (first row whose first cell === marker) and split off the data rows. */
export function locateTable(sheet: ParsedSheet, marker: string): { headers: string[]; dataRows: ParsedSheet['rows']; headerIndex: number } {
  const i = sheet.rows.findIndex((r) => String(r[0] ?? '') === marker);
  if (i < 0) return { headers: [], dataRows: [], headerIndex: -1 };
  return {
    headers: sheet.rows[i]!.map((v) => String(v ?? '')),
    dataRows: sheet.rows.slice(i + 1).filter((r) => r.some((c) => c !== null && c !== '')),
    headerIndex: i,
  };
}
