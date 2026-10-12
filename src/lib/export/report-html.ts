import {
  VALUE_SOURCE_LABEL,
  LEVEL_SOURCE_LABEL,
  PLAN_STATUS_LABEL,
  type ExportBundle,
} from "./bundle";
import { LEVEL_META, PERFORMANCE_LEVELS, describeThresholds } from "@/lib/domain/levels";
import { formatPercent } from "@/lib/text/arabic";
import { barChartSvg, donutChartSvg, heatmapSvg, radarChartSvg } from "./svg-charts";

/**
 * مولّد تقرير HTML عربي قابل للطباعة (A4) والتصدير إلى PDF من المتصفح.
 *
 * كل التمارير داخل الصفحة (SVG) ولا يعتمد على أي سكربت، فيطبع بجودة
 * عالية ويتعامل معه المتصفح كصفحة ثابتة.
 */

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function levelBadge(level: keyof typeof LEVEL_META | null): string {
  if (!level) return `<span class="badge badge-none">غير متوفر</span>`;
  const meta = LEVEL_META[level];
  return `<span class="badge" style="background:${meta.soft};color:${meta.color};border-color:${meta.color}">${esc(meta.label)}</span>`;
}

function table(headers: string[], rows: string[][], className = ""): string {
  return `<table class="${className}">
  <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
  <tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody>
</table>`;
}

