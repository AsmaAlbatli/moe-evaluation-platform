import ExcelJS from "exceljs";

import {
  LEVEL_SOURCE_LABEL,
  PLAN_STATUS_LABEL,
  QUALITY_LABEL,
  STATUS_LABEL,
  VALUE_SOURCE_LABEL,
  type ExportBundle,
} from "./bundle";
import { LEVEL_META, PERFORMANCE_LEVELS, describeThresholds } from "@/lib/domain/levels";
import { formatPercent } from "@/lib/text/arabic";
import { LEVEL_LABEL } from "@/lib/domain/levels";

/**
 * تصدير Excel متعدد الأوراق باتجاه عربي من اليمين إلى اليسار.
 * الأوراق: بيانات المدرسة، ملخص المجالات، تفاصيل المؤشرات، التحليل
 * والتوصيات، خطة التحسين، سجل التعديلات، مرجع الحدود.
 */

const NAVY = "FF102A43";
const BLUE = "FF1769AA";
const LIGHT = "FFF1F5F9";

interface SheetSpec {
  name: string;
  columns: { header: string; key: string; width: number }[];
  rows: Record<string, string | number | null>[];
}

function argbToHex(argb: string): string {
  return `#${argb.slice(2)}`;
}

function buildSheet(workbook: ExcelJS.Workbook, spec: SheetSpec): ExcelJS.Worksheet {
  const ws = workbook.addWorksheet(spec.name, {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.columns = spec.columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  const headerRow = ws.getRow(1);
  headerRow.height = 24;
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.border = {
      top: { style: "thin", color: { argb: BLUE } },
      left: { style: "thin", color: { argb: BLUE } },
      bottom: { style: "thin", color: { argb: BLUE } },
      right: { style: "thin", color: { argb: BLUE } },
    };
  });

  for (const row of spec.rows) ws.addRow(row);

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.alignment = { vertical: "top", horizontal: "right", wrapText: true };
    if (rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
      });
    }
  });

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: spec.columns.length },
  };

  return ws;
}

/** تلوين صف المؤشر حسب مستوى الأداء — يتغير فور تعديل النتائج. */
function applyLevelColors(workbook: ExcelJS.Workbook, sheetName: string, levelColumn: number, levelKeyCol: number) {
  const ws = workbook.getWorksheet(sheetName);
  if (!ws) return;
  const levelColLetter = levelColumn;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const raw = String(row.getCell(levelKeyCol).value ?? "").trim();
    const level = raw as keyof typeof LEVEL_META;
    if (!raw || !(level in LEVEL_META)) return;
    const meta = LEVEL_META[level];
    row.getCell(levelColumn).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: meta.soft.replace("#", "").toUpperCase().padStart(8, "F") },
    };
    row.getCell(levelColumn).font = { bold: true, color: { argb: meta.color.replace("#", "").toUpperCase().padStart(8, "F") } };
    void levelColLetter;
  });
}

