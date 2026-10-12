import Link from "next/link";
import { ClipboardCheck, ListChecks, TriangleAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { formatDate, type AnalysisListItem } from "@/lib/services/analysis";
import type { AnalysisKind } from "@/lib/analysis/compute";
import { cn } from "@/lib/utils";

export type { AnalysisListItem };

const STATUS_LABEL: Record<string, string> = { in_review: "قيد المراجعة", approved: "معتمد" };
const QUALITY_LABEL: Record<string, string> = {
  good: "جيدة",
  weak: "ضعيفة",
  poor: "ضعيفة جدًا",
};

/** قائمة التحليلات المحفوظة مع إمكانية الفتح والتعديل. */
export function AnalysisList({
  analyses,
  emptyMessage,
  kindFilter,
}: {
  analyses: AnalysisListItem[];
  emptyMessage: string;
  kindFilter?: AnalysisKind;
}) {
  const rows = kindFilter ? analyses.filter((a) => a.kind === kindFilter) : analyses;

  if (rows.length === 0) {
    return (
      <div className="panel flex flex-col items-center gap-2 p-8 text-center">
        <TriangleAlert className="size-8 text-slate-300" aria-hidden />
        <p className="text-sm text-slate-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((a) => (
        <li key={a.id} className="panel flex flex-col p-4">
          <div className="flex items-start justify-between gap-2">
            <span
              className={cn(
                "chip",
                a.kind === "external"
                  ? "bg-brand-soft text-brand"
                  : "bg-emerald-50 text-emerald-700",
              )}
            >
              {a.kind === "external" ? (
                <ClipboardCheck className="size-3" aria-hidden />
              ) : (
                <ListChecks className="size-3" aria-hidden />
              )}
              {a.kind === "external" ? "خارجي" : "ذاتي"}
            </span>
            <span
              className={cn(
                "chip",
                a.status === "approved" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700",
              )}
            >
              {STATUS_LABEL[a.status] ?? a.status}
            </span>
          </div>

          <h3 className="mt-2 font-bold text-navy">{a.school.name ?? "اسم المدرسة غير متوفر"}</h3>
          <p className="line-clamp-2 text-xs text-slate-500">{a.title}</p>

          <dl className="mt-3 grid grid-cols-2 gap-1 text-[11px] text-slate-600">
            <div>
              <dt className="inline text-slate-400">المرحلة: </dt>
              <dd className="inline">{a.school.stage ?? "غير متوفرة"}</dd>
            </div>
            <div>
              <dt className="inline text-slate-400">الرقم: </dt>
              <dd className="inline">{a.school.ministryNo ?? "غير متوفر"}</dd>
            </div>
            <div>
              <dt className="inline text-slate-400">النسبة العامة: </dt>
              <dd className="inline font-semibold text-navy">
                {a.overallPercent === null ? "غير متوفرة" : `${a.overallPercent}%`}
              </dd>
            </div>
            <div>
              <dt className="inline text-slate-400">المؤشرات: </dt>
              <dd className="inline">{a._count.indicators}</dd>
            </div>
          </dl>

          {a.extractionQuality && a.extractionQuality !== "good" && (
            <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
              جودة الاستخراج: {QUALITY_LABEL[a.extractionQuality] ?? a.extractionQuality}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">آخر تحديث: {formatDate(a.updatedAt)}</span>
            <Link href={`/analyses/${a.id}`} className={buttonVariants({ size: "sm" })}>
              فتح
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}