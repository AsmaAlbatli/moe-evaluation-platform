import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TriangleAlert } from "lucide-react";
import { loadFullAnalysis } from "@/lib/services/analysis";
import { ANALYSIS_KIND_LABEL } from "@/lib/analysis/compute";
import { AnalysisTabs } from "@/components/analysis/analysis-tabs";
import { analysisTabs } from "@/lib/analysis-tabs";
import { ExportToolbar } from "@/components/analysis/export-toolbar";
import { buildDomainSummaries } from "@/lib/analysis/compute";
import { getSettings } from "@/lib/settings";
import { DomainBarChart } from "@/components/charts/domain-bar-chart";
import { DomainRadarChart } from "@/components/charts/domain-radar-chart";
import { LevelDonutChart } from "@/components/charts/level-donut-chart";
import { InteractiveHeatmap } from "@/components/charts/interactive-heatmap";
import { LevelBadge, PercentValue, SourceChip } from "@/components/common/level-badge";
import { SCHOOL_FIELDS } from "@/lib/extract/rows";
import { QUALITY_LABEL } from "@/lib/export/bundle";
import { ProgressBar } from "@/components/analysis/progress-bar";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/analyses/[id]">): Promise<Metadata> {
  const { id } = await params;
  const full = await loadFullAnalysis(id);
  return { title: full?.record.title ?? "التحليل" };
}