export async function buildAnalysisWorkbook(bundle: ExportBundle): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = bundle.meta.preparedBy;
  workbook.company = "وزارة التعليم — المملكة العربية السعودية";
  workbook.created = new Date();

  /* ---------------- 1) بيانات المدرسة ---------------- */
  buildSheet(workbook, {
    name: "بيانات المدرسة",
    columns: [
      { header: "الحقل", key: "field", width: 34 },
      { header: "القيمة", key: "value", width: 46 },
      { header: "المصدر في الملف", key: "source", width: 30 },
      { header: "الحالة", key: "status", width: 24 },
    ],
    rows: bundle.school.map((f) => ({
      field: f.label,
      value: f.value === null || f.value === "" ? "غير متوفرة" : String(f.value),
      source: f.found ? f.source.label : "لم ترد في الملف",
      status: f.found ? "مستخرج من التقرير" : "غير متوفر — يلزم إدخال يدوي",
    })).concat([
      { field: "النسبة العامة", value: bundle.overall.value === null ? "غير متوفرة" : formatPercent(bundle.overall.value), source: bundle.overall.source, status: bundle.overall.sourceLabel },
      { field: "نوع التقرير", value: bundle.meta.kindLabel, source: "—", status: "—" },
      { field: "حالة التحليل", value: bundle.meta.statusLabel, source: "—", status: "—" },
      { field: "جودة الاستخراج", value: bundle.meta.extractionQualityLabel, source: "—", status: "—" },
      { field: "تاريخ إصدار التقرير", value: bundle.meta.generatedAtLabel, source: "—", status: "—" },
      { field: "إعداد وتصميم", value: bundle.meta.preparedBy, source: "—", status: "—" },
    ]),
  });

  /* ---------------- 2) ملخص المجالات ---------------- */
  buildSheet(workbook, {
    name: "ملخص المجالات",
    columns: [
      { header: "المجال", key: "domain", width: 26 },
      { header: "النسبة الرسمية (كما وردت)", key: "reported", width: 20 },
      { header: "المتوسط الحسابي الاسترشادي", key: "computed", width: 22 },
      { header: "القيمة المعروضة", key: "display", width: 16 },
      { header: "نوع القيمة", key: "kind", width: 34 },
      { header: "مستوى الأداء", key: "level", width: 16 },
      { header: "مصدر المستوى", key: "levelSource", width: 22 },
      { header: "عدد المؤشرات", key: "count", width: 12 },
      { header: "التهيئة", key: "tahyea", width: 10 },
      { header: "الانطلاق", key: "intilaq", width: 10 },
      { header: "التقدم", key: "taqaddum", width: 12 },
      { header: "التميز", key: "tamayyuz", width: 10 },
      { header: "بلا مستوى", key: "unknown", width: 12 },
      { header: "غير متوفر", key: "missing", width: 12 },
      { header: "المصدر", key: "source", width: 26 },
    ],
    rows: bundle.domains.map((d) => ({
      domain: d.name,
      reported: d.aggregate.reported === null ? "غير متوفرة" : formatPercent(d.aggregate.reported),
      computed: d.aggregate.computed === null ? "غير متوفر" : formatPercent(d.aggregate.computed),
      display: d.aggregate.display === null ? "غير متوفر" : formatPercent(d.aggregate.display),
      kind:
        d.aggregate.kind === "reported"
          ? "النسبة الرسمية كما وردت في التقرير"
          : d.aggregate.kind === "computed"
            ? "متوسط حسابي استرشادي للمؤشرات المتاحة — ليس النسبة الرسمية"
            : "لا توجد بيانات",
      level: d.level ? LEVEL_LABEL[d.level] : "غير متوفر",
      levelSource: LEVEL_SOURCE_LABEL[d.levelSource] ?? "",
      count: d.indicators.length,
      tahyea: d.counts.tahyea,
      intilaq: d.counts.intilaq,
      taqaddum: d.counts.taqaddum,
      tamayyuz: d.counts.tamayyuz,
      unknown: d.counts.unknown,
      missing: d.counts.missing,
      source: d.aggregate.source.label,
    })),
  });
  applyLevelColors(workbook, "ملخص المجالات", 6, 6);

  /* ---------------- 3) تفاصيل المؤشرات ---------------- */
  const indicatorsSheet = buildSheet(workbook, {
    name: "تفاصيل المؤشرات",
    columns: [
      { header: "رمز المؤشر", key: "code", width: 14 },
      { header: "المجال", key: "domain", width: 20 },
      { header: "المعيار", key: "criterion", width: 26 },
      { header: "نص المؤشر", key: "text", width: 58 },
      { header: "النسبة الفعلية", key: "percent", width: 14 },
      { header: "مصدر النسبة", key: "percentSource", width: 22 },
      { header: "مستوى الأداء", key: "level", width: 14 },
      { header: "مصدر المستوى", key: "levelSource", width: 20 },
      { header: "المصدر (صفحة/خلية)", key: "source", width: 26 },
      { header: "هل ورد في الملف", key: "present", width: 14 },
      { header: "تمت المراجعة", key: "reviewed", width: 12 },
      { header: "النص الأصلي", key: "raw", width: 60 },
      { header: "ملاحظات", key: "notes", width: 40 },
    ],
    rows: bundle.indicators.map((i) => ({
      code: i.code,
      domain: i.domainName,
      criterion: i.criterionName,
      text: i.text,
      percent: i.percent === null ? "غير متوفر" : formatPercent(i.percent),
      percentSource: VALUE_SOURCE_LABEL[i.percentSource] ?? i.percentSource,
      level: i.level ? LEVEL_LABEL[i.level] : "غير متوفر",
      levelSource: LEVEL_SOURCE_LABEL[i.levelSource] ?? "",
      source: i.source.label,
      present: i.presentInFile ? "نعم" : "لا",
      reviewed: i.reviewed ? "نعم" : "لا",
      raw: i.rawText || "—",
      notes: i.notes || i.valueIssue || "",
    })),
  });
  applyLevelColors(workbook, "تفاصيل المؤشرات", 7, 7);
  void indicatorsSheet;

  /* ---------------- 4) التحليل والتوصيات ---------------- */
  buildSheet(workbook, {
    name: "التحليل والتوصيات",
    columns: [
      { header: "رمز المؤشر", key: "code", width: 14 },
      { header: "المجال", key: "domain", width: 20 },
      { header: "المعيار", key: "criterion", width: 24 },
      { header: "النسبة الفعلية", key: "percent", width: 14 },
      { header: "المستوى", key: "level", width: 12 },
      { header: "مصدر التوصية", key: "origin", width: 20 },
      { header: "نقاط القوة", key: "strengths", width: 48 },
      { header: "فجوة الأداء", key: "gap", width: 52 },
      { header: "هدف التحسين", key: "target", width: 52 },
      { header: "المستهدف المقترح", key: "targetValue", width: 18 },
      { header: "سبب اقتراح المستهدف", key: "rationale", width: 46 },
      { header: "الإجراءات التنفيذية", key: "actions", width: 70 },
      { header: "مسؤول التنفيذ", key: "owner", width: 28 },
      { header: "مدة التنفيذ", key: "duration", width: 18 },
      { header: "مؤشر قياس الأداء", key: "measure", width: 48 },
      { header: "خط الأساس", key: "baseline", width: 34 },
      { header: "أداة القياس", key: "tool", width: 38 },
      { header: "الشواهد المطلوبة", key: "evidence", width: 48 },
      { header: "آلية المتابعة", key: "followUp", width: 48 },
      { header: "المصدر", key: "source", width: 26 },
      { header: "إشعار", key: "disclaimer", width: 60 },
    ],
    rows: bundle.indicators.map((i) => {
      const rec = bundle.recommendations.get(i.code);
      return {
        code: i.code,
        domain: i.domainName,
        criterion: i.criterionName,
        percent: i.percent === null ? "غير متوفر" : formatPercent(i.percent),
        level: i.level ? LEVEL_LABEL[i.level] : "غير متوفر",
        origin: rec ? (rec.origin === "ai" ? "مقترح ذكاء اصطناعي" : "توصية قائمة على قواعد") : "—",
        strengths: rec?.strengths.join(" • ") ?? "—",
        gap: rec?.gap ?? "—",
        target: rec?.target ?? "—",
        targetValue: rec?.proposedTargetPercent == null ? "غير متوفر" : formatPercent(rec.proposedTargetPercent),
        rationale: rec?.targetRationale ?? "—",
        actions: rec?.actions.join("\n") ?? "—",
        owner: rec?.owner ?? "—",
        duration: rec?.duration ?? "—",
        measure: rec?.measure ?? "—",
        baseline: rec?.baseline ?? "—",
        tool: rec?.tool ?? "—",
        evidence: rec?.evidence.join(" • ") ?? "—",
        followUp: rec?.followUp ?? "—",
        source: i.source.label,
        disclaimer: rec?.disclaimer ?? "—",
      };
    }),
  });
  applyLevelColors(workbook, "التحليل والتوصيات", 5, 5);

  /* ---------------- 5) خطة التحسين ---------------- */
  buildSheet(workbook, {
    name: "خطة التحسين",
    columns: [
      { header: "رمز المؤشر", key: "code", width: 14 },
      { header: "بند الخطة", key: "title", width: 48 },
      { header: "الإجراءات", key: "actions", width: 70 },
      { header: "مسؤول التنفيذ", key: "owner", width: 28 },
      { header: "تاريخ البداية", key: "start", width: 14 },
      { header: "تاريخ النهاية", key: "end", width: 14 },
      { header: "خط الأساس", key: "baseline", width: 24 },
      { header: "المستهدف المعتمد", key: "target", width: 16 },
      { header: "النسبة المحققة", key: "actual", width: 16 },
      { header: "نسبة الإنجاز", key: "completion", width: 14 },
      { header: "مؤشر قياس الأداء", key: "measure", width: 44 },
      { header: "أداة القياس", key: "tool", width: 34 },
      { header: "الشواهد", key: "evidence", width: 44 },
      { header: "آلية المتابعة", key: "followUp", width: 44 },
      { header: "الحالة", key: "status", width: 14 },
      { header: "ملاحظات الإنجاز", key: "note", width: 44 },
    ],
    rows: bundle.plans.map((p) => ({
      code: p.indicatorCode ?? "—",
      title: p.title,
      actions: p.actions.join("\n"),
      owner: p.owner || "—",
      start: p.startDate ?? "—",
      end: p.endDate ?? "—",
      baseline: p.baseline ?? "—",
      target: p.target === null ? "—" : formatPercent(p.target),
      actual: p.actual === null ? "—" : formatPercent(p.actual),
      completion: p.completion === null ? "—" : `${p.completion}%`,
      measure: p.measure || "—",
      tool: p.tool || "—",
      evidence: p.evidence || "—",
      followUp: p.followUp || "—",
      status: p.statusLabel,
      note: p.progressNote || "—",
    })),
  });

  /* ---------------- 6) سجل التعديلات ---------------- */
  buildSheet(workbook, {
    name: "سجل التعديلات",
    columns: [
      { header: "التاريخ", key: "date", width: 22 },
      { header: "العنصر", key: "entity", width: 18 },
      { header: "الحقل", key: "field", width: 26 },
      { header: "القيمة قبل", key: "old", width: 34 },
      { header: "القيمة بعد", key: "new", width: 34 },
      { header: "المنفّذ", key: "actor", width: 22 },
      { header: "ملاحظة", key: "note", width: 44 },
    ],
    rows: bundle.revisions.map((r) => ({
      date: r.createdAtLabel,
      entity: r.entityLabel,
      field: r.fieldLabel,
      old: r.oldValue || "—",
      new: r.newValue || "—",
      actor: r.actor,
      note: r.note || "—",
    })),
  });

  /* ---------------- 7) مرجع الحدود ---------------- */
  const thresholdsRows = [
    { item: "الحالة", detail: bundle.thresholds.enabled ? "مفعّلة" : "غير مفعّلة — يُعرض المستوى كما ورد في التقرير فقط" },
    { item: "المرجع المعتمد", detail: bundle.thresholds.referenceName || "غير محدد" },
    { item: "إصدار المرجع", detail: bundle.thresholds.referenceEdition || "غير محدد" },
    { item: "رابط المرجع", detail: bundle.thresholds.referenceUrl || "—" },
    { item: "الوصف", detail: describeThresholds(bundle.thresholds) },
    { item: "ملاحظات", detail: bundle.thresholds.notes || "—" },
    ...PERFORMANCE_LEVELS.map((l) => ({
      item: `الحد الأدنى — ${LEVEL_META[l].label}`,
      detail: bundle.thresholds.min[l] === null ? "غير محدد" : `${bundle.thresholds.min[l]}%`,
    })),
  ];
  const wsThresholds = workbook.addWorksheet("مرجع الحدود", { views: [{ rightToLeft: true }] });
  wsThresholds.columns = [
    { header: "البند", key: "item", width: 30 },
    { header: "التفصيل", key: "detail", width: 86 },
  ];
  const thHeader = wsThresholds.getRow(1);
  thHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
  thHeader.alignment = { vertical: "middle", horizontal: "center" };
  thHeader.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  });
  for (const r of thresholdsRows) wsThresholds.addRow(r);
  wsThresholds.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.alignment = { vertical: "top", horizontal: "right", wrapText: true };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** اسم ملف مصنّف مقترح. */
export function workbookFileName(bundle: ExportBundle): string {
  const parts = ["تحليل_نتائج_التقويم_المدرسي"];
  const school = bundle.school.find((f) => f.key === "name")?.value;
  if (school) parts.push(String(school));
  const kind = bundle.meta.kind === "external" ? "خارجي" : "ذاتي";
  parts.push(kind);
  return `${parts.join("_")}.xlsx`;
}

export { PLAN_STATUS_LABEL, QUALITY_LABEL, STATUS_LABEL, argbToHex };