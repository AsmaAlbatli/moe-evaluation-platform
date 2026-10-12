import "server-only";

import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { loadAnalysisIndicators } from "./ingest";
import {
  ANALYSIS_KIND_LABEL,
  buildDomainSummaries,
  computeCoverage,
  computePriorityIndicators,
  type AnalysisKind,
  type DomainSummary,
  type IndicatorResult,
  type PriorityItem,
} from "@/lib/analysis/compute";
import {
  buildRecommendations,
  type Recommendation,
  type RulesSettings,
} from "@/lib/recommendations/rules";
import type { LevelThresholds } from "@/lib/domain/levels";
import type { SchoolFieldKey, SourceRef } from "@/lib/extract/rows";
import {
  PLAN_STATUS_LABEL,
  QUALITY_LABEL,
  STATUS_LABEL,
  type ExportBundle,
  type ExportPlanRow,
  type ExportRevisionRow,
} from "@/lib/export/bundle";
import { signFileToken } from "@/lib/storage";

/**
 * يجمع بيانات التحليل كاملة من قاعدة البيانات ويحوّلها إلى نموذج
 * جاهز للعرض والتصدير: المؤشرات، ملخصات المجالات، التوصيات، الخطة،
 * سجل التعديلات، وتنبيهات الجودة.
 */

export interface AnalysisRecord {
  id: string;
  kind: AnalysisKind;
  status: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  overallPercent: number | null;
  overallSource: string;
  extractionQuality: string | null;
  extractionSummary: string | null;
  school: {
    id: string;
    name: string | null;
    ministryNo: string | null;
    stage: string | null;
    academicYear: string | null;
    educationOffice: string | null;
    schoolType: string | null;
    gender: string | null;
    principalName: string | null;
    studentsCount: number | null;
    teachersCount: number | null;
  };
}

export interface PlanRow {
  id: string;
  indicatorCode: string | null;
  title: string;
  actions: string[];
  owner: string;
  startDate: string | null;
  endDate: string | null;
  baseline: string | null;
  target: number | null;
  actual: number | null;
  measure: string;
  tool: string;
  evidence: string;
  followUp: string;
  status: string;
  progressNote: string;
}

export interface FullAnalysis {
  record: AnalysisRecord;
  indicators: IndicatorResult[];
  domains: DomainSummary[];
  priorities: PriorityItem[];
  recommendations: Map<string, Recommendation>;
  plans: PlanRow[];
  revisions: ExportRevisionRow[];
  coverage: ReturnType<typeof computeCoverage>;
  thresholds: LevelThresholds;
  rules: RulesSettings;
  notices: string[];
  files: { id: string; originalName: string; kind: string; url: string; pageCount: number | null }[];
  reportAdvice: Record<string, string>;
}

const ENTITY_LABEL: Record<string, string> = {
  indicator: "مؤشر",
  plan: "بند خطة",
  school: "بيانات المدرسة",
  settings: "إعدادات المنصة",
  analysis: "التحليل",
};

const FIELD_LABEL: Record<string, string> = {
  percent: "النسبة الفعلية",
  level: "مستوى الأداء",
  notes: "ملاحظات",
  reviewed: "حالة المراجعة",
  overallPercent: "النسبة العامة",
  name: "اسم المدرسة",
  ministryNo: "الرقم الوزاري",
  stage: "المرحلة",
  principalName: "مديرة المدرسة",
  studentsCount: "عدد الطلاب",
  teachersCount: "عدد المعلمين",
  planTarget: "المستهدف",
  planActual: "النسبة المحققة",
  planStatus: "حالة التنفيذ",
  planOwner: "مسؤول التنفيذ",
  planStartDate: "تاريخ البداية",
  planEndDate: "تاريخ النهاية",
  title: "عنوان البند",
  status: "حالة التحليل",
  thresholds: "حدود مستويات الأداء",
  rules: "قواعد التوصيات",
  logo: "شعار الوزارة",
};

function parseActions(json: string | null): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