/** لوحة معلومات التحليل: بطاقات البيانات، المجالات، المخططات، والخريطة الحرارية. */
export default async function AnalysisDashboardPage({ params }: PageProps<"/analyses/[id]">) {
  const { id } = await params;
  const [full, settings] = await Promise.all([loadFullAnalysis(id), getSettings()]);
  if (!full) notFound();

  const { record, indicators, coverage, priorities } = full;

  // إعادة بناء الملخصات بحدود الإعدادات الحالية حتى تتحدث الخريطة الحرارية فورًا
  const domains = buildDomainSummaries({
    indicators,
    reportedDomains: new Map(
      full.domains
        .filter((d) => d.aggregate.kind === "reported")
        .map((d) => [d.id, { value: d.aggregate.reported as number, ref: d.aggregate.source }]),
    ),
    reportedCriteria: new Map(),
    thresholds: settings.thresholds,
  });

  const levelTotals = {
    tahyea: indicators.filter((i) => i.level === "tahyea").length,
    intilaq: indicators.filter((i) => i.level === "intilaq").length,
    taqaddum: indicators.filter((i) => i.level === "taqaddum").length,
    tamayyuz: indicators.filter((i) => i.level === "tamayyuz").length,
    unknown: indicators.filter((i) => i.percent !== null && i.level === null).length,
    missing: indicators.filter((i) => i.percent === null).length,
  };

  const school = record.school;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy sm:text-2xl">
            {school.name ?? "اسم المدرسة غير متوفر"}
          </h1>
          <p className="text-sm text-slate-600">{record.title}</p>
        </div>
        <ExportToolbar analysisId={record.id} />
      </div>

      <AnalysisTabs
        analysisId={record.id}
        status={record.status}
        kindLabel={ANALYSIS_KIND_LABEL[record.kind]}
        tabs={analysisTabs(record.id)}
      />

      {/* تنبيهات الدقة */}
      {full.notices.length > 0 && (
        <Alert className="mt-4 border-amber-300 bg-amber-50">
          <TriangleAlert className="size-4" />
          <AlertTitle>تنبيهات قبل الاعتماد</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {full.notices.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* بطاقات بيانات المدرسة */}
      <section className="panel mt-5 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="panel-title">بطاقات بيانات المدرسة</h2>
          <Link href={`/analyses/${record.id}/review`} className="text-xs font-semibold text-brand hover:underline">
            تصحيح البيانات ←
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {SCHOOL_FIELDS.filter((f) => f.key !== "overallPercent").map((f) => {
            const raw = (school as unknown as Record<string, unknown>)[f.key];
            const value = raw === null || raw === undefined || raw === "" ? null : (raw as string | number);
            return (
              <div key={f.key} className="rounded-lg border border-border bg-slate-50 p-3">
                <p className="text-[11px] text-slate-500">{f.label}</p>
                <p className="mt-0.5 text-sm font-bold text-navy break-words">
                  {value === null ? <span className="not-available">غير متوفرة</span> : String(value)}
                </p>
                <p className="mt-1 text-[10px] text-slate-400">
                  {value === null ? "لم ترد في الملف — يلزم إدخال يدوي" : "بيانات المدرسة"}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-lg border-2 border-navy/15 bg-brand-soft/50 p-4 text-center">
          <p className="text-xs font-semibold text-slate-600">النسبة العامة</p>
          <p className="num mt-1 text-3xl font-bold text-navy">
            {record.overallPercent === null ? (
              <span className="text-base font-semibold text-slate-400">غير متوفرة</span>
            ) : (
              `${record.overallPercent}%`
            )}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {record.overallSource === "extracted"
              ? "كما وردت في التقرير"
              : record.overallSource === "manual"
                ? "إدخال يدوي من المدرسة"
                : "لم ترد في التقرير — لم تحسبها المنصة تفاديًا لافتراض منهجية احتساب غير معروفة"}
          </p>
        </div>
      </section>

      {/* بطاقات المجالات الأربعة */}
      <section className="panel mt-5 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="panel-title">المجالات الأربعة</h2>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="chip bg-slate-100">
              تغطية النسب: {coverage.withPercent} من {coverage.total} ({coverage.percentComplete}%)
            </span>
            <span className="chip bg-slate-100">تمت مراجعة {coverage.reviewed} مؤشرًا</span>
            {record.extractionQuality && (
              <SourceChip label={`جودة الاستخراج: ${QUALITY_LABEL[record.extractionQuality] ?? "—"}`} />
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {domains.map((d) => {
            const reported = d.aggregate.kind === "reported";
            return (
              <Link
                key={d.id}
                href={`/analyses/${record.id}/indicators?domain=${d.id}`}
                className="rounded-lg border border-border bg-white p-4 transition-all hover:border-brand hover:shadow-sm"
                style={{ borderTopWidth: 4, borderTopColor: d.level ? undefined : "#94A3B8" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-navy">{d.name}</h3>
                  <LevelBadge level={d.level} levelSource={d.levelSource} />
                </div>

                <p className="num mt-2 text-2xl font-bold text-navy">
                  {d.aggregate.display === null ? (
                    <span className="text-sm font-semibold text-slate-400">غير متوفر</span>
                  ) : (
                    <>
                      {d.aggregate.display}%
                      {!reported && <span className="text-[10px] font-medium text-amber-700"> استرشادي</span>}
                    </>
                  )}
                </p>

                <p className="mt-1 text-[11px] leading-snug text-slate-500">
                  {reported
                    ? "النسبة الرسمية كما وردت في التقرير"
                    : "متوسط حسابي للمؤشرات المتاحة — ليس النسبة الرسمية"}
                </p>

                <div className="mt-2 flex flex-wrap gap-1">
                  {d.criteria.map((c) => (
                    <span
                      key={c.code}
                      className="chip border px-1.5 py-0 text-[10px]"
                      style={{
                        borderColor: c.level ? undefined : "#CBD5E1",
                        backgroundColor: c.level
                          ? `${c.level === "tahyea" ? "#FEE2E2" : c.level === "intilaq" ? "#FFEDD5" : c.level === "taqaddum" ? "#DBEAFE" : "#DCFCE7"}`
                          : "#F8FAFC",
                        color: c.level
                          ? c.level === "tahyea"
                            ? "#DC2626"
                            : c.level === "intilaq"
                              ? "#EA580C"
                              : c.level === "taqaddum"
                                ? "#2563EB"
                                : "#16A34A"
                          : "#94A3B8",
                      }}
                      title={`${c.name} — ${c.aggregate.display === null ? "غير متوفر" : `${c.aggregate.display}%`}`}
                    >
                      {c.name}
                    </span>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* المخططات */}
      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="panel-title mb-3">مقارنة المجالات (مخطط أعمدة)</h2>
          <DomainBarChart
            data={domains.map((d) => ({
              id: d.id,
              name: d.name,
              value: d.aggregate.display,
              level: d.level,
              kind: d.aggregate.kind,
            }))}
          />
        </div>

        <div className="panel p-5">
          <h2 className="panel-title mb-3">توزيع مستويات المؤشرات (مخطط دائري)</h2>
          <LevelDonutChart counts={levelTotals} total={indicators.length} />
        </div>

        <div className="panel p-5">
          <h2 className="panel-title mb-3">الأداء العام (مخطط راداري)</h2>
          <DomainRadarChart
            data={domains.map((d) => ({
              name: d.name,
              value: d.aggregate.display,
              level: d.level,
              computed: d.aggregate.kind === "computed",
            }))}
          />
        </div>

        <div className="panel p-5">
          <h2 className="panel-title mb-3">أولويات التحسين</h2>
          {priorities.length === 0 ? (
            <p className="text-sm text-slate-500">لا توجد مؤشرات ذات أولوية واضحة في البيانات الحالية.</p>
          ) : (
            <ol className="space-y-2">
              {priorities.slice(0, 8).map((p) => (
                <li key={p.indicator.code} className="flex gap-2">
                  <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
                    {p.rank}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-navy">
                      {p.indicator.code} — {p.indicator.text}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {p.reason} | النسبة: <PercentValue value={p.indicator.percent} />{" "}
                      <LevelBadge level={p.indicator.level} levelSource={p.indicator.levelSource} />
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <Link
            href={`/analyses/${record.id}/plan`}
            className="mt-3 inline-block text-xs font-semibold text-brand hover:underline"
          >
            تحويلها إلى خطة تحسين ←
          </Link>
        </div>
      </section>

      {/* الخريطة الحرارية */}
      <section className="panel mt-5 p-5">
        <h2 className="panel-title mb-3">الخريطة الحرارية لكل المؤشرات</h2>
        <InteractiveHeatmap
          analysisId={record.id}
          groups={domains.map((d) => ({
            name: d.name,
            indicators: d.indicators.map((i) => ({
              code: i.code,
              text: i.text,
              percent: i.percent,
              level: i.level,
              reviewed: i.reviewed,
            })),
          }))}
        />
      </section>

      {/* نسبة الإنجاز المراجَعة */}
      <section className="panel mt-5 p-5">
        <h2 className="panel-title mb-3">اكتمال المراجعة قبل الاعتماد</h2>
        <ProgressBar coverage={coverage} analysisId={record.id} thresholdsEnabled={settings.thresholds.enabled} />
      </section>
    </div>
  );
}