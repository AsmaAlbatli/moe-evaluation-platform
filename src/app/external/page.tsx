import type { Metadata } from "next";
import { UploadSection } from "@/components/upload/upload-section";
import { AnalysisList } from "@/components/analysis/analysis-list";
import { listAnalyses } from "@/lib/services/analysis";
import { ANALYSIS_KIND_LABEL } from "@/lib/analysis/compute";

export const metadata: Metadata = {
  title: "تحليل تقرير التقويم المدرسي الخارجي",
  description: "رفع وتحليل تقرير التقويم المدرسي الخارجي وتحويل نتائجه إلى خطة تحسين.",
};

export const dynamic = "force-dynamic";

/** القسم الأول: تحليل تقرير التقويم المدرسي الخارجي. */
export default async function ExternalPage() {
  const analyses = await listAnalyses("external");

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-navy sm:text-2xl">
          1) {ANALYSIS_KIND_LABEL.external}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          قسم مستقل لتحليل تقرير هيئة تقويم التعليم والتدريب. تُقرأ كل النتائج تلقائيًا مع مرجع كل
          نتيجة (رقم الصفحة أو الخلية)، ثم تُراجع وتُصحَّح قبل اعتماد التحليل.
        </p>
      </div>

      <UploadSection
        kind="external"
        title="رفع تقرير التقويم المدرسي الخارجي"
        description="ارفع ملف التقرير بصيغة PDF أو XLSX أو XLS. يمكنك السحب والإفلات، ومعاينة الملف قبل الرفع، وتشغيل التحليل البصري للملفات الممسوحة ضوئيًا."
      />

      <section className="mt-8">
        <h2 className="panel-title mb-3">تحاليل القسم الخارجية السابقة</h2>
        <AnalysisList analyses={analyses} emptyMessage="لا توجد تحليلات خارجية بعد. ابدأ برفع أول تقرير." />
      </section>
    </div>
  );
}