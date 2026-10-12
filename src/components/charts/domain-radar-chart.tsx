"use client";

import { LEVEL_META, type PerformanceLevel } from "@/lib/domain/levels";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export interface RadarDatum {
  name: string;
  value: number | null;
  level: PerformanceLevel | null;
  computed: boolean;
}

/** مخطط راداري لأداء المجالات الأربعة. */
export function DomainRadarChart({ data, className }: { data: RadarDatum[]; className?: string }) {
  return (
    <div className={className}>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke="#E2E8F0" />
            <PolarAngleAxis
              dataKey="name"
              tick={{ fontSize: 12, fill: "#102A43", fontWeight: 600, fontFamily: "Cairo, sans-serif" }}
            />
            <PolarRadiusAxis
              domain={[0, 100]}
              ticks={[25, 50, 75, 100]}
              angle={90}
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              formatter={(value: unknown, _name, item) => {
                const computed =
                  (item as { payload?: { computed?: boolean } } | undefined)?.payload?.computed;
                const v = value === null || value === undefined ? null : Number(value);
                return [
                  v === null || Number.isNaN(v) ? "غير متوفر" : `${v}%${computed ? " (متوسط حسابي استرشادي)" : ""}`,
                  "النسبة",
                ];
              }}
              contentStyle={{ direction: "rtl", borderRadius: 8, fontSize: 12, fontFamily: "Cairo, sans-serif" }}
            />
            <Radar
              name="النسبة"
              dataKey="value"
              stroke="#1769AA"
              fill="#1769AA"
              fillOpacity={0.22}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-1 flex flex-wrap justify-center gap-3 text-[11px]">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-sm"
              style={{ backgroundColor: d.level ? LEVEL_META[d.level].color : "#CBD5E1" }}
            />
            <span className="text-slate-600">{d.name}</span>
            <span className="num font-bold text-navy">
              {d.value === null ? "غير متوفر" : `${d.value}%`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}