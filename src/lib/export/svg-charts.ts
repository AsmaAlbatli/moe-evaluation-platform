/**
 * مولّد مخططات SVG على الخادم.
 *
 * يُستخدم في تقرير HTML القابل للطباعة/التصدير إلى PDF، لأن المتصفح
 * يطبع SVG بجودة عالية دون اعتماد على مكتبات رسم في وقت الطباعة.
 * كل الدوال خالصة(tabular) ليسهل اختبارها.
 */

import { LEVEL_META, type PerformanceLevel } from "@/lib/domain/levels";

export interface SvgChartOptions {
  width: number;
  height: number;
  /** ألوان النصوص والحدود */
  textColor?: string;
  gridColor?: string;
}

const DEFAULTS = {
  textColor: "#334155",
  gridColor: "#E2E8F0",
};

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function niceMax(value: number): number {
  if (value <= 0) return 100;
  const steps = [10, 20, 25, 50, 75, 100];
  for (const s of steps) if (value <= s) return s;
  return 100;
}

/* ------------------------------------------------------------------ */
/*  مخطط أعمدة لمقارنة المجالات                                         */
/* ------------------------------------------------------------------ */

export interface BarDatum {
  label: string;
  value: number | null;
  /** لون العمود — عادةً لون مستوى الأداء */
  color?: string;
  /** لاحقة اختيارية بعد الرقم */
  suffix?: string;
}

