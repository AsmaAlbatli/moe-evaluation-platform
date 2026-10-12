import { NextResponse } from "next/server";
import { loadFullAnalysis, toExportBundle } from "@/lib/services/analysis";
import { buildReportHtml } from "@/lib/export/report-html";
import { signFileToken } from "@/lib/storage";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * تقرير HTML عربي قابل للطباعة على A4 وللتصدير إلى PDF من المتصفح.
 * الصفحة مستقلة تمامًا: تنسيقات ومخططات SVG مضمّنة بلا اعتماد على سكربتات.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/analyses/[id]/export/report">) {
  const { id } = await ctx.params;
  const full = await loadFullAnalysis(id);
  if (!full) return NextResponse.json({ error: "التحليل غير موجود." }, { status: 404 });

  const settings = await getSettings();
  const logoUrl = settings.logoStorageKey
    ? `/api/brand/logo?token=${encodeURIComponent(signFileToken(settings.logoStorageKey))}`
    : null;

  const bundle = toExportBundle(full, logoUrl);
  const html = buildReportHtml(bundle);

  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";
  const fileName = `${full.record.title.replace(/[\\/:*?"<>|]/g, "-")}.html`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...(download ? { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` } : {}),
    },
  });
}