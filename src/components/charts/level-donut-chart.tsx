"use client";

import { LEVEL_META, PERFORMANCE_LEVELS, type PerformanceLevel } from "@/lib/domain/levels";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface LevelCounts {
  tahyea: number;
  intilaq: number;
  taqaddum: number;
  tamayyuz: number;
  unknown: number;
  missing: number;
}

const EXTRA_SLICES = [
  { key: "unknown", label: "بلا مستوى محدد", color: "#94A3B8" },
  { key: "missing", label: "غير متوفر في الملف", color: "#CBD5E1" },
] as const;

/** مخطط دائري لتوزيع مستويات المؤشرات بتدرج لوني واضح. */
export function LevelDonutChart({
  counts,
  total,
  className,
}: {
  counts: LevelCounts;
  total: number;
  className?: string;
}) {
  const data = [
    ...PERFORMANCE_LEVELS.map((l) => ({
      key: l as string,
      label: LEVEL_META[l].label,
      value: counts[l],
      color: LEVEL_META[l].color,
    })),
    ...EXTRA_SLICES.map((s) => ({
      key: s.key,
      label: s.label,
      value: counts[s.key],
      color: s.color,
    })),
  ].filter((d) => d.value > 0);

  return (
    <div className={className}>
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={92}
              paddingAngle={2}
              stroke="#fff"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((entry, i) => (
                <Cell key={`slice-${i}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: unknown, name) => {
                const v = Number(value ?? 0);
                return [`${value} مؤشر (${total > 0 ? Math.round((v / total) * 100) : 0}%)`, String(name)];
              }}
              contentStyle={{ direction: "rtl", borderRadius: 8, fontSize: 12, fontFamily: "Cairo, sans-serif" }}
            />
            <Legend
              verticalAlign="bottom"
              align="center"
              iconType="circle"
              formatter={(value) => (
                <span style={{ fontSize: 11, color: "#475569", fontFamily: "Cairo, sans-serif" }}>{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-1 text-xs sm:grid-cols-3">
        {PERFORMANCE_LEVELS.map((l) => (
          <li key={l} className="flex items-center justify-between rounded border border-border bg-slate-50 px-2 py-1">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: LEVEL_META[l].color }}
              />
              <span className="text-slate-700">{LEVEL_META[l].label}</span>
            </span>
            <span className="num font-bold text-navy">{counts[l as PerformanceLevel]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}