/** مخطط أعمدة أفقي (من اليمين إلى اليسار ليناسب الاتجاه العربي). */
export function barChartSvg(data: BarDatum[], options: SvgChartOptions): string {
  const { width, height } = options;
  const textColor = options.textColor ?? DEFAULTS.textColor;
  const gridColor = options.gridColor ?? DEFAULTS.gridColor;

  const padTop = 18;
  const padBottom = 34;
  const padStart = 150; // مساحة التسميات على اليمين
  const padEnd = 52;
  const plotW = Math.max(40, width - padStart - padEnd);
  const plotH = Math.max(30, height - padTop - padBottom);
  const max = niceMax(Math.max(...data.map((d) => d.value ?? 0), 0));

  const rowH = data.length ? plotH / data.length : plotH;
  const barH = Math.min(30, rowH * 0.55);

  const ticks = [0, max / 2, max];
  const grid = ticks
    .map((t) => {
      // RTL: القيمة 100% عند أقصى اليسار
      const x = padStart + plotW - (t / max) * plotW;
      return `<line x1="${x.toFixed(1)}" y1="${padTop}" x2="${x.toFixed(1)}" y2="${padTop + plotH}" stroke="${gridColor}" stroke-width="1"/>
      <text x="${x.toFixed(1)}" y="${padTop + plotH + 16}" font-size="10" fill="${textColor}" text-anchor="middle" font-family="Cairo, Tahoma, sans-serif">${t}%</text>`;
    })
    .join("\n");

  const bars = data
    .map((d, i) => {
      const cy = padTop + rowH * i + rowH / 2;
      const w = d.value === null ? 0 : Math.max(0, (d.value / max) * plotW);
      const x = padStart + plotW - w;
      const color = d.color ?? "#1769AA";
      const bar =
        d.value === null
          ? `<rect x="${padStart}" y="${(cy - barH / 2).toFixed(1)}" width="${plotW}" height="${barH}" fill="#F1F5F9" stroke="${gridColor}" stroke-dasharray="4 3"/>
             <text x="${padStart - 8}" y="${(cy + 4).toFixed(1)}" font-size="10" fill="#94A3B8" text-anchor="end" font-family="Cairo, Tahoma, sans-serif">غير متوفر</text>`
          : `<rect x="${x.toFixed(1)}" y="${(cy - barH / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${barH}" rx="3" fill="${color}"/>
             <text x="${(padStart - 8).toFixed(1)}" y="${(cy + 4).toFixed(1)}" font-size="11" font-weight="600" fill="${textColor}" text-anchor="end" font-family="Cairo, Tahoma, sans-serif">${d.value}${d.suffix ?? "%"}</text>`;

      return `${bar}
      <text x="${(padStart + plotW + 10).toFixed(1)}" y="${(cy + 4).toFixed(1)}" font-size="11" fill="${textColor}" text-anchor="start" font-family="Cairo, Tahoma, sans-serif">${esc(d.label)}</text>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
${grid}
${bars}
</svg>`;
}

/* ------------------------------------------------------------------ */
/*  مخطط دائري (حلقي) لتوزيع مستويات المؤشرات                            */
/* ------------------------------------------------------------------ */

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/** مخطط حلقي مع وسيلة إيضاح على اليمين (مناسبة لطباعة عربية). */
export function donutChartSvg(
  slices: DonutSlice[],
  options: SvgChartOptions & { thickness?: number },
): string {
  const { width, height } = options;
  const thickness = options.thickness ?? 26;
  const textColor = options.textColor ?? DEFAULTS.textColor;
  const total = slices.reduce((a, s) => a + s.value, 0);

  const legendW = 170;
  const size = Math.min(width - legendW - 24, height - 24);
  const cx = width - legendW - size / 2 - 12;
  const cy = height / 2;
  const r = size / 2 - thickness / 2 - 6;

  if (total <= 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#E2E8F0" stroke-width="${thickness}"/>
    <text x="${cx}" y="${cy + 4}" font-size="12" fill="${textColor}" text-anchor="middle" font-family="Cairo, Tahoma, sans-serif">لا توجد بيانات</text>
  </svg>`;
  }

  // نبدأ من الأعلى ونتناقص مع عقارب الساعة
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const arcs = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const fraction = s.value / total;
      const len = fraction * circumference;
      const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${thickness}"
        stroke-dasharray="${len.toFixed(2)} ${(circumference - len).toFixed(2)}"
        stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
      offset += len;
      return seg;
    })
    .join("\n");

  const legend = slices
    .map((s, i) => {
      const y = cy - (slices.length * 22) / 2 + i * 22 + 10;
      const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
      return `<rect x="${18}" y="${y - 10}" width="12" height="12" rx="2" fill="${s.color}"/>
      <text x="${36}" y="${y}" font-size="11" fill="${textColor}" text-anchor="start" font-family="Cairo, Tahoma, sans-serif">${esc(s.label)}: ${s.value} (${pct}%)</text>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
${arcs}
<text x="${cx}" y="${cy - 2}" font-size="18" font-weight="700" fill="${textColor}" text-anchor="middle" font-family="Cairo, Tahoma, sans-serif">${total}</text>
<text x="${cx}" y="${cy + 16}" font-size="10" fill="${textColor}" text-anchor="middle" font-family="Cairo, Tahoma, sans-serif">إجمالي المؤشرات</text>
${legend}
</svg>`;
}

/* ------------------------------------------------------------------ */
/*  مخطط راداري                                                        */
/* ------------------------------------------------------------------ */

export interface RadarDatum {
  label: string;
  value: number | null;
}

export function radarChartSvg(data: RadarDatum[], options: SvgChartOptions): string {
  const { width, height } = options;
  const textColor = options.textColor ?? DEFAULTS.textColor;
  const gridColor = options.gridColor ?? DEFAULTS.gridColor;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 52;
  const n = Math.max(3, data.length);
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;

  const rings = [0.25, 0.5, 0.75, 1]
    .map((f) => {
      const pts = Array.from({ length: n }, (_, i) => {
        const a = angle(i);
        return `${(cx + Math.cos(a) * radius * f).toFixed(1)},${(cy + Math.sin(a) * radius * f).toFixed(1)}`;
      }).join(" ");
      return `<polygon points="${pts}" fill="none" stroke="${gridColor}" stroke-width="1"/>`;
    })
    .join("\n");

  const spokes = Array.from({ length: n }, (_, i) => {
    const a = angle(i);
    return `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * radius).toFixed(1)}" y2="${(cy + Math.sin(a) * radius).toFixed(1)}" stroke="${gridColor}" stroke-width="1"/>`;
  }).join("\n");

  const withValues = data
    .map((d, i) => {
      if (d.value === null) return null;
      const a = angle(i);
      const rr = radius * Math.max(0, Math.min(1, d.value / 100));
      return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");

  const poly =
    withValues.split(" ").filter(Boolean).length >= 3
      ? `<polygon points="${withValues}" fill="#1769AA" fill-opacity="0.22" stroke="#1769AA" stroke-width="2"/>`
      : "";

  const dots = data
    .map((d, i) => {
      if (d.value === null) return "";
      const a = angle(i);
      const rr = radius * Math.max(0, Math.min(1, d.value / 100));
      return `<circle cx="${(cx + Math.cos(a) * rr).toFixed(1)}" cy="${(cy + Math.sin(a) * rr).toFixed(1)}" r="3.5" fill="#102A43"/>`;
    })
    .join("\n");

  const labels = data
    .map((d, i) => {
      const a = angle(i);
      const lx = cx + Math.cos(a) * (radius + 22);
      const ly = cy + Math.sin(a) * (radius + 22);
      const anchor = Math.abs(Math.cos(a)) < 0.3 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
      return `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" font-size="11" fill="${textColor}" text-anchor="${anchor}" font-family="Cairo, Tahoma, sans-serif">${esc(d.label)}</text>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
${rings}
${spokes}
${poly}
${dots}
${labels}
</svg>`;
}

/* ------------------------------------------------------------------ */
/*  الخريطة الحرارية                                                    */
/* ------------------------------------------------------------------ */

export interface HeatmapRow {
  label: string;
  cells: { code: string; level: PerformanceLevel | null; percent: number | null; title: string }[];
}

export interface HeatmapColumn {
  label: string;
}

export function heatmapSvg(
  rows: HeatmapRow[],
  columns: HeatmapColumn[],
  options: SvgChartOptions,
): string {
  const { width } = options;
  const textColor = options.textColor ?? DEFAULTS.textColor;

  const labelW = 96;
  const headerH = 78;
  const cell = Math.max(26, Math.min(34, Math.floor((width - labelW - 20) / Math.max(1, columns.length))));
  const gridW = labelW + columns.length * cell;
  const height = headerH + rows.length * cell + 10;

  const headers = columns
    .map((c, i) => {
      const x = labelW + i * cell + cell / 2;
      const chars = [...c.label];
      const lines: string[] = [];
      let line = "";
      for (const ch of chars) {
        if ((line + ch).length > 6) {
          lines.push(line);
          line = ch;
        } else line += ch;
      }
      if (line) lines.push(line);
      const tspans = lines
        .slice(0, 4)
        .map((l, k) => `<tspan x="${x}" dy="${k === 0 ? 0 : 12}">${esc(l)}</tspan>`)
        .join("");
      return `<text x="${x}" y="18" font-size="9" fill="${textColor}" text-anchor="middle" font-family="Cairo, Tahoma, sans-serif">${tspans}</text>`;
    })
    .join("\n");

  const body = rows
    .map((row, r) => {
      const y = headerH + r * cell;
      const label = `<text x="${labelW - 8}" y="${y + cell / 2 + 4}" font-size="10" fill="${textColor}" text-anchor="end" font-family="Cairo, Tahoma, sans-serif">${esc(row.label)}</text>`;
      const cells = row.cells
        .map((c, i) => {
          const x = labelW + i * cell;
          const fill = c.level ? LEVEL_META[c.level].soft : "#F8FAFC";
          const stroke = c.level ? LEVEL_META[c.level].color : "#CBD5E1";
          const text = c.level ? LEVEL_META[c.level].color : "#94A3B8";
          const value = c.percent === null ? "—" : String(Math.round(c.percent));
          return `<g><title>${esc(c.title)}</title>
          <rect x="${x + 1}" y="${y + 1}" width="${cell - 2}" height="${cell - 2}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
          <text x="${x + cell / 2}" y="${y + cell / 2 + 4}" font-size="10" font-weight="600" fill="${text}" text-anchor="middle" font-family="Cairo, Tahoma, sans-serif">${esc(value)}</text></g>`;
        })
        .join("\n");
      return label + cells;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(width, gridW)}" height="${height}" viewBox="0 0 ${Math.max(width, gridW)} ${height}" role="img">
${headers}
${body}
</svg>`;
}

export const LEVEL_ORDER_FOR_CHARTS: PerformanceLevel[] = [
  "tahyea",
  "intilaq",
  "taqaddum",
  "tamayyuz",
];