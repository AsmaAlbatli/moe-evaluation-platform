import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ingestReport,
  type IngestResult,
  detectKind,
  MAX_FILE_BYTES,
} from "@/lib/services/ingest";
import type { AnalysisKind } from "@/lib/analysis/compute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * استقبال ملف التقرير واستخراجه وإنشاء تحليل جديد.
 *  - multipart/form-data مع الحقول: file, kind, titleHint, ocrPages (JSON)
 *    وهو المسار المعتاد للملفات الصغيرة.
 *  - JSON مع الحقل blobPathname للملفات التي رُفعت مسبقًا مباشرةً إلى
 *    التخزين من المتصفح (يتجاوز حدّ 4.5 ميغابايت الخاص بدوال الخادم).
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    /* ---------- مسار الملف المرفوع مسبقًا إلى التخزين ---------- */
    if (contentType.includes("application/json")) {
      return ingestFromBlob(request);
    }

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

/* ------------------------------------------------------------------ */
/*  مسار الملف المرفوع مسبقًا إلى التخزين                             */
/* ------------------------------------------------------------------ */

const BlobIngestSchema = z.object({
  blobPathname: z.string().min(1).max(400),
  /** رابط Blob الكامل كما أعادته خدمة التخزين بعد الرفع */
  blobUrl: z.string().url().max(1000).optional(),
  fileName: z.string().min(1).max(255),
  contentType: z.string().max(200).optional().nullable(),
  kind: z.enum(["external", "self"]).default("external"),
  titleHint: z.string().max(300).optional(),
  ocrPages: z
    .array(z.object({ page: z.number().int().positive(), text: z.string() }))
    .optional(),
});

/**
 * يحلّل ملفًا رُفع مباشرةً إلى Blob من المتصفح.
 * يُنزّل الملف في الخادم ثم يمرّره على نفس مسار الاستخراج المعتاد.
 */
async function ingestFromBlob(request: Request): Promise<NextResponse> {
  try {
    const body = BlobIngestSchema.parse(await request.json());

    const kind: AnalysisKind = body.kind === "self" ? "self" : "external";
    if (!detectKind(body.fileName)) {
      return NextResponse.json(
        { error: "صيغة غير مدعومة. الصيغ المدعومة: PDF و XLSX و XLS و CSV." },
        { status: 400 },
      );
    }

    const blob = (await import("@vercel/blob")) as unknown as {
      get: (urlOrPathname: string, opts?: { access?: string }) => Promise<{
        stream: ReadableStream<Uint8Array>;
        size: number;
        contentType?: string;
      }>;
    };

    // للملفات الخاصة يجب تمرير رابط Blob الكامل، لا المسار فقط.
    // نتحقق أيضًا من أن الرابط على نطاق تخزين Vercel وحده،
    // حتى لا يُستخدم هذا المسار لفتح عناوين خارجية.
    const target = body.blobUrl ?? body.blobPathname;
    if (body.blobUrl && !/\.blob\.vercel-storage\.com\/|^blob:/i.test(body.blobUrl)) {
      return NextResponse.json(
        { error: "رابط الملف المرفوع غير صالح." },
        { status: 400 },
      );
    }

    const stored = await blob.get(target, { access: "private" });
    if (!stored || typeof stored.stream !== "object" || stored.stream === null) {
      return NextResponse.json(
        { error: "تعذّر العثور على الملف في التخزين. أعد رفع الملف." },
        { status: 400 },
      );
    }
    const buffer = Buffer.from(await new Response(stored.stream).arrayBuffer());

    if (buffer.length > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "حجم الملف يتجاوز 20 ميجابايت. يرجى ضغط الملف أو تقسيمه ثم إعادة الرفع." },
        { status: 400 },
      );
    }

    const result: IngestResult = await ingestReport(
      {
        name: body.fileName,
        type: body.contentType || "application/octet-stream",
        buffer,
      },
      {
        kind,
        titleHint: body.titleHint,
        ocrPages: body.ocrPages && body.ocrPages.length > 0 ? body.ocrPages : undefined,
        // الملف موجود في التخزين أصلًا، فلا نرفعه مرتين
        alreadyStored: true,
        storageKey: body.blobPathname,
      },
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "بيانات الطلب غير صالحة.", details: error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }
    const message =
      error instanceof Error ? error.message : "تعذّر قراءة الملف من التخزين.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}