function formatDate(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** نسبة الإنجاز للبند: تُحسب من النتيجة مقابل المستهدف المعتمد فقط. */
export function planCompletionPercent(row: {
  baseline: string | null;
  target: number | null;
  actual: number | null;
  status: string;
}): number | null {
  if (row.status === "done") return 100;
  if (row.actual === null || row.target === null) return null;
  const baseline = Number.parseFloat(row.baseline ?? "");
  if (!Number.isFinite(baseline) || row.target <= baseline) return null;
  const ratio = ((row.actual - baseline) / (row.target - baseline)) * 100;
  return Math.max(0, Math.min(100, Math.round(ratio)));
}

export async function getAnalysisRecord(analysisId: string): Promise<AnalysisRecord | null> {
  const row = await prisma.analysis.findUnique({
    where: { id: analysisId },
    include: { school: true },
  });
  if (!row) return null;
  return { ...row, kind: row.kind as AnalysisKind } as AnalysisRecord;
}

export async function loadFullAnalysis(analysisId: string): Promise<FullAnalysis | null> {
  const record = await getAnalysisRecord(analysisId);
  if (!record) return null;

  const settings = await getSettings();
  const indicators = await loadAnalysisIndicators(analysisId, settings.thresholds);

  const [aggregateRows, planRows, revisionRows, fileRows, adviceRows] = await Promise.all([
    prisma.aggregateResult.findMany({ where: { analysisId } }),
    prisma.planItem.findMany({ where: { analysisId }, orderBy: { id: "asc" } }),
    prisma.revision.findMany({ where: { analysisId }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.sourceFile.findMany({ where: { analysisId } }),
    prisma.indicatorResult.findMany({ where: { analysisId }, select: { code: true, rawText: true } }),
  ]);

  const reportedDomains = new Map<number, { value: number; ref: SourceRef }>();
  const reportedCriteria = new Map<string, { value: number; ref: SourceRef }>();
  for (const row of aggregateRows) {
    const ref: SourceRef = {
      kind: row.sourcePage ? "pdf-page" : row.sourceSheet ? "excel-cell" : "none",
      label: row.sourceLabel,
      page: row.sourcePage ?? undefined,
      sheet: row.sourceSheet ?? undefined,
      cell: row.sourceCell ?? undefined,
    };
    if (row.scope === "domain") reportedDomains.set(Number(row.code), { value: row.value, ref });
    else reportedCriteria.set(row.code, { value: row.value, ref });
  }

  const domains = buildDomainSummaries({
    indicators,
    reportedDomains,
    reportedCriteria,
    thresholds: settings.thresholds,
  });

  const priorities = computePriorityIndicators(indicators, 10);

  // نصوص «مقترح التحسين» كما وردت في الملف المرفوع فقط.
  // عند غيابها نمرّر كائنًا فارغًا حتى لا تُنسب توصيات إلى تقرير غير مرفوع.
  const reportAdvice: Record<string, string> = {};
  for (const row of adviceRows) {
    const match = row.rawText.match(/مقترح\s+التحسين\s*[:：-]\s*(.+)/);
    if (match) reportAdvice[row.code] = match[1].trim();
  }

  const recommendations = buildRecommendations(indicators, {
    thresholds: settings.thresholds,
    rules: settings.rules,
    reportAdvice: Object.keys(reportAdvice).length > 0 ? reportAdvice : undefined,
  });

  const plans: PlanRow[] = planRows.map((p) => ({
    id: p.id,
    indicatorCode: p.indicatorCode,
    title: p.title,
    actions: parseActions(p.actionsJson),
    owner: p.owner,
    startDate: p.startDate,
    endDate: p.endDate,
    baseline: p.baseline,
    target: p.target,
    actual: p.actual,
    measure: p.measure,
    tool: p.tool,
    evidence: p.evidence,
    followUp: p.followUp,
    status: p.status,
    progressNote: p.progressNote,
  }));

  const revisions: ExportRevisionRow[] = revisionRows.map((r) => ({
    createdAtLabel: formatDate(r.createdAt),
    entityLabel: ENTITY_LABEL[r.entity] ?? r.entity,
    fieldLabel: FIELD_LABEL[r.field] ?? r.field,
    oldValue: r.oldValue,
    newValue: r.newValue,
    actor: r.actor,
    note: r.note,
  }));

  const notices = buildNotices(record, indicators, aggregateRows.length, settings.thresholds);

  return {
    record,
    indicators,
    domains,
    priorities,
    recommendations,
    plans,
    revisions,
    coverage: computeCoverage(indicators),
    thresholds: settings.thresholds,
    rules: settings.rules,
    notices,
    files: fileRows.map((f) => ({
      id: f.id,
      originalName: f.originalName,
      kind: f.kind,
      url: `/api/files/${encodeURI(f.storageKey)}?token=${encodeURIComponent(signFileToken(f.storageKey))}`,
      pageCount: f.pageCount,
    })),
    reportAdvice,
  };
}

function buildNotices(
  record: AnalysisRecord,
  indicators: IndicatorResult[],
  aggregateCount: number,
  thresholds: LevelThresholds,
): string[] {
  const notices: string[] = [];
  const missing = indicators.filter((i) => i.percent === null).length;
  const noLevel = indicators.filter((i) => i.percent !== null && i.level === null).length;

  if (record.overallPercent === null) {
    notices.push(
      "النسبة العامة غير متوفرة: لم ترد في التقرير ولم تُدخل من المدرسة، ولم تحسبها المنصة تفاديًا لافتراض منهجية احتساب غير معروفة.",
    );
  }
  if (missing > 0) {
    notices.push(
      `${missing} مؤشرًا لم ترد نسبته في الملف، وهي معروضة كـ«غير متوفر» ولم تُعامل كأصفار.`,
    );
  }
  if (noLevel > 0 && !thresholds.enabled) {
    notices.push(
      `${noLevel} مؤشرًا له نسبة دون مستوى أداء محدد. المستويات تُعرض كما وردت في التقرير، ولم تُربط بأي حدود رقمية لأن الإعدادات الإدارية لا تعتمد حدودًا.`,
    );
  }
  if (record.extractionQuality === "weak" || record.extractionQuality === "poor") {
    notices.push(
      `جودة الاستخراج ${QUALITY_LABEL[record.extractionQuality ?? "weak"]}. ${record.extractionSummary ?? ""}`,
    );
  }
  if (aggregateCount === 0) {
    notices.push(
      "لم ترد نسب المعايير أو المجالات في الملف، لذا تعرض المتوسطات الحسابية كقيم استرشادية فقط لا كنسخة رسمية.",
    );
  }
  return notices;
}

/** يحوّل التحليل الكامل إلى حزمة تصدير (تقرير HTML و Excel). */
export function toExportBundle(full: FullAnalysis, logoUrl: string | null): ExportBundle {
  const { record } = full;
  return {
    meta: {
      analysisId: record.id,
      title: record.title,
      kind: record.kind,
      kindLabel: ANALYSIS_KIND_LABEL[record.kind],
      status: record.status,
      statusLabel: STATUS_LABEL[record.status] ?? record.status,
      generatedAtLabel: formatDate(new Date()),
      preparedBy: "المشرفة أسماء الباتلي",
      schoolsScope: "مدارس النطاق الثالث",
      extractionQuality: record.extractionQuality,
      extractionQualityLabel: record.extractionQuality
        ? (QUALITY_LABEL[record.extractionQuality] ?? record.extractionQuality)
        : "غير محدد",
    },
    school: buildSchoolFields(full),
    overall: {
      value: record.overallPercent,
      source: record.overallSource,
      sourceLabel:
        record.overallSource === "extracted"
          ? "كما وردت في التقرير"
          : record.overallSource === "manual"
            ? "إدخال يدوي من المدرسة"
            : "غير متوفرة",
    },
    thresholds: full.thresholds,
    thresholdsNote: full.thresholds.enabled
      ? "اعتُمدت هذه الحدود من إعدادات الإدارة، وتُشتق منها المستويات فقط للنسب التي لا يرد مستواها في التقرير."
      : "لم تعتمد الإدارة حدودًا رقمية للمستويات؛ لذلك يظهر المستوى كما ورد في التقرير فقط.",
    domains: full.domains,
    indicators: full.indicators,
    recommendations: full.recommendations,
    plans: full.plans.map(
      (p): ExportPlanRow => ({
        indicatorCode: p.indicatorCode,
        title: p.title,
        actions: p.actions,
        owner: p.owner,
        startDate: p.startDate,
        endDate: p.endDate,
        baseline: p.baseline,
        target: p.target,
        actual: p.actual,
        measure: p.measure,
        tool: p.tool,
        evidence: p.evidence,
        followUp: p.followUp,
        status: p.status,
        statusLabel: PLAN_STATUS_LABEL[p.status] ?? p.status,
        progressNote: p.progressNote,
        completion: planCompletionPercent(p),
      }),
    ),
    revisions: full.revisions,
    logoUrl,
    notices: full.notices,
  };
}

/** يحوّل بيانات المدرسة إلى بطاقات مع مصادرها. */
export function buildSchoolFields(full: FullAnalysis) {
  const s = full.record.school;
  const meta: { key: SchoolFieldKey; label: string; type: "text" | "int" | "percent" }[] = [
    { key: "name", label: "اسم المدرسة", type: "text" },
    { key: "ministryNo", label: "الرقم الوزاري أو الإحصائي", type: "text" },
    { key: "stage", label: "المرحلة الدراسية", type: "text" },
    { key: "academicYear", label: "العام الدراسي", type: "text" },
    { key: "educationOffice", label: "إدارة التعليم", type: "text" },
    { key: "schoolType", label: "نوع المدرسة", type: "text" },
    { key: "gender", label: "جنس المدرسة", type: "text" },
    { key: "principalName", label: "مديرة المدرسة", type: "text" },
    { key: "studentsCount", label: "عدد الطلاب أو الطالبات", type: "int" },
    { key: "teachersCount", label: "عدد المعلمين", type: "int" },
  ];
  return meta.map((m) => {
    const raw = (s as unknown as Record<string, unknown>)[m.key];
    const value = raw === null || raw === undefined || raw === "" ? null : (raw as string | number);
    return {
      key: m.key,
      label: m.label,
      value,
      source: { kind: "none" as const, label: value === null ? "لم ترد في الملف" : "بيانات المدرسة" },
      found: value !== null,
    };
  });
}

export interface AnalysisListItem {
  id: string;
  title: string;
  kind: AnalysisKind;
  status: string;
  updatedAt: Date;
  overallPercent: number | null;
  extractionQuality: string | null;
  school: {
    name: string | null;
    stage: string | null;
    ministryNo: string | null;
  };
  _count: { indicators: number; plans: number };
}

export async function listAnalyses(kind?: AnalysisKind): Promise<AnalysisListItem[]> {
  const rows = await prisma.analysis.findMany({
    where: kind ? { kind } : undefined,
    orderBy: { updatedAt: "desc" },
    include: { school: true, _count: { select: { indicators: true, plans: true } } },
    take: 200,
  });
  return rows.map((r) => ({ ...r, kind: r.kind as AnalysisKind }));
}

export { formatDate };