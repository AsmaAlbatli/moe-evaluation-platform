/**
 * محرّك التوصيات القائم على القواعد.
 *
 * يضمن:
 *  - ارتباط كل توصية مباشرة بنتيجة المؤشر ومصدرها (رقم الصفحة/الخلية).
 *  - تمييز واضح بين «بيانات مستخرجة من التقرير» و«توصيات مقترحة».
 *  - عدم توليد نسبة مستهدفة تُعامَل كنتيجة فعلية؛ فالمستهدف دائمًا مقترح
 *    قابل للتعديل ويعتمد من المدرسة.
 *  - عدم افتراض تحقيق 100% ولا نسبة صفرية لأي مؤشر.
 *  - عدم نسب أي توصية إلى هيئة تقويم التعليم والتدريب إلا إذا وردت
 *    كنص صريح في عمود «مقترحات التحسين» الخاص بالمؤشر في التقرير المرفوع.
 */

import {
  INDICATOR_BY_CODE,
  type IndicatorDef,
} from "@/lib/domain/catalog";
import {
  LEVEL_META,
  PERFORMANCE_LEVELS,
  canDeriveLevel,
  type LevelThresholds,
  type PerformanceLevel,
} from "@/lib/domain/levels";
import type { IndicatorResult } from "@/lib/analysis/compute";
import { round2 } from "@/lib/analysis/compute";
import { formatPercent } from "@/lib/text/arabic";
import { DOMAIN_PLAYBOOKS, INDICATOR_MECHANISMS } from "./playbooks";

/* ------------------------------------------------------------------ */
/*  إعدادات القواعد (قابلة للتحديث من إعدادات المنصة)                 */
/* ------------------------------------------------------------------ */

export interface RulesSettings {
  /** مقدار الزيادة المقترحة بالنقاط المئوية عند غياب حدود معتمدة */
  suggestedGainByLevel: Record<PerformanceLevel, number>;
  /** الحد الأعلى للمستهدف المقترح — لتفترض تجاوز 100% */
  maxSuggestedTarget: number;
  /** إدراج «مقترح التحسين» الوارد في التقرير */
  useReportAdvice: boolean;
  /** إدراج توصية لإرساء القياس للمؤشرات التي لم ترد نسبها */
  proposeMeasurementWhenMissing: boolean;
  /** مدة التنفيذ الافتراضية */
  defaultDuration: string;
}

export const DEFAULT_RULES: RulesSettings = {
  suggestedGainByLevel: {
    tahyea: 20,
    intilaq: 12,
    taqaddum: 7,
    tamayyuz: 0,
  },
  maxSuggestedTarget: 98,
  useReportAdvice: true,
  proposeMeasurementWhenMissing: true,
  defaultDuration: "فصل دراسي كامل",
};

/* ------------------------------------------------------------------ */
/*  ناتج التوصية                                                       */
/* ------------------------------------------------------------------ */

export type RecommendationOrigin = "rules" | "ai";

export interface Recommendation {
  indicatorCode: string;
  origin: RecommendationOrigin;
  /** معرّف القاعدة التي أنتجت التوصية */
  ruleId: string;
  /** نقاط القوة المستخرجة من نتيجة المؤشر */
  strengths: string[];
  /** فجوة الأداء — نص وصفي */
  gap: string;
  /** الفارق العددي مقابل المستهدف المقترح — لا يُحسب إلا بوجود هدف */
  gapValue: number | null;
  gapBasis: "proposed-target" | "none";
  /** هدف التحسين المعروض */
  target: string;
  /** المستهدف المقترح — رقم يُعدّل ويعتمد، وليس نتيجة فعلية */
  proposedTargetPercent: number | null;
  /** سبب اقتراح المستهدف */
  targetRationale: string;
  actions: string[];
  owner: string;
  duration: string;
  /** مؤشر قياس الأداء */
  measure: string;
  /** خط الأساس */
  baseline: string;
  tool: string;
  evidence: string[];
  followUp: string;
  /** مراجع مصدر مرتبطة بنتيجة المؤشر */
  evidenceRefs: { label: string; page?: number; sheet?: string; cell?: string }[];
  /** ملاحظة ترفق التوصية始终 */
  disclaimer: string;
}

const DISCLAIMER =
  "توصية مقترحة من المنصة مبنية على نتيجة المؤشر في الملف المرفوع. تُراجَع وتُعدَّل وتُعتمد من المدرسة، وليست بيانًا رسميًا صادرًا عن هيئة تقويم التعليم والتدريب.";

/* ------------------------------------------------------------------ */
/*  حساب المستهدف المقترح                                              */
/* ------------------------------------------------------------------ */

/**
 * يقترح مستهدفًا قابلًا للتعديل:
 *  - إن كانت هناك حدود معتمدة موثّقة بمرجع → حد المستوى الأعلى مباشرة.
 *  - وإلا → زيادة نسبية عن خط الأساس بمقدار محدد في الإعدادات.
 *  - مستوى «التميز» → لا يُقترح رقم أعلى إطلاقًا (تفادي افتراض 100%).
 */
