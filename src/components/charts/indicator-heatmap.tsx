"use client";

import { useMemo, useState } from "react";
import { LEVEL_META, PERFORMANCE_LEVELS, type PerformanceLevel } from "@/lib/domain/levels";
import { cn } from "@/lib/utils";

export interface HeatmapIndicator {
  code: string;
  text: string;
  percent: number | null;
  level: PerformanceLevel | null;
  reviewed: boolean;
}

export interface HeatmapGroup {
  name: string;
  indicators: HeatmapIndicator[];
}

/**
 * خريطة حرارية لكل المؤشرات.
 * تتحدث تلقائيًا عند تعديل النتائج المعتمدة أو ضبط حدود المستويات،
 * لأنها تتلقى القيم من الحالة الحالية مباشرة.
 */
export function IndicatorHeatmap({
  groups,
  onSelectCode,
  className,
}: {
  groups: HeatmapGroup[];
  onSelectCode?: (code: string) => void;
  className?: string;
}) {
  const [hovered, setHovered] = useState<HeatmapIndicator | null>(null);

  const totals = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const g of groups) {
      for (const ind of g.indicators) {
        const key = ind.level ?? "none";
        acc[key] = (acc[key] ?? 0) + 1;
      }
    }
    return acc;
  }, [groups]);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-slate-600">عدد المؤشرات في كل مستوى:</span>
        {PERFORMANCE_LEVELS.map((l) => (
          <span
            key={l}
            className="chip"
            style={{ backgroundColor: LEVEL_META[l].soft, color: LEVEL_META[l].color }}
          >
            {LEVEL_META[l].label}: {totals[l] ?? 0}
          </span>
        ))}
        <span className="chip bg-slate-100 text-slate-500">
          غير متوفر: {totals.none ?? 0}
        </span>
      </div>

      {groups.map((group) => (
        <div key={group.name}>
          <p className="mb-1.5 text-xs font-bold text-navy">{group.name}</p>
          <div className="flex flex-wrap gap-1">
            {group.indicators.map((ind) => {
              const level = ind.level;
              const style = level
                ? {
                    backgroundColor: LEVEL_META[level].soft,
                    borderColor: LEVEL_META[level].color,
                    color: LEVEL_META[level].color,
                  }
                : {
                    backgroundColor: "#F8FAFC",
                    borderColor: "#CBD5E1",
                    color: "#94A3B8",
                  };
              return (
                <button
                  key={ind.code}
                  type="button"
                  title={`${ind.code} — ${ind.text}\nالنسبة: ${ind.percent === null ? "غير متوفر" : `${ind.percent}%`}\nالمستوى: ${level ? LEVEL_META[level].label : "غير متوفر"}`}
                  onMouseEnter={() => setHovered(ind)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(ind)}
                  onBlur={() => setHovered(null)}
                  onClick={() => onSelectCode?.(ind.code)}
                  className={cn(
                    "flex min-w-[58px] flex-col items-center rounded border px-1.5 py-1 text-[10px] transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-brand",
                    level ? "border" : "border-dashed",
                    ind.reviewed && "shadow-[inset_0_0_0_1px_rgba(16,42,67,0.12)]",
                  )}
                  style={style}
                >
                  <span className="num font-bold leading-tight">{ind.code}</span>
                  <span className="num text-[13px] font-bold leading-tight">
                    {ind.percent === null ? "—" : ind.percent}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="rounded border border-border bg-slate-50 px-3 py-2 text-xs">
        {hovered ? (
          <p className="text-slate-700">
            <span className="font-bold text-navy">{hovered.code}</span> — {hovered.text} | النسبة:{" "}
            <span className="num">{hovered.percent === null ? "غير متوفر" : `${hovered.percent}%`}</span> | المستوى:{" "}
            {hovered.level ? LEVEL_META[hovered.level].label : "غير متوفر"}
            {hovered.reviewed ? " | تمت مراجعته" : ""}
          </p>
        ) : (
          <p className="text-slate-500">
            مرِّر المؤشر بمؤشر الفأرة لعرض نصه ومستواه ومرجعه، أو اضغط عليه للانتقال إلى تفاصيله.
          </p>
        )}
      </div>
    </div>
  );
}