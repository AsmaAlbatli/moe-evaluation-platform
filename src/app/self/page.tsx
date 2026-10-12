import type { Metadata } from "next";
import { UploadSection } from "@/components/upload/upload-section";
import { AnalysisList } from "@/components/analysis/analysis-list";
import { listAnalyses } from "@/lib/services/analysis";
import { ANALYSIS_KIND_LABEL } from "@/lib/analysis/compute";

export const metadata: Metadata = {
  title: "تحليل تقرير التقويم المدرسي الذاتي",
  description: "رفع وتحليل تقرير التقويم المدرسي الذاتي وتحويل نتائجه إلى خطة تحسين.",
};

export const dynamic = "force-dynamic";

/** القسم الثاني: تحليل تقرير التقويم المدرسي الذاتي. */
export default async function SelfPage() {
  const analyses = await listAnalyses("self");

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-navy sm:text-2xl">
          2) {ANALYSIS_KIND_LABEL.self}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          قسم مستقل تمامًا عن القسم الخارجي. تُقرأ نتائج التقويم الذاتي وتُعرض كما وردت في الملف،
          ويُقارَن كل مؤشر بنظيره في التقويم الخارجي عند وجوده في تحليل آخر.
        </p>
      </div>

      <UploadSection
        kind="self"
        title="رفع تقرير التقويم المدرسي الذاتي"
        description="ارفع ملف التقرير بصيغة PDF أو XLSX أو XLS. يمكنك السحب والإفلات، ومعاينة الملف قبل الرفع، وتشغيل التحليل البصري للملفات الممسوحة ضوئيًا."
      />

      <section className="mt-8">
        <h2 className="panel-title mb-3">تحاليل القسم الذاتية السابقة</h2>
        <AnalysisList analyses={analyses} emptyMessage="لا توجد تحليلات ذاتية بعد. ابدأ برفع أول تقرير." />
      </section>
    </div>
  );
}