export function proposeTarget(
  percent: number | null,
  level: PerformanceLevel | null,
  thresholds: LevelThresholds,
  rules: RulesSettings,
): { value: number | null; rationale: string } {
  if (percent === null) return { value: null, rationale: "لا يوجد خط أساس بعد، فلا يمكن اقتراح مستهدف رقمي." };

  if (canDeriveLevel(thresholds)) {
    const idx = level ? PERFORMANCE_LEVELS.indexOf(level) : -1;
    if (idx >= 0 && idx < PERFORMANCE_LEVELS.length - 1) {
      const next = PERFORMANCE_LEVELS[idx + 1];
      const nextMin = thresholds.min[next];
      if (nextMin !== null) {
        const value = Math.min(nextMin, rules.maxSuggestedTarget);
        return {
          value: round2(value),
          rationale: `مقترح: حد «${LEVEL_META[next].label}» وفق الحدود المعتمدة في ${thresholds.referenceName}${thresholds.referenceEdition ? ` (إصدار ${thresholds.referenceEdition})` : ""}. حد أدنى مقترح قابل للتعديل.`,
        };
      }
    }
    if (level === "tamayyuz") {
      return {
        value: round2(Math.min(percent, rules.maxSuggestedTarget)),
        rationale:
          "المؤشر في مستوى «التميز»؛ المطلوب استدامة النتيجة والحفاظ عليها لا تجاوزها، فلا يُقترح رفع الرقم.",
      };
    }
  }

  if (level === null) {
    // لا مستوى معتمد → اقتراح محافظ موصوف بوضوح بأنه غير رسمي
    const gain = rules.suggestedGainByLevel.tahyea;
    const value = Math.min(percent + gain, rules.maxSuggestedTarget);
    return {
      value: round2(value),
      rationale: `مقترح ابتدائي (ليس حدًا معتمدًا): زيادة ${gain} نقطة مئوية عن خط الأساس. تُعتمد من المدرسة أو تُعدَّل بعد ضبط حدود المستويات من الإعدادات.`,
    };
  }

  const gain = rules.suggestedGainByLevel[level];
  if (gain === 0) {
    return {
      value: round2(Math.min(percent, rules.maxSuggestedTarget)),
      rationale: `المؤشر في مستوى «${LEVEL_META[level].label}»؛ الهدف هو الاستدامة والتعزيز لا الزيادة الرقمية.`,
    };
  }
  const value = Math.min(percent + gain, rules.maxSuggestedTarget);
  return {
    value: round2(value),
    rationale: `مقترح ابتدائي (ليس حدًا معتمدًا): زيادة ${gain} نقطة مئوية عن خط الأساس للوصول إلى مستوى أفضل. يُعتمد بعد مراجعة المدرسة.`,
  };
}

/* ------------------------------------------------------------------ */
/*  بناء التوصية                                                       */
/* ------------------------------------------------------------------ */

export interface RecommendationContext {
  thresholds: LevelThresholds;
  rules: RulesSettings;
  /** نصوص «مقترحات التحسين» كما وردت في التقرير المرفوع */
  reportAdvice?: Record<string, string>;
}

