"use client";

import Link from "next/link";
import { CheckCircle2, CircleDashed, ListChecks } from "lucide-react";
import { SimpleProgress } from "@/components/common/simple-progress";
import { buttonVariants } from "@/components/ui/button";

export interface CoverageLike {
  total: number;
  withPercent: number;
  withLevel: number;
  reviewed: number;
  percentComplete: number;
  reviewedComplete: boolean;
}

/**
 * شريط يوضح اكتمال المراجعة.
 * يوضّح بصراحةً أن المؤشر بلا نسبة ليس «صفرًا»، بل «غير متوفر» يحتاج مراجعة.
 */
export function ProgressBar({
  coverage,
  analysisId,
  thresholdsEnabled,
}: {
  coverage: CoverageLike;
  analysisId: string;
  thresholdsEnabled: boolean;
}) {
  const reviewedPct = coverage.total > 0 ? Math.round((coverage.reviewed / coverage.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-semibold text-navy">اكتمال مراجعة المؤشرات</span>
          <span className="num font-bold text-navy">
            {coverage.reviewed} من {coverage.total} ({reviewedPct}%)
          </span>
        </div>
        <SimpleProgress value={reviewedPct} className="h-2.5" />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-semibold text-navy">تغطية النتائج المستخرجة</span>
          <span className="num font-bold text-navy">
            {coverage.withPercent} من {coverage.total} ({coverage.percentComplete}%)
          </span>
        </div>
        <SimpleProgress value={coverage.percentComplete} className="h-2.5" />
      </div>

      <ul className="grid gap-2 text-sm sm:grid-cols-3">
        <li className="flex items-start gap-2 rounded border border-border bg-slate-50 p-3">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" aria-hidden />
          <span>
            <span className="font-semibold text-navy">{coverage.withPercent}</span> مؤشرًا له نسبة مستخرجة من الملف.
          </span>
        </li>
        <li className="flex items-start gap-2 rounded border border-border bg-slate-50 p-3">
          <CircleDashed className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
          <span>
            <span className="font-semibold text-navy">{coverage.total - coverage.withPercent}</span> مؤشرًا بلا نسبة:
            معروضة كـ«غير متوفر» ولم تُعامل كأصفار.
          </span>
        </li>
        <li className="flex items-start gap-2 rounded border border-border bg-slate-50 p-3">
          <ListChecks className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          <span>
            <span className="font-semibold text-navy">{coverage.withLevel}</span> مؤشرًا له مستوى أداء محدد
            {thresholdsEnabled ? " (مشتق من حدود معتمدة أو كما ورد)" : " (كما ورد في التقرير فقط)"}.
          </span>
        </li>
      </ul>

      {!coverage.reviewedComplete && (
        <p className="text-sm text-slate-600">
          يُنصح بمراجعة كل مؤشر وتصحيحه قبل اعتماد التحليل.{" "}
          <Link href={`/analyses/${analysisId}/review`} className="font-semibold text-brand hover:underline">
            الذهاب إلى شاشة المراجعة ←
          </Link>
        </p>
      )}
    </div>
  );
}

export { buttonVariants };