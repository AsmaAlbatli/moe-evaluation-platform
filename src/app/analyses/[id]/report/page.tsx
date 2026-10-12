import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadFullAnalysis } from "@/lib/services/analysis";
import { ANALYSIS_KIND_LABEL } from "@/lib/analysis/compute";
import { AnalysisTabs } from "@/components/analysis/analysis-tabs";
import { analysisTabs } from "@/lib/analysis-tabs";
import { ExportToolbar } from "@/components/analysis/export-toolbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DATA_SHEETS } from "@/lib/export/sheets";
import { QUALITY_LABEL } from "@/lib/export/bundle";
import { formatDate } from "@/lib/services/analysis";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/analyses/[id]/report">): Promise<Metadata> {
  const { id } = await params;
  const full = await loadFullAnalysis(id);
  return { title: full ? `التقرير — ${full.record.title}` : "التقرير والتصدير" };
}

/** التقرير المعتمد: الطباعة على A4 وتصدير PDF و Excel. */
export default async function ReportPage({ params }: PageProps<"/analyses/[id]/report">) {
  const { id } = await params;
  const full = await loadFullAnalysis(id);
  if (!full) notFound();

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy sm:text-2xl">التقرير المعتمد والتصدير</h1>
          <p className="text-sm text-slate-600">
            {full.record.title} — حالة التقرير: {full.record.status === "approved" ? "معتمد" : "قيد المراجعة"}
          </p>
        </div>
        <ExportToolbar analysisId={full.record.id} />
      </div>

      <AnalysisTabs
        analysisId={full.record.id}
        status={full.record.status}
        kindLabel={ANALYSIS_KIND_LABEL[full.record.kind]}
        tabs={analysisTabs(full.record.id)}
      />

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="bg-gradient-to-l from-brand-soft to-white">
            <CardTitle className="text-navy">الطباعة والتصدير إلى PDF</CardTitle>
            <CardDescription>
              يُولّد المنصة صفحة HTML عربية مستقلة باتجاه من اليمين إلى اليسار، بمقاس A4 ومخططات SVG
              مضمّنة وجداول واضحة. عند اختيار «تصدير PDF» تُفتح صفحة مهيأة للطباعة، وفي نافذة الطباعة
              اختر «حفظ كـ PDF» للحصول على الملف.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="list-inside list-disc space-y-1 text-xs text-slate-600">
              <li>يشمل التقرير: بيانات المدرسة، بطاقات المجالات، المخططات، الخريطة الحرارية، جدول المؤشرات، التوصيات، خطة التحسين، وسجل التعديلات.</li>
              <li>يُذكر مرجع كل نتيجة (رقم الصفحة أو الخلية) بجوارها.</li>
              <li>تُميّز التوصيات المقترحة عن البيانات المستخرجة في كل موضع.</li>
              <li>تُذكر مرجع حدود مستويات الأداء في نهاية التقرير.</li>
            </ul>
            <ExportToolbar analysisId={full.record.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="bg-gradient-to-l from-brand-soft to-white">
            <CardTitle className="text-navy">أوراق ملف Excel</CardTitle>
            <CardDescription>مصنّف متعدد الأوراق باتجاه عربي من اليمين إلى اليسار.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm">
              {DATA_SHEETS.map((s, i) => (
                <li key={s} className="flex gap-2">
                  <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <ExportToolbar analysisId={full.record.id} className="mt-4" />
          </CardContent>
        </Card>
      </div>

      {/* ملخص التصدير */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-navy">محتوى التقرير الحالي</CardTitle>
          <CardDescription>ما سيُصدَّر في هذه النسخة.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "المؤشرات المسجلة", value: `${full.indicators.filter((i) => i.presentInFile).length} من ${full.indicators.length}` },
              { label: "بنود خطة التحسين", value: String(full.plans.length) },
              { label: "قيود التعديلات", value: String(full.revisions.length) },
              { label: "جودة الاستخراج", value: recordQualityLabel(full.record.extractionQuality) },
              { label: "النسبة العامة", value: full.record.overallPercent === null ? "غير متوفرة" : `${full.record.overallPercent}%` },
              { label: "حدود المستويات", value: full.thresholds.enabled ? "معتمدة" : "غير مفعّلة" },
              { label: "عدد التنبيهات", value: String(full.notices.length) },
              { label: "تاريخ الإصدار", value: formatDate(new Date()) },
            ].map((row) => (
              <div key={row.label} className="rounded border border-border bg-slate-50 p-3">
                <dt className="text-[11px] text-slate-500">{row.label}</dt>
                <dd className="text-sm font-bold text-navy">{row.value}</dd>
              </div>
            ))}
          </dl>

          {full.notices.length > 0 && (
            <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs font-bold text-amber-900">تنبيهات ستظهر في التقرير المصدَّر:</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-amber-800">
                {full.notices.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function recordQualityLabel(quality: string | null): string {
  if (!quality) return "غير محدد";
  return QUALITY_LABEL[quality] ?? quality;
}