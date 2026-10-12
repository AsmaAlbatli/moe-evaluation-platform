import * as XLSX from "xlsx";
import {
  excelCellRef,
  harvestRows,
  type HarvestResult,
  type RawRow,
} from "./rows";

/** يحوّل قيمة خلية Excel إلى نص صالح للقراءة والمطابقة. */
export function formatCellValue(cell: XLSX.CellObject): string {
  const v = cell.v;
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return String(Number(v.toFixed(6)));
  }
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

export interface WorkbookRowsResult {
  rows: RawRow[];
  sheetNames: string[];
  /** عدد الصفوف المقروءة في كل ورقة */
  sheetRowCounts: Record<string, number>;
}

/**
 * يقرأ كل أوراق المصنّف ويعيد صفوفًا مع مرجع لكل خلية (اسم الورقة + الإحداثي).
 * يقرأ ملفات ‎.xlsx‎ و ‎.xls‎ و ‎.csv‎ عبر SheetJS.
 */
export function rowsFromWorkbook(input: ArrayBuffer | Uint8Array | Buffer): WorkbookRowsResult {
  const wb = XLSX.read(input as ArrayBuffer, { type: "array", cellDates: true, cellNF: false });
  const rows: RawRow[] = [];
  const sheetRowCounts: Record<string, number> = {};

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws["!ref"]) {
      sheetRowCounts[sheetName] = 0;
      continue;
    }
    const range = XLSX.utils.decode_range(ws["!ref"]);
    let count = 0;
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      const cells: string[] = [];
      const cellRefs = [];
      let hasContent = false;
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const address = XLSX.utils.encode_cell({ r, c });
        const cell = ws[address] as XLSX.CellObject | undefined;
        const text = cell ? formatCellValue(cell) : "";
        if (text) hasContent = true;
        cells.push(text);
        cellRefs.push(excelCellRef(sheetName, r + 1, c + 1));
      }
      if (!hasContent) continue;
      rows.push({
        cells,
        cellRefs,
        ref: {
          kind: "excel-cell",
          label: `ورقة: ${sheetName} — الصف ${r + 1}`,
          sheet: sheetName,
          row: r + 1,
        },
      });
      count += 1;
    }
    sheetRowCounts[sheetName] = count;
  }

  return { rows, sheetNames: wb.SheetNames, sheetRowCounts };
}

/** يقرأ المصنّف ثم يمرّر صفوفه على محرّك الاستخراج الموحّد. */
export function extractFromWorkbook(input: ArrayBuffer | Uint8Array | Buffer): {
  result: HarvestResult;
  meta: WorkbookRowsResult;
} {
  const meta = rowsFromWorkbook(input);
  return { result: harvestRows(meta.rows), meta };
}