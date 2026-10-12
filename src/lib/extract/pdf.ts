import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  harvestRows,
  pdfPageRef,
  type HarvestResult,
  type RawRow,
} from "./rows";
import { INDICATOR_CODE_PATTERN } from "@/lib/text/arabic";

export interface PageLines {
  page: number;
  lines: string[];
}

/**
 * يحوّل أسطر صفحات PDF إلى صفوف قابلة للاستخراج.
 *
 * عند ورود سطر يحمل رمز مؤشر، يُضمّ إليه السطران التاليان كخلايا سياق،
 * لأن نص المؤشر والمستوى الوارد في التقرير يمتد على أسطر متجاورة.
 * دالة خالصة حتى يمكن اختبارها بلا ملفات.
 */
/**
 * عدد الأسطر التالية لسطر الرمز التي تُضم كخلايا سياق.
 * في تقرير التقويم يتبع سطر الرمز: نص المؤشر، ثم جملة وصف المستوى،
 * ثم النسبة — لذلك نحتاج نافذة أوسع من سطرين.
 */
const CONTEXT_LINES = 4;

export function pageLinesToRows(pages: PageLines[]): RawRow[] {
  const rows: RawRow[] = [];
  for (const { page, lines } of pages) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = String(lines[i] ?? "").trim();
      if (!line) continue;
      const ref = pdfPageRef(page);
      if (INDICATOR_CODE_PATTERN.test(line)) {
        const cells: string[] = [line];
        const refs = [ref];
        for (let k = 1; k <= CONTEXT_LINES && i + k < lines.length; k += 1) {
          const next = String(lines[i + k] ?? "").trim();
          if (!next) continue;
          // لا نتجاوز إلى رمز المؤشر التالي حتى لا تُنسب نتيجته إلى ما بعده
          if (INDICATOR_CODE_PATTERN.test(next)) break;
          cells.push(next);
          refs.push(ref);
        }
        rows.push({ cells, cellRefs: refs, ref });
      } else {
        rows.push({ cells: [line], ref });
      }
    }
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/*  pdfjs — للملفات النصية                                              */
/* ------------------------------------------------------------------ */

interface PdfTextItem {
  str: string;
  x: number;
  y: number;
}

/** يجمع عناصر النص في الصفحة الواحدة إلى أسطر حسب الإحداثي الرأسي. */
export function groupItemsIntoLines(items: PdfTextItem[], yTolerance = 3): string[] {
  const sorted = [...items].sort((a, b) =>
    Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x,
  );
  const lines: string[] = [];
  let current: string | null = null;
  let lastY: number | null = null;
  for (const item of sorted) {
    if (lastY === null || Math.abs(item.y - lastY) > yTolerance) {
      if (current !== null) lines.push(current);
      current = item.str;
      lastY = item.y;
    } else {
      current += ` ${item.str}`;
    }
  }
  if (current !== null) lines.push(current);
  return lines.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

export interface PdfTextExtraction {
  pages: PageLines[];
  /** إجمالي عدد الأحرف المستخرجة — يُستخدم لتحديد إن كان الملف ممسوحًا ضوئيًا */
  totalChars: number;
  pageCount: number;
}

/**
 * يوجّه pdfjs إلى نسخة العامل (worker) المرفقة داخل المشروع.
 *
 * السبب: في بيئات مثل Vercel لا يجد pdfjs ملف العامل داخل node_modules
 * لأنه لا يُضمَّن في حزمة النشر، فيفشل بخطأ
 * «Setting up fake worker failed». نسختنا في ‎public/vendor/pdf‎
 * مضمَّنة دائمًا مع المشروع، فنستخدمها بدل الاعتماد على node_modules.
 */
function configurePdfjsWorker(pdfjs: {
  GlobalWorkerOptions: { workerSrc: string };
}): void {
  try {
    const vendored = join(process.cwd(), "public", "vendor", "pdf", "pdf.worker.min.mjs");
    if (existsSync(vendored)) {
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(vendored).href;
      return;
    }
  } catch {
    // نُكمل بالسلوك الافتراضي إن تعذّر الفحص
  }
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = require.resolve(
      "pdfjs-dist/legacy/build/pdf.worker.mjs",
    );
  } catch {
    // نترك pdfjs يستخدم إعداداته الافتراضية
  }
}

/** يستخرج نص PDF رقميًا. يرمي خطأً إن كان الملف غير صالح. */
export async function extractPdfText(data: Uint8Array): Promise<PdfTextExtraction> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  configurePdfjsWorker(pdfjs);
  const loadingTask = pdfjs.getDocument({ data, verbosity: 0 });
  const doc = await loadingTask.promise;

  const pages: PageLines[] = [];
  let totalChars = 0;
  try {
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items: PdfTextItem[] = content.items
        .filter((it): it is typeof it & { str: string; transform: number[] } =>
          typeof (it as { str?: unknown }).str === "string",
        )
        .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));
      const lines = groupItemsIntoLines(items);
      totalChars += items.reduce((sum, it) => sum + it.str.length, 0);
      pages.push({ page: n, lines });
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  return { pages, totalChars, pageCount: doc.numPages };
}

/** الحد الأدنى من الأحرف لكل صفحة ل اعتبار الملف نصيًا لا ممسوحًا ضوئيًا. */
export const MIN_CHARS_PER_PAGE = 60;

export interface PdfExtractionResult {
  result: HarvestResult;
  pageCount: number;
  totalChars: number;
  /** هل يبدو الملف ممسوحًا ضوئيًا ويحتاج OCR؟ */
  needsOcr: boolean;
  mode: "text";
}

export async function extractFromPdf(data: Uint8Array): Promise<PdfExtractionResult> {
  const text = await extractPdfText(data);
  const rows = pageLinesToRows(text.pages);
  const result = harvestRows(rows);
  const needsOcr = text.pageCount > 0 && text.totalChars < text.pageCount * MIN_CHARS_PER_PAGE;
  return {
    result,
    pageCount: text.pageCount,
    totalChars: text.totalChars,
    needsOcr,
    mode: "text",
  };
}

/* ------------------------------------------------------------------ */
/*  نصوص ناتجة عن OCR في المتصفح                                       */
/* ------------------------------------------------------------------ */

/**
 * يحوّل نصوص OCR الناتجة في المتصفح (نص لكل صفحة) إلى صفوف.
 * تُعامل كصفوف ممسوحة ضوئيًا مع رقم السطر مرجعًا للمصدر.
 */
export function ocrPagesToRows(pages: { page: number; text: string }[]): RawRow[] {
  const asLines: PageLines[] = pages.map(({ page, text }) => ({
    page,
    lines: String(text ?? "")
      .split(/\r?\n/)
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean),
  }));
  return pageLinesToRows(asLines);
}

/** يستخرج نتائج من نصوص OCR ويعيد تحذيرًا واضحًا بجودة القراءة. */
export function harvestOcrText(pages: { page: number; text: string }[]): HarvestResult {
  return harvestRows(ocrPagesToRows(pages));
}