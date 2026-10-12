import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadFullAnalysis } from "@/lib/services/analysis";
import { ANALYSIS_KIND_LABEL } from "@/lib/analysis/compute";
import { AnalysisTabs } from "@/components/analysis/analysis-tabs";
import { analysisTabs } from "@/lib/analysis-tabs";
import { PlanWorkspace } from "@/components/analysis/plan-workspace";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/analyses/[id]/plan">): Promise<Metadata> {
  const { id } = await params;
  const full = await loadFullAnalysis(id);
  return { title: full ? `خطة التحسين — ${full.record.title}` : "خطة التحسين" };
}

/** خطة التحسين: تحويل التوصيات إلى بنود تنفيذية ومتابعة نسب الإنجاز. */
export default async function PlanPage({ params }: PageProps<"/analyses/[id]/plan">) {
  const { id } = await params;
  const full = await loadFullAnalysis(id);
  if (!full) notFound();

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-6">
      <h1 className="mb-3 text-xl font-bold text-navy sm:text-2xl">خطة التحسين</h1>
      <AnalysisTabs
        analysisId={full.record.id}
        status={full.record.status}
        kindLabel={ANALYSIS_KIND_LABEL[full.record.kind]}
        tabs={analysisTabs(full.record.id)}
      />

      <div className="mt-5">
        <PlanWorkspace
          analysisId={full.record.id}
          plans={full.plans}
          indicators={full.indicators}
        />
      </div>
    </div>
  );
}