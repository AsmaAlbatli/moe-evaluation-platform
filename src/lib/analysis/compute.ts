/**
 * محرّك التحليل والحساب.
 *
 * قواعد صارمة:
 *  - المؤشر غير الوارد في الملف = «غير متوفر» (percent = null)، وليس صفرًا.
 *  - لا يُحسب «النسبة العامة» أبدًا: تُعرض فقط إذا وردت في التقرير.
 *  - أي متوسط حسابي يُحسب لعرض المقارنة يُوسم صراحةً بأنه
 *    «متوسط حسابي استرشادي» وليس النسبة الرسمية المعتمدة.
 *  - مستوى الأداء يُقرأ من التقرير، أو يُشتق بحدود معتمدة فقط.
 */

import {
  ALL_INDICATORS,
  CRITERION_BY_CODE,
  DOMAINS,
  INDICATOR_BY_CODE,
  type DomainId,
} from "@/lib/domain/catalog";
import {
  compareLevels,
  resolveLevel,
  type LevelThresholds,
  type LevelSource,
  type PerformanceLevel,
} from "@/lib/domain/levels";
import type { SourceRef } from "@/lib/extract/rows";

export type AnalysisKind = "external" | "self";

export const ANALYSIS_KIND_LABEL: Record<AnalysisKind, string> = {
  external: "تحليل تقرير التقويم المدرسي الخارجي",
  self: "تحليل تقرير التقويم المدرسي الذاتي",
};

export type ValueSource = "extracted" | "manual" | "absent";

export interface IndicatorResult {
  code: string;
  domainId: DomainId;
  criterionCode: string;
  criterionName: string;
  domainName: string;
  ordinal: number;
  text: string;
  /** النسبة الفعلية كما وردت — null تعني «غير متوفرة» */
  percent: number | null;
  percentSource: ValueSource;
  /** مستوى الأداء كما ورد أو اشتُق من حدود معتمدة */
  level: PerformanceLevel | null;
  levelSource: LevelSource;
  source: SourceRef;
  /** النص الأصلي كما ورد في الملف */
  rawText: string;
  /** هل ظهر هذا المؤشر في الملف أصلًا؟ */
  presentInFile: boolean;
  /** هل راجعته المدرسة واعتمدته؟ */
  reviewed: boolean;
  notes: string;
  /** سبب تعذّر قراءة النسبة إن وُجد */
  valueIssue: string | null;
}

/** نتيجة استخراج لمؤشر واحد تدخل من محرّك الاستخراج. */
export interface IndicatorInput {
  code: string;
  value: number | null;
  level: PerformanceLevel | null;
  ref: SourceRef;
  rawText: string;
  explicitSign?: boolean;
  valueIssue?: string | null;
}

export interface BuildIndicatorsOptions {
  thresholds: LevelThresholds;
  /** تعديلات يدوية: رمز المؤشر ← القيم المعتمدة */
  manual?: Map<string, { percent?: number | null; level?: PerformanceLevel | null; notes?: string; reviewed?: boolean }>;
}

/**
 * يبني قائمة كاملة بكل مؤشرات الكتالوج (46 مؤشرًا) مع النتائج المستخرجة.
 * المؤشرات غير الواردة تظهر بـ percent = null و presentInFile = false.
 */
