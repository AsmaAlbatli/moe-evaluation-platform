"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LEVEL_META, type PerformanceLevel } from "@/lib/domain/levels";
import { cn } from "@/lib/utils";

export interface DomainBarDatum {
  id: number;
  name: string;
  value: number | null;
  level: PerformanceLevel | null;
  kind: "reported" | "computed" | "none";
}

/** لون العمود: لون المستوى إن وُجد، وإلا لون العلامة التجارية، والرمادي للقيمة المفقودة. */
function barColor(value: number | null, level: PerformanceLevel | null): string {
  if (value === null) return "#CBD5E1";
  return level ? LEVEL_META[level].color : "#1769AA";
}

/**
 * مخطط أعمدة أفقي لمقارنة المجالات الأربعة.
 * - التدرج اللوني يعكس مستوى الأداء: أحمر ← برتقالي ← أزرق ← أخضر.
 * - القيم المحسوبة (استرشادية) تُميّز بنمط منقّط في شريطها ونص في الوسيلة.
 * - القيم غير المتوفرة تُرسم كشريط مخطط لا كصفر.
 */
export function DomainBarChart({ data, className }: { data: DomainBarDatum[]; className?: string }) {
  const chartData = data.map((d) => ({
    name: d.name,
    value: d.value,
    fill: barColor(d.value, d.level),
    kind: d.kind,
  }));

  const anyComputed = data.some((d) => d.kind === "computed");
  const anyMissing = data.some((d) => d.value === null);

  return (
    <div className={cn("h-[300px] w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 24, right: 24, left: 24, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            reversed
            tick={{ fontSize: 11, fill: "#64748B" }}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="name"
            orientation="right"
            width={150}
            tick={{ fontSize: 12, fill: "#102A43", fontWeight: 600 }}
          />
          <Tooltip
            cursor={{ fill: "#F1F5F9" }}
            formatter={(value: unknown, _name, item) => {
              const kind = (item as { payload?: { kind?: string } } | undefined)?.payload?.kind;
              const v = value === null || value === undefined ? null : Number(value);
              return [
                v === null || Number.isNaN(v)
                  ? "غير متوفر"
                  : `${v}%${kind === "computed" ? " — متوسط حسابي استرشادي، وليس النسبة الرسمية" : " — كما ورد في التقرير"}`,
                "النسبة",
              ];
            }}
            contentStyle={{
              direction: "rtl",
              borderRadius: 8,
              fontSize: 12,
              fontFamily: "Cairo, sans-serif",
            }}
          />
          {anyComputed && (
            <Legend
              verticalAlign="top"
              align="center"
              height={28}
              formatter={() => (
                <span style={{ fontSize: 11, color: "#92400E", fontFamily: "Cairo, sans-serif" }}>
                  علامة منقّطة = متوسط حسابي استرشادي (النسبة الرسمية لم ترد في التقرير)
                </span>
              )}
            />
          )}
          <Bar name="النسبة" dataKey="value" radius={[4, 4, 4, 4]} barSize={24} isAnimationActive={false}>
            {chartData.map((entry, i) => (
              <Cell
                key={`cell-${i}`}
                fill={entry.fill}
                fillOpacity={entry.value === null ? 0.3 : 1}
                stroke={entry.value === null ? "#94A3B8" : entry.kind === "computed" ? "#0F4C7D" : "none"}
                strokeWidth={entry.kind === "computed" ? 1 : 0}
                strokeDasharray={
                  entry.value === null ? "4 3" : entry.kind === "computed" ? "2 2" : undefined
                }
              />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              offset={10}
              fill="#102A43"
              fontSize={11}
              fontWeight={700}
              formatter={(v: unknown) => (v === null || v === undefined ? "" : `${v}%`)}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {anyMissing && (
        <p className="mt-1 text-[11px] text-slate-500">
          الشريط المخطط يعني «غير متوفر»: يعبّر عن عدم وجود بيانات في الملف، وليس عن نسبة صفرية.
        </p>
      )}
    </div>
  );
}