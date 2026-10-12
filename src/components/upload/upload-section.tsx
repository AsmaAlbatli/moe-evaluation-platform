"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { FileUp, Loader2, ScanText, TriangleAlert, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SimpleProgress } from "@/components/common/simple-progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { runOcrOnPdf, disposeOcr, type OcrProgress, type OcrSummary } from "@/lib/ocr/client";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.xlsx,.xls,.csv";
const MAX_BYTES = 20 * 1024 * 1024;

export type UploadPhase =
  | "idle"
  | "selected"
  | "previewing"
  | "reading"
  | "ocr"
  | "uploading"
  | "done"
  | "error";

export interface UploadResult {
  analysisId: string;
  quality: "good" | "weak" | "poor";
  qualityReasons: string[];
  warnings: { type: string; message: string }[];
  indicatorCount: number;
  needsOcr: boolean;
  notices: string[];
}

export interface UploadSectionProps {
  kind: "external" | "self";
  title: string;
  description: string;
  /** بعد نجاح التحليل */
  onUploaded?: (result: UploadResult) => void;
}

interface PreviewInfo {
  fileName: string;
  fileSize: number;
  pageCount: number | null;
  objectUrl: string | null;
  isExcel: boolean;
}

/**
 * منطقة رفع الملف مع السحب والإفلات والمعاينة والتحليل.
 * يعرض تنبيهًا واضحًا عند ضعف جودة الاستخراج، ويقترح التحليل البصري.
 */
