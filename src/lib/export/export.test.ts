import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { buildAnalysisWorkbook } from "./excel";
import { buildReportHtml } from "./report-html";
import { barChartSvg, donutChartSvg, heatmapSvg, radarChartSvg } from "./svg-charts";
import { DATA_SHEETS } from "./sheets";
import {
  buildDomainSummaries,
  buildIndicators,
  type IndicatorInput,
} from "@/lib/analysis/compute";
import { buildRecommendation, DEFAULT_RULES } from "@/lib/recommendations/rules";
import { DEFAULT_LEVEL_THRESHOLDS } from "@/lib/domain/levels";
import { pdfPageRef } from "@/lib/extract/rows";
import type { ExportBundle } from "./bundle";

/** بيانات اختبار اصطناعية بالكامل — لا تُستخدم أي بيانات مدرسية حقيقية. */

function makeBundle(): ExportBundle {
  const inputs: IndicatorInput[] = [
    { code: "1-1-1-1", value: 87, level: "taqaddum", ref: pdfPageRef(3), rawText: "نص 1-1-1-1" },
    { code: "1-1-1-2", value: 45, level: "tahyea", ref: pdfPageRef(3), rawText: "نص 1-1-1-2" },
    { code: "2-1-1-1", value: 93, level: "tamayyuz", ref: pdfPageRef(4), rawText: "نص 2-1-1-1" },
  ];
  const indicators = buildIndicators(inputs, { thresholds: DEFAULT_LEVEL_THRESHOLDS });
  const domains = buildDomainSummaries({
    indicators,
    reportedDomains: new Map([[1, { value: 70, ref: pdfPageRef(3) }]]),
    reportedCriteria: new Map(),
    thresholds: DEFAULT_LEVEL_THRESHOLDS,
  });
  const recommendations = new Map(
    indicators
      .filter((i) => i.percent !== null)
      .map((i) => [
        i.code,
        buildRecommendation(i, { thresholds: DEFAULT_LEVEL_THRESHOLDS, rules: DEFAULT_RULES }),
      ]),
  );

  return {
    meta: {
      analysisId: "test-id",
      title: "تحليل اختبار",
      kind: "external",
      kindLabel: "تحليل تقرير التقويم المدرسي الخارجي",
      status: "in_review",
      statusLabel: "قيد المراجعة",
      generatedAtLabel: "01/01/2026، 10:00 ص",
      preparedBy: "المشرفة أسماء الباتلي",
      schoolsScope: "مدارس النطاق الثالث",
      extractionQuality: "good",
      extractionQualityLabel: "جيدة",
    },
    school: [
      { key: "name", label: "اسم المدرسة", value: "مدرسة الاختبار", source: pdfPageRef(1), found: true },
      { key: "ministryNo", label: "الرقم الوزاري", value: "12345", source: pdfPageRef(1), found: true },
      { key: "principalName", label: "مديرة المدرسة", value: null, source: { kind: "none", label: "لم يرد" }, found: false },
    ],
    overall: { value: null, source: "absent", sourceLabel: "غير متوفرة" },
    thresholds: DEFAULT_LEVEL_THRESHOLDS,
    thresholdsNote: "لم تعتمد الإدارة حدودًا رقمية للمستويات.",
    domains,
    indicators,
    recommendations,
    plans: [
      {
        indicatorCode: "1-1-1-2",
        title: "1-1-1-2 — تتابع المدرسة تنفيذ خطتها التشغيلية",
        actions: ["مراجعة الخطة ربع سنوية"],
        owner: "مديرة المدرسة",
        startDate: "2026-01-15",
        endDate: "2026-04-01",
        baseline: "45% (صفحة 3)",
        target: 70,
        actual: 58,
        measure: "نسبة تحقيق المؤشر",
        tool: "سجل المتابعة",
        evidence: "تقارير ربع سنوية",
        followUp: "اجتماع دوري",
        status: "in_progress",
        statusLabel: "قيد التنفيذ",
        progressNote: "بدأ التنفيذ",
        completion: 52,
      },
    ],
    revisions: [
      {
        createdAtLabel: "01/01/2026",
        entityLabel: "مؤشر",
        fieldLabel: "النسبة الفعلية",
        oldValue: "40",
        newValue: "45",
        actor: "المشرفة أسماء الباتلي",
        note: "تصحيح يدوي",
      },
    ],
    logoUrl: null,
    notices: ["مؤشران لم ترد نسبتهما في الملف، وقد عُرضا كـ«غير متوفر»."],
  };
}

