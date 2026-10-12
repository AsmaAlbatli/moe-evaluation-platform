import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { loadFullAnalysis } from "@/lib/services/analysis";
import { getAiAvailability } from "@/lib/ai/client";
import { ANALYSIS_KIND_LABEL } from "@/lib/analysis/compute";
import { AnalysisTabs } from "@/components/analysis/analysis-tabs";
import { analysisTabs } from "@/lib/analysis-tabs";
import { IndicatorsWorkspace } from "@/components/analysis/indicators-workspace";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/analyses/[id]/indicators">): Promise<Metadata> {
  const { id } = await params;
  const full = await loadFullAnalysis(id);
  return { title: full ? `تحليل المؤشرات — ${full.record.title}` : "تحليل المؤشرات" };
}

/** تحليل المؤشرات والتوصيات المرتبطة بكل مؤشر. */
export default async function IndicatorsPage({ params }: PageProps<"/analyses/[id]/indicators">) {
  const { id } = await params;
  const [full, ai] = await Promise.all([loadFullAnalysis(id), Promise.resolve(getAiAvailability())]);
  if (!full) notFound();

  const recommendations = Object.fromEntries(
    [...full.recommendations.entries()].map(([code, rec]) => [code, rec]),
  );

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-6">
      <h1 className="mb-3 text-xl font-bold text-navy sm:text-2xl">تحليل المؤشرات والتوصيات</h1>
      <AnalysisTabs
        analysisId={full.record.id}
        status={full.record.status}
        kindLabel={ANALYSIS_KIND_LABEL[full.record.kind]}
        tabs={analysisTabs(full.record.id)}
      />

      <div className="mt-5">
        <Suspense fallback={<p className="text-sm text-slate-500">جارٍ التحميل…</p>}>
          <IndicatorsWorkspace
            analysisId={full.record.id}
            indicators={full.indicators}
            recommendations={recommendations}
            aiEnabled={ai.enabled}
            aiReason={ai.reason}
          />
        </Suspense>
      </div>
    </div>
  );
}