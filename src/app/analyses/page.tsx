import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { AnalysisList } from "@/components/analysis/analysis-list";
import { listAnalyses } from "@/lib/services/analysis";
import { UploadSection } from "@/components/upload/upload-section";

export const metadata: Metadata = {
  title: "سجل التحليلات",
  description: "استرجاع تحليلات التقويم المدرسي المحفوظة وتعديلها وتصديرها.",
};

export const dynamic = "force-dynamic";

/** سجل جميع التحليلات المحفوظة. */
export default async function AnalysesPage() {
  const analyses = await listAnalyses();

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-navy sm:text-2xl">سجل التحليلات</h1>
        <p className="mt-1 text-sm text-slate-600">
          كل تحليل محفوظ في قاعدة البيانات، ويمكن استرجاعه وتعديله واعتماده وتصديره في أي وقت.
        </p>
      </div>

      <AnalysisList analyses={analyses} emptyMessage="لم يُحفظ أي تحليل بعد. ابدأ برفع تقرير من أحد القسمين." />

      <section className="panel mt-8 p-5">
        <h2 className="panel-title mb-3">إضافة تحليل جديد</h2>
        <UploadSection
          kind="external"
          title="رفع تقرير جديد"
          description="اختر القسم المناسب من صفحة التقويم الخارجي أو الذاتي، أو ارفع التقرير هنا ليُحفظ كتحليل خارجي."
        />
        <div className="mt-3 flex gap-2">
          <Link href="/external" className={buttonVariants({ variant: "outline", size: "sm" })}>
            القسم الخارجي
          </Link>
          <Link href="/self" className={buttonVariants({ variant: "outline", size: "sm" })}>
            القسم الذاتي
          </Link>
        </div>
      </section>
    </div>
  );
}