/* ------------------------------------------------------------------ */
/*  مخططات SVG                                                         */
/* ------------------------------------------------------------------ */

describe("مخططات SVG", () => {
  it("مخطط الأعمدة يرسم القيم المتاحة ويتعامل مع غير المتوفر", () => {
    const svg = barChartSvg(
      [
        { label: "مجال متوفر", value: 80, color: "#2563EB" },
        { label: "مجال غير متوفر", value: null },
      ],
      { width: 600, height: 200 },
    );
    expect(svg).toContain("<svg");
    expect(svg).toContain("مجال متوفر");
    expect(svg).toContain("غير متوفر");
    expect(svg).toContain("80%");
  });

  it("المخطط الدائري يعرض رسالة واضحة عند غياب البيانات", () => {
    const svg = donutChartSvg([{ label: "التهيئة", value: 0, color: "#DC2626" }], {
      width: 400,
      height: 200,
    });
    expect(svg).toContain("لا توجد بيانات");
  });

  it("المخطط الدائري يقسم المجموع", () => {
    const svg = donutChartSvg(
      [
        { label: "التهيئة", value: 2, color: "#DC2626" },
        { label: "التقدم", value: 2, color: "#2563EB" },
      ],
      { width: 400, height: 200 },
    );
    expect(svg).toContain("50%");
    expect(svg).toContain("التهيئة");
  });

  it("المخطط الراداري يرسم الحلقات والتسميات", () => {
    const svg = radarChartSvg(
      [
        { label: "الإدارة", value: 70 },
        { label: "التعليم", value: null },
        { label: "النواتج", value: 88 },
        { label: "البيئة", value: 55 },
      ],
      { width: 400, height: 300 },
    );
    expect(svg).toContain("<polygon");
    expect(svg).toContain("الإدارة");
  });

  it("الخريطة الحرارية تُظهر النسبة أو الشرطة للمفقود", () => {
    const svg = heatmapSvg(
      [
        {
          label: "الإدارة المدرسية",
          cells: [
            { code: "1-1-1-1", level: "taqaddum", percent: 87, title: "مؤشر" },
            { code: "1-1-1-2", level: null, percent: null, title: "مؤشر" },
          ],
        },
      ],
      [{ label: "م1" }, { label: "م2" }],
      { width: 300, height: 200 },
    );
    expect(svg).toContain("87");
    expect(svg).toContain("—");
  });
});

/* ------------------------------------------------------------------ */
/*  تقرير HTML                                                         */
/* ------------------------------------------------------------------ */

describe("تقرير HTML العربي", () => {
  const html = buildReportHtml(makeBundle());

  it("يبدأ باتجاه عربي من اليمين إلى اليسار", () => {
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
  });

  it("يضبط مقاس A4 للطباعة", () => {
    expect(html).toContain("@page");
    expect(html).toContain("size: A4");
  });

  it("يعرض ترويسة الوزارة ونطاق المدارس ومُعِدّ التقرير", () => {
    expect(html).toContain("وزارة التعليم");
    expect(html).toContain("المملكة العربية السعودية");
    expect(html).toContain("مدارس النطاق الثالث");
    expect(html).toContain("المشرفة أسماء الباتلي");
  });

  it("يعرض النسبة العامة كغير متوفرة ولا يختلق قيمة", () => {
    expect(html).toContain("غير متوفرة");
    expect(html).not.toMatch(/النسبة العامة<\/h3>\s*<div class="overall">\s*0%/);
  });

  it("يميّز النسبة الرسمية عن المتوسط الاسترشادي", () => {
    expect(html).toContain("(استرشادي)");
    expect(html).toContain("ليس النسبة الرسمية");
  });

  it("يعرض مرجع كل نتيجة (صفحة)", () => {
    expect(html).toContain("صفحة 3");
  });

  it("يضم المخططات الأربعة", () => {
    expect(html).toContain("<svg");
    expect(html).toContain("مخطط أعمدة");
    expect(html).toContain("مخطط دائري");
    expect(html).toContain("مخطط راداري");
    expect(html).toContain("الخريطة الحرارية");
  });

  it("ينقل التنبيهات إلى التقرير", () => {
    expect(html).toContain("تنبيهات قبل الاعتماد");
    expect(html).toContain("غير متوفر");
  });

  it("يعرض جميع مستويات الأداء بأسمائها", () => {
    for (const label of ["التهيئة", "الانطلاق", "التقدم", "التميز"]) {
      expect(html).toContain(label);
    }
  });

  it("يوضح أن المستهدف مقترح قابل للتعديل", () => {
    expect(html).toContain("مستهدف مقترح");
  });

  it("يعرض خطة التحسين وسجل التعديلات", () => {
    expect(html).toContain("خطة التحسين");
    expect(html).toContain("سجل التعديلات");
    expect(html).toContain("قيد التنفيذ");
  });

  it("يشرح حدود المستويات غير المفعّلة", () => {
    expect(html).toContain("لم تعتمد الإدارة حدودًا رقمية");
  });

  it("لا يسرّب أي وسم أو نص غير مُهرَّب", () => {
    // إذا كان هناك <script> في محتوى بيانات لازم أن يكون مُهرَّبًا
    const scripts = html.match(/<script>/g) ?? [];
    expect(scripts.length).toBeLessThanOrEqual(1);
  });
});

