"use client";

/**
 * محرك التحليل البصري (OCR) في المتصفح.
 *
 * يعمل محليًا بالكامل: ملفات المحرك وبيانات اللغة العربية موجودة في
 * ‎public/vendor/ocr‎ فلا يتصل بأي CDN، وتبقى بيانات المدرسة على جهاز المستخدم
 * ولا تُرسل إلى أي خدمة خارجية. تُرسل الصفوف النصية الناتجة إلى الخادم فقط.
 */

import type { Worker } from "tesseract.js";

const OCR_BASE = "/vendor/ocr";

export interface OcrProgress {
  phase: "idle" | "loading" | "page" | "done" | "error";
  page?: number;
  total?: number;
  ratio?: number;
  message?: string;
}

export interface OcrPageResult {
  page: number;
  text: string;
  /** ثقة المحرك 0..100 */
  confidence: number;
}

let workerPromise: Promise<Worker> | null = null;

function ocrOptions(logger: (m: { status?: string; progress?: number }) => void) {
  return {
    workerPath: `${OCR_BASE}/worker.min.js`,
    // مسار مباشر لملف النواة يدعم SIMD (تدعمه كل المتصفحات الحديثة)
    corePath: `${OCR_BASE}/tesseract-core-simd-lstm.wasm.js`,
    langPath: `${OCR_BASE}/lang`,
    logger,
    gzip: true,
  };
}

async function getWorker(onProgress?: (p: OcrProgress) => void): Promise<Worker> {
  if (!workerPromise) {
    const { createWorker } = await import("tesseract.js");
    workerPromise = createWorker("ara", 1, ocrOptions((m) => {
      if (m.status && m.progress !== undefined) {
        onProgress?.({ phase: "loading", ratio: m.progress, message: m.status });
      }
    })).catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** يحرّر العامل لتحرير الذاكرة (يُستدعى عند مغادرة صفحة الرفع). */
export async function disposeOcr(): Promise<void> {
  if (!workerPromise) return;
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } catch {
    /* تجاهل */
  }
  workerPromise = null;
}

export interface OcrSummary {
  pages: OcrPageResult[];
  /** متوسط الثقة 0..100 */
  averageConfidence: number;
  /** هل القراءة ضعيفة؟ */
  weak: boolean;
  warnings: string[];
}

const LOW_CONFIDENCE = 70;

/**
 * يقرأ صفحات ملف PDF بالتحليل البصري.
 * `renderPage` دالة ترسم الصفحة إلى لوحة رسم بدقة 150 نقطة لكل بوصة.
 */
export async function runOcrOnPdf(
  data: ArrayBuffer,
  renderPage: (pageNumber: number) => Promise<HTMLCanvasElement>,
  pageCount: number,
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrSummary> {
  onProgress?.({ phase: "loading", message: "تهيئة محرك التحليل البصري" });
  const worker = await getWorker(onProgress);

  const pages: OcrPageResult[] = [];
  const warnings: string[] = [];

  try {
    for (let n = 1; n <= pageCount; n += 1) {
      onProgress?.({ phase: "page", page: n, total: pageCount, message: `قراءة الصفحة ${n}` });
      const canvas = await renderPage(n);
      const { data: result } = await worker.recognize(canvas);
      const confidence = Math.round((result.confidence ?? 0) * 10) / 10;
      pages.push({ page: n, text: String(result.text ?? ""), confidence });
      // تحرير الذاكرة
      canvas.width = 0;
      canvas.height = 0;
      if (confidence < LOW_CONFIDENCE) {
        warnings.push(
          `الصفحة ${n}: ثقة القراءة ${confidence}% — راجع نتائج هذه الصفحة بدقة قبل الاعتماد.`,
        );
      }
    }
  } catch (error) {
    onProgress?.({ phase: "error", message: error instanceof Error ? error.message : "فشل التحليل البصري" });
    throw error;
  }

  const averageConfidence =
    pages.length === 0 ? 0 : Math.round((pages.reduce((a, p) => a + p.confidence, 0) / pages.length) * 10) / 10;

  if (averageConfidence < LOW_CONFIDENCE) {
    warnings.push(
      `متوسط ثقة القراءة ${averageConfidence}% وهو منخفض. راجع كل المؤشرات المستخرجة قبل اعتمادها، وتأكد من وضوح نسخة الملف الممسوح ضوئيًا.`,
    );
  }

  onProgress?.({ phase: "done", message: "اكتمل التحليل البصري" });

  return { pages, averageConfidence, weak: averageConfidence < LOW_CONFIDENCE, warnings };
}