export function buildIndicators(
  inputs: Iterable<IndicatorInput>,
  options: BuildIndicatorsOptions,
): IndicatorResult[] {
  const byCode = new Map<string, IndicatorInput>();
  for (const input of inputs) byCode.set(input.code, input);

  const manual = options.manual ?? new Map();

  return ALL_INDICATORS.map((def) => {
    const hit = byCode.get(def.code);
    const edit = manual.get(def.code);

    let percent: number | null = hit?.value ?? null;
    let percentSource: ValueSource = hit && percent !== null ? "extracted" : "absent";
    let levelInput = hit?.level ?? null;

    // تطبيق التعديل اليدوي المعتمد
    if (edit && edit.percent !== undefined) {
      percent = edit.percent;
      percentSource = edit.percent === null ? "absent" : "manual";
    }
    if (edit && edit.level !== undefined) levelInput = edit.level;

    const resolution = resolveLevel(levelInput, percent, options.thresholds);

    return {
      code: def.code,
      domainId: def.domainId,
      criterionCode: def.criterionCode,
      criterionName: def.criterionName,
      domainName: def.domainName,
      ordinal: def.ordinal,
      text: def.text,
      percent,
      percentSource,
      level: resolution.level,
      levelSource: resolution.source,
      source: hit?.ref ?? { kind: "none", label: "غير متوفر" },
      rawText: hit?.rawText ?? "",
      presentInFile: Boolean(hit) && percent !== null,
      reviewed: edit?.reviewed ?? false,
      notes: edit?.notes ?? "",
      valueIssue: hit?.valueIssue ?? null,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  المتوسطات الاسترشادية                                              */
/* ------------------------------------------------------------------ */

export interface DescriptiveStats {
  /** عدد المؤشرات التي لها نسبة فعلية */
  count: number;
  /** المتوسط الحسابي للمؤشرات المتاحة فقط — استرشادي وليس النسبة الرسمية */
  average: number | null;
  min: number | null;
  max: number | null;
}

export const EMPTY_STATS: DescriptiveStats = { count: 0, average: null, min: null, max: null };

/** يحسب وصفًا إحصائيًا من النسب المتاحة فقط، دون اعتبار المفقود صفرًا. */
export function describeValues(values: (number | null | undefined)[]): DescriptiveStats {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return EMPTY_STATS;
  const sum = nums.reduce((a, b) => a + b, 0);
  return {
    count: nums.length,
    average: round2(sum / nums.length),
    min: round2(Math.min(...nums)),
    max: round2(Math.max(...nums)),
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------ */
/*  ملخصات المجالات والمجالات                                          */
/* ------------------------------------------------------------------ */

export type AggregateValueKind = "reported" | "computed" | "none";

export interface AggregateValue {
  /** النسبة الرسمية كما وردت في التقرير */
  reported: number | null;
  /** المتوسط الحسابي الاسترشادي للمؤشرات المتاحة */
  computed: number | null;
  /** القيمة المعروضة في المقارنات */
  display: number | null;
  kind: AggregateValueKind;
  source: SourceRef;
}

export interface LevelCounts extends Record<PerformanceLevel, number> {
  unknown: number;
  missing: number;
}

export interface CriterionSummary {
  code: string;
  name: string;
  domainId: DomainId;
  aggregate: AggregateValue;
  level: PerformanceLevel | null;
  levelSource: LevelSource;
  counts: LevelCounts;
  indicators: IndicatorResult[];
}

export interface DomainSummary {
  id: DomainId;
  name: string;
  nameEn: string;
  aggregate: AggregateValue;
  level: PerformanceLevel | null;
  levelSource: LevelSource;
  stats: DescriptiveStats;
  counts: LevelCounts;
  criteria: CriterionSummary[];
  indicators: IndicatorResult[];
  /** أولوية التحسين: عدد المؤشرات الأضعف */
  weaknessScore: number;
}

export interface AnalysisInput {
  indicators: IndicatorResult[];
  /** نسب المجالات كما وردت في التقرير */
  reportedDomains: Map<number, { value: number; ref: SourceRef }>;
  /** نسب المعايير كما وردت في التقرير */
  reportedCriteria: Map<string, { value: number; ref: SourceRef }>;
  thresholds: LevelThresholds;
}

const NO_SOURCE: SourceRef = { kind: "none", label: "غير متوفر" };

/** يبني ملخصات المجالات الأربعة مع معاييرها ومؤشراتها. */
export function buildDomainSummaries(input: AnalysisInput): DomainSummary[] {
  const { indicators, reportedDomains, reportedCriteria, thresholds } = input;

  return DOMAINS.map((domain) => {
    const domainIndicators = indicators.filter((i) => i.domainId === domain.id);

    const criteria: CriterionSummary[] = domain.criteria.map((crit) => {
      const critIndicators = domainIndicators.filter((i) => i.criterionCode === crit.code);
      const aggregate = buildAggregate(
        critIndicators.map((i) => i.percent),
        reportedCriteria.get(crit.code),
      );
      const resolution = resolveLevel(null, aggregate.display, thresholds);
      return {
        code: crit.code,
        name: crit.name,
        domainId: domain.id,
        aggregate,
        level: resolution.level,
        levelSource: resolution.source,
        counts: countLevels(critIndicators),
        indicators: critIndicators,
      };
    });

    const reported = reportedDomains.get(domain.id);
    const aggregate = buildAggregate(
      domainIndicators.map((i) => i.percent),
      reported,
    );
    const resolution = resolveLevel(null, aggregate.display, thresholds);
    const stats = describeValues(domainIndicators.map((i) => i.percent));

    return {
      id: domain.id,
      name: domain.name,
      nameEn: domain.nameEn,
      aggregate,
      level: resolution.level,
      levelSource: resolution.source,
      stats,
      counts: countLevels(domainIndicators),
      criteria,
      indicators: domainIndicators,
      weaknessScore: computeWeaknessScore(domainIndicators),
    };
  });
}

function buildAggregate(
  values: (number | null)[],
  reported?: { value: number; ref: SourceRef },
): AggregateValue {
  const stats = describeValues(values);
  if (reported) {
    return {
      reported: reported.value,
      computed: stats.average,
      display: reported.value,
      kind: "reported",
      source: reported.ref,
    };
  }
  return {
    reported: null,
    computed: stats.average,
    display: stats.average,
    kind: stats.average === null ? "none" : "computed",
    source: NO_SOURCE,
  };
}

/** يعدّ عدد المؤشرات في كل مستوى + غير المحدّد + غير الوارد. */
export function countLevels(indicators: IndicatorResult[]): LevelCounts {
  const counts: LevelCounts = {
    tahyea: 0,
    intilaq: 0,
    taqaddum: 0,
    tamayyuz: 0,
    unknown: 0,
    missing: 0,
  };
  for (const ind of indicators) {
    if (ind.percent === null && ind.level === null) {
      counts.missing += 1;
      continue;
    }
    if (ind.level === null) {
      counts.unknown += 1;
      continue;
    }
    counts[ind.level] += 1;
  }
  return counts;
}

/**
 * درجة ضعف المجال (لرتّب أولويات التحسين).
 * تعتمد على عدد مؤشرات «التهيئة» و«الانطلاق» أولًا، ثم متوسط النسب.
 */
function computeWeaknessScore(indicators: IndicatorResult[]): number {
  const stats = describeValues(indicators.map((i) => i.percent));
  if (stats.count === 0) return Number.MAX_SAFE_INTEGER;
  const tahyea = indicators.filter((i) => i.level === "tahyea").length;
  const intilaq = indicators.filter((i) => i.level === "intilaq").length;
  return round2(tahyea * 10 + intilaq * 3 + (100 - (stats.average ?? 0)));
}

/* ------------------------------------------------------------------ */
/*  الأولويات                                                          */
/* ------------------------------------------------------------------ */

export interface PriorityItem {
  indicator: IndicatorResult;
  rank: number;
  /** سبب الأولوية كما حدده المحرّك */
  reason: string;
}

/**
 * أولويات التحسين: المؤشرات الأضعف أولًا.
 * - من لم ترد نسبته أصلًا يأتي أولًا لأنه بلا قياس — مع وسم واضح.
 * - ثم الأكثر نقصًا في مستوى التهيئة، فالانطلاق، فالأقل نسبة.
 */
export function computePriorityIndicators(indicators: IndicatorResult[], limit = 10): PriorityItem[] {
  const sorted = [...indicators].sort((a, b) => {
    const am = a.percent === null ? -1 : a.percent;
    const bm = b.percent === null ? -1 : b.percent;
    if (am !== bm) return am - bm;
    return compareLevels(a.level, b.level);
  });

  const items = sorted
    .filter((ind) => ind.percent === null || ind.level === "tahyea" || ind.level === "intilaq")
    .slice(0, limit)
    .map((indicator, index) => ({
      indicator,
      rank: index + 1,
      reason: priorityReason(indicator),
    }));

  return items;
}

function priorityReason(ind: IndicatorResult): string {
  if (ind.percent === null) {
    return "لم ترد نسبة هذا المؤشر في الملف — يحتاج قياسًا قبل اعتماد أي خطة.";
  }
  if (ind.level === "tahyea") return `مستوى «التهيئة» — أدنى مستويات الأداء وأولوية التدخل العاجل.`;
  if (ind.level === "intilaq") return `مستوى «الانطلاق» — يحتاج خطة تحسين قابلة للقياس.`;
  return `أدنى نسبة بين المؤشرات المتاحة (${ind.percent}%).`;
}

/* ------------------------------------------------------------------ */
/*  التغطية                                                            */
/* ------------------------------------------------------------------ */

export interface Coverage {
  total: number;
  withPercent: number;
  withLevel: number;
  reviewed: number;
  percentComplete: number;
  reviewedComplete: boolean;
}

export function computeCoverage(indicators: IndicatorResult[]): Coverage {
  const total = indicators.length;
  const withPercent = indicators.filter((i) => i.percent !== null).length;
  const withLevel = indicators.filter((i) => i.level !== null).length;
  const reviewed = indicators.filter((i) => i.reviewed).length;
  return {
    total,
    withPercent,
    withLevel,
    reviewed,
    percentComplete: total === 0 ? 0 : Math.round((withPercent / total) * 100),
    reviewedComplete: total > 0 && reviewed === total,
  };
}

/** نسبة إنجاز الخطة (للتخطيط). */
export function computePlanCompletion(items: PlanProgress[]): number {
  if (items.length === 0) return 0;
  const done = items.filter((i) => i.status === "done").length;
  const inProgress = items.filter((i) => i.status === "in_progress").length;
  return Math.round(((done + inProgress * 0.5) / items.length) * 100);
}

export interface PlanProgress {
  status: "not_started" | "in_progress" | "done" | "blocked";
}

/** معرّف نصي لمعيار معروف. */
export function criterionName(code: string): string {
  return CRITERION_BY_CODE.get(code)?.name ?? code;
}

/** تحقق من رمز مؤشر. */
export function isKnownIndicator(code: string): boolean {
  return INDICATOR_BY_CODE.has(code);
}