export function buildReportHtml(bundle: ExportBundle): string {
  const { meta, domains, indicators, recommendations, thresholds } = bundle;

  /* --- بطاقات بيانات المدرسة --- */
  const schoolCards = bundle.school
    .map((f) => {
      const display =
        f.value === null || f.value === ""
          ? `<span class="muted">غير متوفرة</span>`
          : esc(String(f.value));
      return `<div class="field">
        <span class="field-label">${esc(f.label)}</span>
        <span class="field-value">${display}</span>
        ${f.found ? `<span class="field-src">${esc(f.source.label)}</span>` : `<span class="field-src muted">لم ترد في الملف</span>`}
      </div>`;
    })
    .join("\n");

  /* --- بطاقات المجالات --- */
  const domainCards = domains
    .map((d) => {
      const reported = d.aggregate.reported !== null;
      const valueText =
        d.aggregate.display === null
          ? "غير متوفر"
          : `${formatPercent(d.aggregate.display)}${reported ? "" : " (استرشادي)"}`;
      return `<div class="domain-card" style="border-top-color:${d.level ? LEVEL_META[d.level].color : "#94A3B8"}">
        <div class="domain-card__head">
          <span class="domain-card__name">${esc(d.name)}</span>
          ${levelBadge(d.level)}
        </div>
        <div class="domain-card__value">${esc(valueText)}</div>
        <div class="domain-card__meta">
          ${reported ? "النسبة الرسمية كما وردت في التقرير" : "متوسط حسابي استرشادي للمؤشرات المتاحة — ليس النسبة الرسمية"}
        </div>
        <div class="domain-card__counts">
          ${PERFORMANCE_LEVELS.map((l) => {
            const c = d.counts[l];
            if (c === 0) return "";
            return `<span class="chip" style="background:${LEVEL_META[l].soft};color:${LEVEL_META[l].color}">${LEVEL_META[l].label}: ${c}</span>`;
          }).join("")}
          ${d.counts.unknown > 0 ? `<span class="chip chip-muted">بلا مستوى محدد: ${d.counts.unknown}</span>` : ""}
          ${d.counts.missing > 0 ? `<span class="chip chip-muted">غير متوفر: ${d.counts.missing}</span>` : ""}
        </div>
      </div>`;
    })
    .join("\n");

  /* --- المخططات --- */
  const bars = barChartSvg(
    domains.map((d) => ({
      label: d.name,
      value: d.aggregate.display,
      color: d.level ? LEVEL_META[d.level].color : "#94A3B8",
    })),
    { width: 640, height: 220 },
  );

  const totalIndicators = indicators.length;
  const levelTotals = PERFORMANCE_LEVELS.reduce<Record<string, number>>((acc, l) => {
    acc[l] = indicators.filter((i) => i.level === l).length;
    return acc;
  }, {});
  const donut = donutChartSvg(
    [
      ...PERFORMANCE_LEVELS.map((l) => ({
        label: LEVEL_META[l].label,
        value: levelTotals[l] ?? 0,
        color: LEVEL_META[l].color,
      })),
      {
        label: "غير متوفر",
        value: indicators.filter((i) => i.level === null).length,
        color: "#CBD5E1",
      },
    ],
    { width: 640, height: 230 },
  );

  const radar = radarChartSvg(
    domains.map((d) => ({ label: d.name, value: d.aggregate.display })),
    { width: 460, height: 320 },
  );

  /* --- الخريطة الحرارية --- */
  const heatRows = domains.map((d) => ({
    label: d.name,
    cells: d.indicators.map((i) => ({
      code: i.code,
      level: i.level,
      percent: i.percent,
      title: `${i.code} — ${i.text} — النسبة: ${formatPercent(i.percent)}`,
    })),
  }));
  const maxCells = Math.max(...heatRows.map((r) => r.cells.length), 1);
  const heat = heatmapSvg(
    heatRows,
    Array.from({ length: maxCells }, (_, i) => ({ label: `م${i + 1}` })),
    { width: 640, height: 300 },
  );

  /* --- جدول المؤشرات --- */
  const indicatorRows = indicators.map((i) => {
    const rec = recommendations.get(i.code);
    return [
      `<b>${esc(i.code)}</b>`,
      esc(i.text),
      esc(i.criterionName),
      i.percent === null
        ? `<span class="muted">غير متوفر</span>`
        : `${formatPercent(i.percent)}<br/><span class="tiny">${VALUE_SOURCE_LABEL[i.percentSource] ?? i.percentSource}</span>`,
      levelBadge(i.level) + `<br/><span class="tiny">${LEVEL_SOURCE_LABEL[i.levelSource] ?? ""}</span>`,
      esc(i.source.label),
      rec ? esc(rec.gap) : `<span class="muted">—</span>`,
      rec?.proposedTargetPercent != null
        ? `${formatPercent(rec.proposedTargetPercent)}<br/><span class="tiny">مستهدف مقترح — يُعتمد من المدرسة</span>`
        : `<span class="muted">غير متوفر</span>`,
    ];
  });

  const indicatorTable = table(
    ["المؤشر", "نص المؤشر", "المعيار", "النسبة الفعلية", "مستوى الأداء", "المصدر", "فجوة الأداء", "المستهدف المقترح"],
    indicatorRows,
    "indicators-table",
  );

  /* --- التوصيات --- */
  const recBlocks = indicators
    .filter((i) => i.percent !== null || i.level !== null)
    .map((i) => {
      const rec = recommendations.get(i.code);
      if (!rec) return "";
      return `<div class="rec">
  <div class="rec__head">
    <span class="rec__code">${esc(i.code)}</span>
    <span class="rec__title">${esc(i.text)}</span>
    ${levelBadge(i.level)}
    <span class="rec__origin ${rec.origin === "ai" ? "origin-ai" : "origin-rules"}">${
      rec.origin === "ai" ? "مقترح ذكاء اصطناعي" : "توصية قائمة على قواعد"
    }</span>
  </div>
  <div class="rec__meta">المجال: ${esc(i.domainName)} — المعيار: ${esc(i.criterionName)} — المصدر: ${esc(i.source.label)}</div>
  <dl class="rec__grid">
    <dt>نقاط القوة</dt><dd>${esc(rec.strengths.join(" • "))}</dd>
    <dt>فجوة الأداء</dt><dd>${esc(rec.gap)}</dd>
    <dt>هدف التحسين</dt><dd>${esc(rec.target)}<br/><span class="tiny">${esc(rec.targetRationale)}</span></dd>
    <dt>الإجراءات التنفيذية</dt><dd><ol class="actions">${rec.actions.map((a) => `<li>${esc(a)}</li>`).join("")}</ol></dd>
    <dt>مسؤول التنفيذ</dt><dd>${esc(rec.owner)}</dd>
    <dt>مدة التنفيذ</dt><dd>${esc(rec.duration)}</dd>
    <dt>مؤشر قياس الأداء</dt><dd>${esc(rec.measure)}</dd>
    <dt>خط الأساس</dt><dd>${esc(rec.baseline)}</dd>
    <dt>المستهدف المقترح</dt><dd>${
      rec.proposedTargetPercent === null
        ? `<span class="muted">غير متاح قبل تحديد خط الأساس</span>`
        : `${formatPercent(rec.proposedTargetPercent)} <span class="tiny">(مقترح قابل للتعديل، يُعتمد من المدرسة)</span>`
    }</dd>
    <dt>أداة القياس</dt><dd>${esc(rec.tool)}</dd>
    <dt>الشواهد المطلوبة</dt><dd>${esc(rec.evidence.join(" • "))}</dd>
    <dt>آلية المتابعة</dt><dd>${esc(rec.followUp)}</dd>
    <dt>حالة التنفيذ</dt><dd>${esc(PLAN_STATUS_LABEL.not_started)}</dd>
  </dl>
  <p class="rec__disclaimer">${esc(rec.disclaimer)}</p>
</div>`;
    })
    .join("\n");

  /* --- خطة التحسين --- */
  const planTable = bundle.plans.length
    ? table(
        [
          "المؤشر",
          "الإجراء",
          "المسؤول",
          "من",
          "إلى",
          "خط الأساس",
          "المستهدف",
          "المحقق",
          "نسبة الإنجاز",
          "الحالة",
        ],
        bundle.plans.map((p) => [
          esc(p.indicatorCode ?? "—"),
          esc(p.title),
          esc(p.owner || "—"),
          esc(p.startDate ?? "—"),
          esc(p.endDate ?? "—"),
          esc(p.baseline ?? "—"),
          p.target === null ? `<span class="muted">—</span>` : formatPercent(p.target),
          p.actual === null ? `<span class="muted">—</span>` : formatPercent(p.actual),
          p.completion === null ? `<span class="muted">—</span>` : `${p.completion}%`,
          esc(p.statusLabel),
        ]),
      )
    : `<p class="muted">لم تُبنَ خطة تحسين بعد. يمكن تحويل التوصيات إلى خطة من صفحة «خطة التحسين».</p>`;

  /* --- سجل التعديلات --- */
  const revisionTable = bundle.revisions.length
    ? table(
        ["التاريخ", "العنصر", "الحقل", "قبل", "بعد", "المنفّذ", "ملاحظة"],
        bundle.revisions.map((r) => [
          esc(r.createdAtLabel),
          esc(r.entityLabel),
          esc(r.fieldLabel),
          `<span class="muted">${esc(r.oldValue || "—")}</span>`,
          esc(r.newValue || "—"),
          esc(r.actor),
          esc(r.note || "—"),
        ]),
      )
    : `<p class="muted">لا توجد تعديلات مسجّلة بعد.</p>`;

  const noticesHtml = bundle.notices.length
    ? `<div class="notices"><p class="notices__title">تنبيهات قبل الاعتماد</p>${bundle.notices
        .map((n) => `<p>⚠ ${esc(n)}</p>`)
        .join("")}</div>`
    : "";

  const overallText =
    bundle.overall.value === null
      ? `<span class="muted">غير متوفرة — لم ترد في التقرير ولم تُدخل من المدرسة</span>`
      : `${formatPercent(bundle.overall.value)} <span class="tiny">(${bundle.overall.sourceLabel})</span>`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>${esc(meta.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>
  @page { size: A4; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; }
  body {
    font-family: 'Cairo','Tajawal','Segoe UI',Tahoma,sans-serif;
    color:#1E293B; background:#FFFFFF; font-size:11.5px; line-height:1.75;
    direction: rtl;
  }
  .sheet { max-width: 190mm; margin: 0 auto; padding: 10mm 0; }
  .cover { text-align:center; border-bottom:3px solid #102A43; padding-bottom:14px; margin-bottom:18px; }
  .cover__logo { height:64px; margin:0 auto 8px; display:block; object-fit:contain; }
  .cover__ministry { font-size:15px; font-weight:700; color:#102A43; }
  .cover__country { font-size:12px; color:#1769AA; margin-bottom:10px; }
  .cover__title { font-size:19px; font-weight:700; color:#102A43; margin:6px 0; }
  .cover__scope { font-size:12.5px; color:#1769AA; font-weight:600; }
  .cover__meta { margin-top:10px; font-size:10.5px; color:#475569; }
  h2 { font-size:14px; color:#102A43; border-right:4px solid #1769AA; padding-right:8px; margin:20px 0 10px; }
  h3 { font-size:12.5px; color:#102A43; margin:14px 0 8px; }
  .muted { color:#94A3B8; }
  .tiny { font-size:9.5px; color:#64748B; }
  .grid-fields { display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; }
  .field { border:1px solid #E2E8F0; border-radius:6px; padding:7px 9px; background:#F8FAFC; }
  .field-label { display:block; font-size:9.5px; color:#64748B; }
  .field-value { display:block; font-weight:600; color:#102A43; font-size:12px; word-break:break-word; }
  .field-src { display:block; font-size:8.5px; color:#94A3B8; }
  .overall { text-align:center; font-size:24px; font-weight:700; color:#102A43; margin:8px 0 4px; }
  .domain-grid { display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; }
  .domain-card { border:1px solid #E2E8F0; border-top:4px solid #1769AA; border-radius:8px; padding:10px; }
  .domain-card__head { display:flex; justify-content:space-between; align-items:center; gap:6px; }
  .domain-card__name { font-weight:700; font-size:11px; color:#102A43; }
  .domain-card__value { font-size:18px; font-weight:700; color:#102A43; margin:6px 0 2px; }
  .domain-card__meta { font-size:8.5px; color:#64748B; min-height:22px; }
  .domain-card__counts { margin-top:6px; display:flex; flex-wrap:wrap; gap:4px; }
  .chip { font-size:8.5px; padding:1px 6px; border-radius:9px; }
  .chip-muted { background:#F1F5F9; color:#64748B; }
  .badge { display:inline-block; font-size:9.5px; padding:1px 7px; border-radius:10px; border:1px solid; font-weight:600; white-space:nowrap; }
  .badge-none { background:#F1F5F9; color:#94A3B8; border-color:#CBD5E1; }
  table { width:100%; border-collapse:collapse; margin:8px 0; }
  th, td { border:1px solid #CBD5E1; padding:5px 6px; text-align:right; vertical-align:top; }
  th { background:#102A43; color:#fff; font-size:10px; font-weight:600; }
  tbody tr:nth-child(even) { background:#F8FAFC; }
  .indicators-table td { font-size:9.5px; }
  .rec { border:1px solid #E2E8F0; border-radius:8px; padding:10px 12px; margin-bottom:10px; break-inside:avoid; }
  .rec__head { display:flex; flex-wrap:wrap; align-items:center; gap:8px; border-bottom:1px solid #E2E8F0; padding-bottom:6px; margin-bottom:6px; }
  .rec__code { font-weight:700; color:#1769AA; }
  .rec__title { font-weight:600; color:#102A43; flex:1; min-width:180px; }
  .rec__meta { font-size:9.5px; color:#64748B; margin-bottom:6px; }
  .rec__origin { font-size:9px; padding:1px 7px; border-radius:9px; }
  .origin-rules { background:#DBEAFE; color:#1D4ED8; }
  .origin-ai { background:#EDE9FE; color:#6D28D9; }
  .rec__grid { display:grid; grid-template-columns: 130px 1fr; gap:3px 10px; margin:0; }
  .rec__grid dt { font-weight:600; color:#102A43; font-size:10px; }
  .rec__grid dd { margin:0; font-size:10.5px; }
  .rec__disclaimer { font-size:9px; color:#94A3B8; margin:8px 0 0; border-top:1px dashed #E2E8F0; padding-top:6px; }
  ol.actions { margin:0; padding-right:18px; }
  ol.actions li { margin-bottom:2px; }
  .notices { border:1px solid #F59E0B; background:#FFFBEB; border-radius:8px; padding:10px 14px; margin-bottom:14px; }
  .notices__title { font-weight:700; color:#92400E; margin-bottom:4px !important; }
  .notices p { margin:3px 0; font-size:10.5px; color:#92400E; }
  .charts { display:grid; grid-template-columns: 1fr 1fr; gap:12px; align-items:start; }
  .chart-box { border:1px solid #E2E8F0; border-radius:8px; padding:8px; break-inside:avoid; }
  .chart-box h3 { margin:0 0 6px; }
  .chart-box svg { max-width:100%; height:auto; }
  .legend-levels { display:flex; gap:12px; flex-wrap:wrap; margin-top:6px; font-size:10px; }
  .legend-levels span { display:inline-flex; align-items:center; gap:5px; }
  .dot { width:11px; height:11px; border-radius:3px; display:inline-block; }
  .footer { margin-top:18px; border-top:2px solid #102A43; padding-top:8px; font-size:9.5px; color:#64748B; display:flex; justify-content:space-between; }
  section { break-inside:avoid; }
  @media print { .sheet { padding:0; max-width:none; } body { font-size:10.5px; } }
</style>
</head>
<body>
<div class="sheet">

  <div class="cover">
    ${bundle.logoUrl ? `<img class="cover__logo" src="${esc(bundle.logoUrl)}" alt="شعار الوزارة"/>` : ""}
    <div class="cover__ministry">وزارة التعليم — المملكة العربية السعودية</div>
    <div class="cover__country">منصة تحليل نتائج التقويم المدرسي وبناء خطط التحسين</div>
    <div class="cover__title">${esc(meta.kindLabel)}</div>
    <div class="cover__scope">${esc(meta.schoolsScope)}</div>
    <div class="cover__meta">
      إعداد وتصميم: ${esc(meta.preparedBy)} — تاريخ الإصدار: ${esc(meta.generatedAtLabel)} — حالة التقرير: ${esc(meta.statusLabel)}
    </div>
  </div>

  ${noticesHtml}

  <section>
    <h2>أولًا: بيانات المدرسة</h2>
    <div class="grid-fields">${schoolCards}</div>
    <h3>النسبة العامة</h3>
    <div class="overall">${overallText}</div>
    <p class="tiny">لا تحسب المنصة أي نسبة عامة من عناصر التقرير؛ تُعرض فقط إذا وردت في الملف أو أدخلتها المدرسة.</p>
  </section>

  <section>
    <h2>ثانيًا: بطاقات المجالات الأربعة</h2>
    <div class="domain-grid">${domainCards}</div>
    <div class="legend-levels">
      ${PERFORMANCE_LEVELS.map(
        (l) => `<span><i class="dot" style="background:${LEVEL_META[l].color}"></i>${LEVEL_META[l].label}</span>`,
      ).join("")}
      <span><i class="dot" style="background:#CBD5E1"></i>غير متوفر</span>
    </div>
  </section>

  <section>
    <h2>ثالثًا: المخططات</h2>
    <div class="charts">
      <div class="chart-box"><h3>مقارنة المجالات — مخطط أعمدة</h3>${bars}</div>
      <div class="chart-box"><h3>توزيع مستويات المؤشرات — مخطط دائري</h3>${donut}</div>
    </div>
    <div class="charts" style="margin-top:12px; grid-template-columns: 1fr;">
      <div class="chart-box"><h3>الأداء العام (مخطط راداري)</h3>${radar}</div>
    </div>
  </section>

  <section>
    <h2>رابعًا: الخريطة الحرارية للمؤشرات (${totalIndicators} مؤشرًا)</h2>
    <div class="chart-box">${heat}</div>
    <p class="tiny">تتحدث الخريطة الحرارية تلقائيًا عند تعديل النتائج المعتمدة أو ضبط حدود المستويات من الإعدادات.</p>
  </section>

  <section>
    <h2>خامسًا: جدول المؤشرات والتحليل</h2>
    ${indicatorTable}
  </section>

  <section>
    <h2>سادسًا: تحليل المؤشرات والتوصيات</h2>
    ${recBlocks || '<p class="muted">لا توجد نتائج كافية لتوليد توصيات.</p>'}
  </section>

  <section>
    <h2>سابعًا: خطة التحسين</h2>
    ${planTable}
  </section>

  <section>
    <h2>ثامنًا: مرجع حدود مستويات الأداء</h2>
    <p>${esc(describeThresholds(thresholds))}</p>
    ${bundle.thresholdsNote ? `<p class="tiny">${esc(bundle.thresholdsNote)}</p>` : ""}
  </section>

  <section>
    <h2>تاسعًا: سجل التعديلات</h2>
    ${revisionTable}
  </section>

  <div class="footer">
    <span>${esc(meta.schoolsScope)} — ${esc(meta.preparedBy)}</span>
    <span>جودة الاستخراج: ${esc(meta.extractionQualityLabel)} — صدر في ${esc(meta.generatedAtLabel)}</span>
  </div>
</div>
<script>
  // طلب الطباعة تلقائيًا عند الفتح من زر «تصدير PDF»
  if (new URLSearchParams(location.search).get('print') === '1') {
    window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 350); });
  }
</script>
</body>
</html>`;
}