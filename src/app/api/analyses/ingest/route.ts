import { NextResponse } from "next/server";
import { ingestReport, type IngestResult } from "@/lib/services/ingest";
import type { AnalysisKind } from "@/lib/analysis/compute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * استقبال ملف التقرير واستخراجه وإنشاء تحليل جديد.
 * يقبل multipart/form-data مع الحقول: file, kind, titleHint, ocrPages (JSON)
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const kindRaw = String(form.get("kind") ?? "external");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "لم يُرسل أي ملف." }, { status: 400 });
    }
    const kind: AnalysisKind = kindRaw === "self" ? "self" : "external";

    const buffer = Buffer.from(await file.arrayBuffer());

    let ocrPages: { page: number; text: string }[] | undefined;
    const ocrRaw = form.get("ocrPages");
    if (typeof ocrRaw === "string" && ocrRaw.trim().length > 0) {
      try {
        const parsed = JSON.parse(ocrRaw);
        if (Array.isArray(parsed)) {
          ocrPages = parsed
            .filter((p) => p && typeof p.text === "string")
            .map((p, i) => ({ page: Number(p.page) || i + 1, text: String(p.text) }));
        }
      } catch {
        return NextResponse.json(
          { error: "نص التحليل البصري (OCR) غير صالح. أعد المحاولة دون تحديده أو أرسل بيانات صحيحة." },
          { status: 400 },
        );
      }
    }

    const result: IngestResult = await ingestReport(
      { name: file.name, type: file.type, buffer },
      {
        kind,
        titleHint: typeof form.get("titleHint") === "string" ? String(form.get("titleHint")) : undefined,
        ocrPages: ocrPages && ocrPages.length > 0 ? ocrPages : undefined,
      },
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطأ غير متوقع أثناء معالجة الملف.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}