"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AnalysisTab } from "@/lib/analysis-tabs";
import { cn } from "@/lib/utils";

export type { AnalysisTab };

/** شريط تنقل داخلي بين صفحات التحليل الواحد. */
export function AnalysisTabs({
  analysisId: _unusedAnalysisId,
  status,
  kindLabel,
  tabs,
}: {
  /** يُقبل للتماسك مع واجهة التبويبات ولا يُستخدم داخل المكوّن */
  analysisId: string;
  status: string;
  kindLabel: string;
  tabs: AnalysisTab[];
}) {
  const pathname = usePathname();
  const approved = status === "approved";

  return (
    <div className="no-print">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="chip bg-brand-soft text-brand">{kindLabel}</span>
          <span className={cn("chip", approved ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700")}>
            {approved ? "معتمد" : "قيد المراجعة"}
          </span>
        </div>
        <Link href="/analyses" className="text-xs text-slate-500 hover:text-brand">
          ← العودة إلى السجل
        </Link>
      </div>

      <nav aria-label="أقسام التحليل" className="mt-3">
        <ul className="flex flex-wrap gap-1">
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-block rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                    active ? "bg-navy text-white" : "bg-white text-slate-700 hover:bg-brand-soft",
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export function analysisTabs(analysisId: string): AnalysisTab[] {
  const base = `/analyses/${analysisId}`;
  return [
    { href: base, label: "لوحة المعلومات" },
    { href: `${base}/review`, label: "مراجعة وتصحيح النتائج" },
    { href: `${base}/indicators`, label: "تحليل المؤشرات والتوصيات" },
    { href: `${base}/plan`, label: "خطة التحسين" },
    { href: `${base}/report`, label: "التقرير والتصدير" },
  ];
}