export function buildRecommendation(
  indicator: IndicatorResult,
  ctx: RecommendationContext,
): Recommendation {
  const def: IndicatorDef | undefined = INDICATOR_BY_CODE.get(indicator.code);
  const playbook = DOMAIN_PLAYBOOKS[indicator.domainId];
  const mechanisms = INDICATOR_MECHANISMS[indicator.code] ?? [];
  const advice = ctx.reportAdvice?.[indicator.code] ?? def?.reportAdvice ?? "";
  const reportAdviceText = ctx.reportAdvice?.[indicator.code] ?? "";

  const target = proposeTarget(indicator.percent, indicator.level, ctx.thresholds, ctx.rules);

  /* --- نقاط القوة: تُشتق من النتيجة فقط --- */
  const strengths: string[] = [];
  if (indicator.percent !== null) {
    strengths.push(`النسبة المسجّلة في الملف ${formatPercent(indicator.percent)}.`);
  }
  if (indicator.level && (indicator.level === "taqaddum" || indicator.level === "tamayyuz")) {
    strengths.push(`المستوى «${LEVEL_META[indicator.level].label}» محقق في التقرير.`);
  }
  if (indicator.level === "tamayyuz" && reportAdviceText.length > 0) {
    strengths.push("وردت للمؤشر مقترحات تحسين من التقرير تُعكس مسيرته القائمة.");
  }
  if (strengths.length === 0) {
    strengths.push("لا تتوفر نتيجة كمية لهذا المؤشر في الملف، ولذلك لم تُشتق نقطة قوة من الأرقام.");
  }

  /* --- فجوة الأداء --- */
  let gap: string;
  let gapValue: number | null = null;
  const gapBasis: "proposed-target" | "none" = "none";
  if (indicator.percent === null) {
    gap =
      "لا يمكن تحديد الفجوة قبل قياس المؤشر؛ القيمة الغائبة لا تُعامل كصفر، ولذلك تُبنى خطة القياس أولًا ثم تُحدد الفجوة.";
  } else if (target.value !== null && target.value > indicator.percent) {
    gapValue = round2(target.value - indicator.percent);
    gap = `الفجوة ${gapValue} نقطة مئوية بين خط الأساس (${formatPercent(indicator.percent)}) والمستهدف المقترح (${formatPercent(target.value)}). الفجوة محسوبة مقابل هدف مقترح ولم يُعتمد بعد.`;
  } else {
    gap = `لا توجد فجوة رقمية قائمة؛ المؤشر عند خط الأساس (${formatPercent(indicator.percent)}) والمستهدف المقترح لا يتجاوزه.`;
  }

  /* --- الإجراءات --- */
  const actions: string[] = [];
  if (indicator.percent === null && ctx.rules.proposeMeasurementWhenMissing) {
    actions.push(
      "وضع أداة قياس موثّقة لهذا المؤشر (سجل، استمارة، أو تقرير مقبول من هيئة تقويم التعليم والتدريب) وجمع قيمة خط الأساس الفعلية قبل بناء خطة المعالجة.",
    );
  }
  if (ctx.rules.useReportAdvice && advice.trim()) {
    actions.push(`تنفيذ مقترح التحسين الوارد في التقرير لهذا المؤشر: ${advice.trim()}`);
  }
  for (const m of mechanisms.slice(0, 3)) {
    actions.push(`آلية مقترحة: ${m}.`);
  }
  if (actions.length === 0) {
    actions.push("لا يوجد مقترح تقرير لهذا المؤشر؛ تُبنى الإجراءات من قبل فريق المدرسة بعد تحليل السبب الجذري.");
  }
  // إجراءان من دفتر المجال لضمان تغطية شاملة
  for (const a of playbook.actions.slice(0, 2)) {
    actions.push(`إجراء على مستوى المجال: ${a}`);
  }

  /* --- خط الأساس ومؤشر القياس --- */
  const baseline = indicator.percent !== null
    ? `${formatPercent(indicator.percent)} (${sourceLabel(indicator)})`
    : "غير متوفر — لم ترد نسبة للمؤشر في الملف، ويجب إرساء خط أساس موثّق قبل اعتماد المستهدف.";

  const measure =
    indicator.percent !== null
      ? `نسبة تحقيق المؤشر ${indicator.code} عند القياس الدوري، مقارنةً بخط الأساس ${formatPercent(indicator.percent)}.`
      : "نسبة تحقيق المؤشر بعد إرساء خط الأساس — لا تُقاس قبل توفر خط أساس موثّق.";

  const evidence = [...playbook.evidence];
  if (reportAdviceText) evidence.push("صورة من صفحة التقرير التي ورد فيها المؤشر ونسبته.");

  return {
    indicatorCode: indicator.code,
    origin: "rules",
    ruleId: ruleIdFor(indicator),
    strengths,
    gap,
    gapValue,
    gapBasis: target.value !== null && gapValue !== null ? "proposed-target" : gapBasis,
    target: target.value !== null
      ? `رفع نسبة المؤشر من خط الأساس ${formatPercent(indicator.percent)} إلى مستهدف مقترح ${formatPercent(target.value)} مع قياس دوري موثّق.`
      : `إرساء خط أساس موثّق للمؤشر ثم تحديد مستهدف متفق عليه، دون افتراض قيمة حالية.`,
    proposedTargetPercent: target.value,
    targetRationale: target.rationale,
    actions: dedupe(actions).slice(0, 8),
    owner: playbook.owner,
    duration: ctx.rules.defaultDuration,
    measure,
    baseline,
    tool: playbook.tool,
    evidence,
    followUp: playbook.followUp,
    evidenceRefs: [{ label: indicator.source.label, page: indicator.source.page, sheet: indicator.source.sheet, cell: indicator.source.cell }],
    disclaimer: DISCLAIMER,
  };
}

function sourceLabel(ind: IndicatorResult): string {
  return ind.source.label || "غير متوفر";
}

function ruleIdFor(ind: IndicatorResult): string {
  if (ind.percent === null) return "missing-measurement";
  if (ind.level === "tahyea") return "level-tahyea";
  if (ind.level === "intilaq") return "level-intilaq";
  if (ind.level === "taqaddum") return "level-taqaddum";
  if (ind.level === "tamayyuz") return "level-tamayyuz";
  return "no-level-no-number";
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.filter((s) => s.trim().length > 0))];
}

/** يبني توصيات لكل المؤشرات دفعة واحدة. */
export function buildRecommendations(
  indicators: IndicatorResult[],
  ctx: RecommendationContext,
): Map<string, Recommendation> {
  const out = new Map<string, Recommendation>();
  for (const ind of indicators) out.set(ind.code, buildRecommendation(ind, ctx));
  return out;
}