import { NextResponse } from "next/server";
import { loadFullAnalysis, toExportBundle } from "@/lib/services/analysis";
import { buildAnalysisWorkbook } from "@/lib/export/excel";
import { signFileToken } from "@/lib/storage";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * تصدير Excel متعدد الأوراق:
 * بيانات المدرسة، ملخص المجالات، تفاصيل المؤشرات، التحليل والتوصيات،
 * خطة التحسين، سجل التعديلات، ومرجع حدود المستويات.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/analyses/[id]/export/excel">) {
  const { id } = await ctx.params;
  const full = await loadFullAnalysis(id);
  if (!full) return NextResponse.json({ error: "التحليل غير موجود." }, { status: 404 });

  const settings = await getSettings();
  const logoUrl = settings.logoStorageKey
    ? `/api/brand/logo?token=${encodeURIComponent(signFileToken(settings.logoStorageKey))}`
    : null;

  try {
    const bundle = toExportBundle(full, logoUrl);
    const buffer = await buildAnalysisWorkbook(bundle);

    const parts = ["تحليل_نتائج_التقويم_المدرسي"];
    if (bundle.school.find((f) => f.key === "name")?.value) {
      parts.push(String(bundle.school.find((f) => f.key === "name")!.value));
    }
    parts.push(bundle.meta.kind === "external" ? "خارجي" : "ذاتي");
    const fileName = `${parts.join("_")}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Length": String(buffer.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذّر إنشاء ملف Excel.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}