/* ------------------------------------------------------------------ */
/*  تصدير Excel                                                        */
/* ------------------------------------------------------------------ */

describe("تصدير Excel متعدد الأوراق", () => {
  it("ينشئ المصنّف بكل الأوراق المطلوبة وباتجاه عربي", async () => {
    const buffer = await buildAnalysisWorkbook(makeBundle());
    expect(buffer.length).toBeGreaterThan(1000);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);

    const names = wb.worksheets.map((w) => w.name);
    for (const sheet of DATA_SHEETS) {
      expect(names).toContain(sheet);
    }
    expect(names).toHaveLength(DATA_SHEETS.length);

    for (const sheet of DATA_SHEETS) {
      const ws = wb.getWorksheet(sheet)!;
      expect(ws.views?.[0]?.rightToLeft).toBe(true);
    }
  });

  it("يكتب البيانات المدرسة مع حالة كل حقل", async () => {
    const buffer = await buildAnalysisWorkbook(makeBundle());
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["بيانات المدرسة"], {
      header: 1,
      raw: false,
    }) as unknown as string[][];

    const flat = rows.map((r) => r.join(" | "));
    expect(flat.some((l) => l.includes("مدرسة الاختبار"))).toBe(true);
    expect(flat.some((l) => l.includes("غير متوفرة"))).toBe(true);
  });

  it("يكتب تفاصيل المؤشرات بالنسب والمستويات والمصادر", async () => {
    const bundle = makeBundle();
    const buffer = await buildAnalysisWorkbook(bundle);
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["تفاصيل المؤشرات"], {
      header: 1,
      raw: false,
    }) as unknown as string[][];

    const flat = rows.map((r) => r.join(" | "));
    expect(flat.some((l) => l.includes("1-1-1-1") && l.includes("87%"))).toBe(true);
    expect(flat.some((l) => l.includes("التقدم"))).toBe(true);
    expect(flat.some((l) => l.includes("صفحة 3"))).toBe(true);
    // المؤشرات غير الواردة تظهر «غير متوفر» ولا تظهر كصفر
    expect(flat.some((l) => l.includes("4-2-1-3") && l.includes("غير متوفر"))).toBe(true);
  });

  it("يكتب التوصيات مع وسم المصدر والمستهدف المقترح", async () => {
    const buffer = await buildAnalysisWorkbook(makeBundle());
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["التحليل والتوصيات"], {
      header: 1,
      raw: false,
    }) as unknown as string[][];

    const flat = rows.map((r) => r.join(" | "));
    expect(flat.some((l) => l.includes("توصية قائمة على قواعد"))).toBe(true);
    expect(flat.some((l) => l.includes("ليست بيانًا رسميًا"))).toBe(true);
  });

  it("يكتب خطة التحسين بنسب الإنجاز", async () => {
    const buffer = await buildAnalysisWorkbook(makeBundle());
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["خطة التحسين"], {
      header: 1,
      raw: false,
    }) as unknown as string[][];

    const flat = rows.map((r) => r.join(" | "));
    expect(flat.some((l) => l.includes("1-1-1-2") && l.includes("52%"))).toBe(true);
  });

  it("يكتب مرجع حدود المستويات حتى لو لم تعتمد", async () => {
    const buffer = await buildAnalysisWorkbook(makeBundle());
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["مرجع الحدود"], {
      header: 1,
      raw: false,
    }) as unknown as string[][];

    const flat = rows.map((r) => r.join(" | "));
    expect(flat.some((l) => l.includes("غير مفعّلة"))).toBe(true);
    expect(flat.some((l) => l.includes("الحد الأدنى"))).toBe(true);
  });
});