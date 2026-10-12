import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadFullAnalysis } from "@/lib/services/analysis";
import { getSettings } from "@/lib/settings";
import { ANALYSIS_KIND_LABEL } from "@/lib/analysis/compute";
import { AnalysisTabs } from "@/components/analysis/analysis-tabs";
import { analysisTabs } from "@/lib/analysis-tabs";
import { ReviewWorkspace } from "@/components/analysis/review-workspace";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/analyses/[id]/review">): Promise<Metadata> {
  const { id } = await params;
  const full = await loadFullAnalysis(id);
  return { title: full ? `مراجعة — ${full.record.title}` : "مراجعة النتائج" };
}

/** شاشة مراجعة كل مؤشر وتصحيحه قبل حفظ التحليل واعتماده. */
export default async function ReviewPage({ params }: PageProps<"/analyses/[id]/review">) {
  const { id } = await params;
  const [full, settings] = await Promise.all([loadFullAnalysis(id), getSettings()]);
  if (!full) notFound();

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-6">
      <h1 className="mb-3 text-xl font-bold text-navy sm:text-2xl">مراجعة النتائج وتصحيحها</h1>
      <AnalysisTabs
        analysisId={full.record.id}
        status={full.record.status}
        kindLabel={ANALYSIS_KIND_LABEL[full.record.kind]}
        tabs={analysisTabs(full.record.id)}
      />

      <div className="mt-5">
        <ReviewWorkspace
          analysisId={full.record.id}
          status={full.record.status}
          indicators={full.indicators}
          school={full.record.school as unknown as Record<string, string | number | null>}
          overallPercent={full.record.overallPercent}
          thresholdsEnabled={settings.thresholds.enabled}
          files={full.files}
        />
      </div>
    </div>
  );
}