export function UploadSection({ kind, title, description, onUploaded }: UploadSectionProps) {
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<PreviewInfo | null>(null);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [useOcr, setUseOcr] = useState(false);
  const [ocrSummary, setOcrSummary] = useState<OcrSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [titleHint, setTitleHint] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedFileRef = useRef<File | null>(null);
  const ocrPagesRef = useRef<{ page: number; text: string }[]>([]);
  const pdfBufferRef = useRef<ArrayBuffer | null>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setPreview(null);
    setProgress(null);
    setError(null);
    setResult(null);
    setOcrSummary(null);
    setUseOcr(false);
    selectedFileRef.current = null;
    ocrPagesRef.current = [];
    pdfBufferRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  /* ---------------- اختيار الملف ---------------- */
  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setResult(null);
    setOcrSummary(null);
    selectedFileRef.current = file;

    if (file.size > MAX_BYTES) {
      setError("حجم الملف يتجاوز 20 ميجابايت. يرجى ضغط الملف أو تقسيمه ثم إعادة الرفع.");
      setPhase("error");
      return;
    }
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    if (!["pdf", "xlsx", "xls", "csv"].includes(ext)) {
      setError("صيغة غير مدعومة. الصيغ المدعومة: PDF و XLSX و XLS و CSV.");
      setPhase("error");
      return;
    }

    setPhase("previewing");

    if (ext === "pdf") {
      try {
        const buffer = await file.arrayBuffer();
        pdfBufferRef.current = buffer;
        const pageCount = await countPdfPages(buffer);
        setPreview({
          fileName: file.name,
          fileSize: file.size,
          pageCount,
          objectUrl: URL.createObjectURL(file),
          isExcel: false,
        });
        setPhase("selected");
      } catch {
        setPreview({
          fileName: file.name,
          fileSize: file.size,
          pageCount: null,
          objectUrl: null,
          isExcel: false,
        });
        setPhase("selected");
      }
    } else {
      setPreview({
        fileName: file.name,
        fileSize: file.size,
        pageCount: null,
        objectUrl: null,
        isExcel: true,
      });
      setPhase("selected");
    }
  }, []);

  /* ---------------- التحليل المرئي ---------------- */
  const handleOcr = useCallback(async () => {
    const file = selectedFileRef.current;
    const buffer = pdfBufferRef.current;
    if (!file || !buffer) return;

    setPhase("ocr");
    setProgress({ phase: "loading", message: "تهيئة محرك التحليل البصري" });
    try {
      const summary = await runOcrOnPdf(
        buffer,
        async (pageNumber) => renderPdfPage(buffer, pageNumber),
        preview?.pageCount ?? 1,
        setProgress,
      );
      setOcrSummary(summary);
      ocrPagesRef.current = summary.pages.map((p) => ({ page: p.page, text: p.text }));
    } catch (err) {
      setError(
        `تعذّر تشغيل التحليل البصري: ${err instanceof Error ? err.message : "خطأ غير معروف"}. يمكنك المتابعة بالقراءة النصية.`,
      );
      setPhase("selected");
    } finally {
      await disposeOcr().catch(() => undefined);
    }
  }, [preview]);

  /* ---------------- الرفع والتحليل ---------------- */
  const handleUpload = useCallback(async () => {
    const file = selectedFileRef.current;
    if (!file) return;
    setPhase("uploading");
    setError(null);

    try {
      const ocrPages =
        ocrPagesRef.current.length > 0 ? ocrPagesRef.current : undefined;

      // المسار المفضّل: رفع مباشر من المتصفح إلى التخزين.
      // يمرّ الملف من المتصفح إلى Blob دون المرور بحجم الدالة
      // (4.5 ميغابايت على Vercel)، فينجح مع التقارير الكبيرة.
      const ticketRes = await fetch("/api/upload-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          size: file.size,
          kind,
        }),
      });
      const ticket = (await ticketRes.json()) as {
        uploadUrl?: string;
        pathname?: string;
        error?: string;
      };

      if (ticketRes.ok && ticket.uploadUrl && ticket.pathname) {
        const putRes = await fetch(ticket.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!putRes.ok) {
          throw new Error(
            "تعذّر رفع الملف إلى التخزين (" + putRes.status + "). قد يكون الحجم أكبر من 20 ميجابايت.",
          );
        }
        // خدمة التخزين ترجع الرابط الفعلي بعد الرفع، ونحتاجه لتحليل الملف
        let uploadedUrl: string | undefined;
        try {
          const putBody = (await putRes.json()) as { url?: string };
          uploadedUrl = putBody.url;
        } catch {
          uploadedUrl = undefined;
        }

        const response = await fetch("/api/analyses/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blobPathname: ticket.pathname,
            blobUrl: uploadedUrl,
            fileName: file.name,
            contentType: file.type,
            kind,
            titleHint: titleHint.trim() || undefined,
            ocrPages,
          }),
        });
        const data = (await response.json()) as UploadResult & { error?: string };
        if (!response.ok || data.error) {
          setError(data.error ?? "تعذّر تحليل الملف.");
          setPhase("error");
          return;
        }
        setResult(data);
        setPhase("done");
        onUploaded?.(data);
        return;
      }

      // المسار الاحتياطي: إرسال الملف مباشرةً (للتطوير وللملفات الصغيرة)
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      if (titleHint.trim()) form.append("titleHint", titleHint.trim());
      if (ocrPages) form.append("ocrPages", JSON.stringify(ocrPages));

      const response = await fetch("/api/analyses/ingest", { method: "POST", body: form });
      const data = (await response.json()) as UploadResult & { error?: string };

      if (!response.ok || data.error) {
        setError(data.error ?? "تعذّر رفع الملف.");
        setPhase("error");
        return;
      }

      setResult(data);
      setPhase("done");
      onUploaded?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر الاتصال بالخادم.");
      setPhase("error");
    }
  }, [kind, titleHint, onUploaded]);

  const busy = phase === "uploading" || phase === "ocr" || phase === "previewing";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-l from-brand-soft to-white">
        <CardTitle className="flex items-center gap-2 text-navy">
          <FileUp className="size-5 text-brand" aria-hidden />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* منطقة السحب والإفلات */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragOver ? "border-brand bg-brand-soft" : "border-slate-300 bg-slate-50",
          )}
        >
          <FileUp className={cn("size-10", dragOver ? "text-brand" : "text-slate-400")} aria-hidden />
          <div>
            <p className="font-semibold text-navy">اسحب ملف التقرير هنا أو اضغط للاختيار</p>
            <p className="mt-1 text-xs text-slate-500">
              الصيغ المدعومة: PDF و XLSX و XLS و CSV — الحد الأقصى 20 ميجابايت
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            اختر ملفًا
          </Button>
        </div>

        {/* معاينة الملف */}
        {preview && (
          <div className="rounded-lg border border-border bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-navy">{preview.fileName}</p>
                <p className="text-xs text-slate-500">
                  {(preview.fileSize / 1024).toFixed(0)} كيلوبايت
                  {preview.pageCount !== null ? ` — ${preview.pageCount} صفحة` : ""}
                  {preview.isExcel ? " — ملف جدول" : ""}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={busy}>
                <X className="size-4" aria-hidden />
                إزالة
              </Button>
            </div>

            {preview.objectUrl && (
              <object
                data={preview.objectUrl}
                type="application/pdf"
                className="mt-3 h-[420px] w-full rounded border border-border"
                aria-label="معاينة ملف التقرير"
              >
                <div className="flex h-full items-center justify-center p-4 text-sm text-slate-500">
                  لا يدعم المتصفح المعاينة المضمّنة. يمكنك فتح الملف في نافذة أخرى.
                </div>
              </object>
            )}

            {/* خيار التحليل البصري */}
            {!preview.isExcel && (
              <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start gap-2">
                  <ScanText className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
                  <div className="flex-1">
                    <Label htmlFor="use-ocr" className="text-amber-900">
                      الملف ممسوح ضوئيًا؟ فعّل «التحليل البصري (OCR)»
                    </Label>
                    <p className="mt-0.5 text-xs text-amber-800">
                      يقرأ الملف داخل متصفحك دون إرسال صور الصفحات إلى أي خدمة خارجية، ثم تُرسل النصوص
                      الناتجة إلى الخادم. يستغرق وقتًا أطول للملفات الكبيرة.
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <Checkbox
                        id="use-ocr"
                        checked={useOcr}
                        onCheckedChange={(v) => setUseOcr(v === true)}
                        disabled={busy}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void handleOcr()}
                        disabled={!useOcr || busy}
                      >
                        {phase === "ocr" ? (
                          <>
                            <Loader2 className="size-4 animate-spin" aria-hidden /> جارٍ التحليل البصري…
                          </>
                        ) : (
                          "تشغيل التحليل البصري"
                        )}
                      </Button>
                    </div>

                    {phase === "ocr" && progress && (
                      <div className="mt-2 space-y-1">
                        <SimpleProgress
                          value={
                            progress.total && progress.page
                              ? Math.round(((progress.page - 1) / progress.total) * 100)
                              : (progress.ratio ?? 0) * 100
                          }
                        />
                        <p className="text-xs text-amber-800">
                          {progress.message}
                          {progress.total ? ` (${progress.page}/${progress.total})` : ""}
                        </p>
                      </div>
                    )}

                    {ocrSummary && (
                      <Alert className="mt-2 border-amber-300 bg-amber-50">
                        <TriangleAlert className="size-4" />
                        <AlertTitle>
                          اكتمل التحليل البصري — متوسط الثقة {ocrSummary.averageConfidence}%
                        </AlertTitle>
                        <AlertDescription>
                          {ocrSummary.weak
                            ? "جودة القراءة ضعيفة. راجع كل مؤشر قبل الاعتماد، ولا تعتمد على النسب المستخرجة دون تحقق."
                            : "جودة القراءة مقبولة. راجع النتائج للتأكد."}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="flex-1">
                <Label htmlFor="title-hint" className="text-xs">
                  اسم التحليل (اختياري)
                </Label>
                <input
                  id="title-hint"
                  value={titleHint}
                  onChange={(e) => setTitleHint(e.target.value)}
                  placeholder="يُستخدم اسم المدرسة المستخرج من التقرير إن تُرك فارغًا"
                  className="mt-1 h-9 w-full rounded-md border border-input bg-white px-3 text-sm"
                />
              </div>
              <Button type="button" onClick={() => void handleUpload()} disabled={busy}>
                {phase === "uploading" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden /> جارٍ التحليل…
                  </>
                ) : (
                  "رفع الملف وتحليله"
                )}
              </Button>
            </div>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <TriangleAlert className="size-4" />
            <AlertTitle>تعذّر إتمام العملية</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert className={result.quality === "good" ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}>
            <TriangleAlert className="size-4" />
            <AlertTitle>
              تم استخراج {result.indicatorCount} مؤشرًا — جودة الاستخراج:{" "}
              {result.quality === "good" ? "جيدة" : result.quality === "weak" ? "ضعيفة" : "ضعيفة جدًا"}
            </AlertTitle>
            <AlertDescription>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {result.notices.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/analyses/${result.analysisId}`} className={buttonVariants({ size: "sm" })}>
                  فتح لوحة المعلومات
                </Link>
                <Link
                  href={`/analyses/${result.analysisId}/review`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  مراجعة النتائج وتصحيحها
                </Link>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  أدوات PDF في المتصفح                                               */
/* ------------------------------------------------------------------ */

type PdfModule = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfModule> | null = null;

async function getPdfjs(): Promise<PdfModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      const lib = mod as unknown as { GlobalWorkerOptions: { workerSrc: string } };
      lib.GlobalWorkerOptions.workerSrc = "/vendor/pdf/pdf.worker.min.mjs";
      return mod;
    });
  }
  return pdfjsPromise;
}

async function openPdf(buffer: ArrayBuffer) {
  const pdfjs = await getPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const doc = await task.promise;
  return { task, doc };
}

async function countPdfPages(buffer: ArrayBuffer): Promise<number> {
  try {
    const { task, doc } = await openPdf(buffer);
    const n = doc.numPages;
    await task.destroy();
    return n;
  } catch {
    return 0;
  }
}

/** يرسم صفحة PDF إلى لوحة رسم بدقة 150 نقطة لكل بوصة لإرسالها إلى OCR. */
async function renderPdfPage(buffer: ArrayBuffer, pageNumber: number): Promise<HTMLCanvasElement> {
  const { task, doc } = await openPdf(buffer);
  try {
    const page = await doc.getPage(pageNumber);
    const scale = 150 / 72;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("تعذّر تجهيز لوحة الرسم.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    return canvas;
  } finally {
    await task.destroy();
  }
}