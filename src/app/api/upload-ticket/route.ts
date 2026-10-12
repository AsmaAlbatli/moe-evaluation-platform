import { NextResponse } from "next/server";
import { z } from "zod";
import { createUploadTicket, ALLOWED_CONTENT_TYPES } from "@/lib/storage/upload-ticket";
import { MAX_FILE_BYTES, ACCEPTED_EXTENSIONS, detectKind } from "@/lib/services/ingest";
import { buildStorageKey } from "@/lib/storage";
import type { AnalysisKind } from "@/lib/analysis/compute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * إصدار تذكرة رفع للملف مباشرةً إلى التخزين.
 *
 * السبب: حدود دوال Vercel 4.5 ميغابايت، وهي أصغر من حجم تقارير
 * التقويم المدرسي الحقيقية. برفع الملف من المتصفح مباشرةً إلى Blob
 * نتجاوز هذا الحدّ تمامًا.
 */

const BodySchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().max(200).optional().nullable(),
  size: z.number().int().positive(),
  kind: z.enum(["external", "self"]).default("external"),
});

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());

    if (body.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "حجم الملف يتجاوز 20 ميجابايت. يرجى ضغط الملف أو تقسيمه ثم إعادة الرفع." },
        { status: 400 },
      );
    }

    // نتحقق من الامتداد أيضًا لا من نوع المحتوى وحده
    const kindOfFile = detectKind(body.fileName);
    if (!kindOfFile) {
      return NextResponse.json(
        { error: "صيغة غير مدعومة. الصيغ المدعومة: PDF و XLSX و XLS و CSV." },
        { status: 400 },
      );
    }

    const analysisKind: AnalysisKind = body.kind;
    // اسم عشوائي يمنع التصادم بين ملفين بنفس الاسم
    const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const storageKey = buildStorageKey(`${unique}--${body.fileName}`, analysisKind);
    const pathname = storageKey.split("/").slice(1).join("/");

    const ticket = await createUploadTicket({
      pathname,
      contentType: body.contentType,
      maxBytes: MAX_FILE_BYTES,
    });

    return NextResponse.json({
      ok: true,
      uploadUrl: ticket.uploadUrl,
      pathname: ticket.pathname,
      maxBytes: ticket.maxBytes,
      extensions: ACCEPTED_EXTENSIONS,
      contentTypes: ALLOWED_CONTENT_TYPES,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "بيانات التذكرة غير صالحة.", details: error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : "تعذّر إصدار تذكرة الرفع.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}