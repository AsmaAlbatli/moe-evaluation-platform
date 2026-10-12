/**
 * مستويات الأداء في التقويم المدرسي.
 *
 * قواعد صارمة (دقة البيانات):
 * 1. لا تضع هذه الوحدة أي حدود رقمية افتراضية للمستويات.
 *    المستويات تُستخرج من التقرير كما وردت، أو تُشتق فقط عند ضبط
 *    الإدارة لحدود رقمية موثّقة بمرجع معتمد وإصداره.
 * 2. عندما لا توجد حدود مُعتمدة، لا تُربط النسبة بالمستوى إطلاقًا،
 *    ويُعرض المستوى «غير متوفر» مع عرض النسبة الفعلية وحدها.
 * 3. لا يُشتق أي مؤشر مفقود بصفر — انظر `src/lib/analysis/compute.ts`.
 */

export type PerformanceLevel = "tahyea" | "intilaq" | "taqaddum" | "tamayyuz";

export const PERFORMANCE_LEVELS: readonly PerformanceLevel[] = [
  "tahyea",
  "intilaq",
  "taqaddum",
  "tamayyuz",
] as const;

export interface LevelMeta {
  key: PerformanceLevel;
  label: string;
  /** اللون الأساسي المعتمد في العرض */
  color: string;
  /** خلفية فاتحة للبطاقات */
  soft: string;
  /** حد أغمق للإطار */
  border: string;
  /** ترتيب داخل مفتاح الألوان */
  order: number;
}

/** تدرّج لوني ثابت مطلوب في المواصفة: أحمر ← برتقالي ← أزرق ← أخضر */
export const LEVEL_META: Readonly<Record<PerformanceLevel, LevelMeta>> = {
  tahyea: {
    key: "tahyea",
    label: "التهيئة",
    color: "#DC2626",
    soft: "#FEE2E2",
    border: "#FCA5A5",
    order: 0,
  },
  intilaq: {
    key: "intilaq",
    label: "الانطلاق",
    color: "#EA580C",
    soft: "#FFEDD5",
    border: "#FDBA74",
    order: 1,
  },
  taqaddum: {
    key: "taqaddum",
    label: "التقدم",
    color: "#2563EB",
    soft: "#DBEAFE",
    border: "#93C5FD",
    order: 2,
  },
  tamayyuz: {
    key: "tamayyuz",
    label: "التميز",
    color: "#16A34A",
    soft: "#DCFCE7",
    border: "#86EFAC",
    order: 3,
  },
};

export const LEVEL_LABEL: Readonly<Record<PerformanceLevel, string>> = Object.fromEntries(
  PERFORMANCE_LEVELS.map((l) => [l, LEVEL_META[l].label]),
) as Record<PerformanceLevel, string>;

/** ترتيب تنازلي حسب الأولوية (الأعلى تحسينًا أولًا). */
export function compareLevels(a: PerformanceLevel | null, b: PerformanceLevel | null): number {
  const oa = a ? LEVEL_META[a].order : Number.MAX_SAFE_INTEGER;
  const ob = b ? LEVEL_META[b].order : Number.MAX_SAFE_INTEGER;
  return oa - ob;
}

/* ------------------------------------------------------------------ */
/*  حدود المستويات (تُضبط من الإعدادات الإدارية فقط)                  */
/* ------------------------------------------------------------------ */

export interface LevelThresholds {
  /** تعطيل/تفعيل اشتقاق المستوى من النسبة الرقمية */
  enabled: boolean;
  /** اسم المرجع المعتمد الذي استُندت إليه الحدود */
  referenceName: string;
  /** إصدار المرجع */
  referenceEdition: string;
  /** رابط المرجع (اختياري) */
  referenceUrl: string;
  notes: string;
  /** الحد الأدنى (شاملًا) لكل مستوى. `null` يعني غير محدد. */
  min: Record<PerformanceLevel, number | null>;
}

/** الإعداد الافتراضي: غير مفعّل، ولا حدود افتراضية. */
export const DEFAULT_LEVEL_THRESHOLDS: LevelThresholds = {
  enabled: false,
  referenceName: "",
  referenceEdition: "",
  referenceUrl: "",
  notes: "",
  min: { tahyea: null, intilaq: null, taqaddum: null, tamayyuz: null },
};

export interface ThresholdValidation {
  valid: boolean;
  /** سبب الرفض — يُعرض للإدارة */
  reason: string;
}

/**
 * يتحقق من صحة الحدود قبل اعتمادها.
 * المطلوب: قيم متتالية تصاعديًا داخل المجال [0,100]،
 * وكل حد أعلى من سابقه، مع وجود حد أدنى صالح لكل مستوى.
 */
export function validateThresholds(t: LevelThresholds): ThresholdValidation {
  if (!t.enabled) return { valid: true, reason: "" };
  if (!t.referenceName.trim()) {
    return { valid: false, reason: "يجب تحديد اسم المرجع المعتمد الذي استُندت إليه الحدود." };
  }
  if (!t.referenceEdition.trim()) {
    return { valid: false, reason: "يجب تحديد إصدار المرجع المعتمد." };
  }
  const values = PERFORMANCE_LEVELS.map((l) => t.min[l]);
  if (values.some((v) => v === null || v === undefined || !Number.isFinite(v as number))) {
    return { valid: false, reason: "يجب تحديد حد أدنى رقمي لكل مستوى من المستويات الأربعة." };
  }
  for (const v of values) {
    if ((v as number) < 0 || (v as number) > 100) {
      return { valid: false, reason: "يجب أن تكون الحدود داخل المجال من 0 إلى 100." };
    }
  }
  for (let i = 1; i < values.length; i += 1) {
    if ((values[i] as number) <= (values[i - 1] as number)) {
      return {
        valid: false,
        reason: `يجب أن تكون الحدود متتالية تصاعديًا: «${LEVEL_META[PERFORMANCE_LEVELS[i]].label}» أعلى من «${LEVEL_META[PERFORMANCE_LEVELS[i - 1]].label}».`,
      };
    }
  }
  return { valid: true, reason: "" };
}

/**
 * هل يمكن اشتقاق المستوى من النسبة بهذه الإعدادات؟
 * لا يكفي أن تكون الحدود صالحة شكلًا؛ يجب أن تكون مفعّلة صراحةً،
 * فلا تُشتق أي نسبة إلى مستوى ما لم تعتمد الإدارة حدودًا فعلية.
 */
export function canDeriveLevel(t: LevelThresholds): boolean {
  if (!t.enabled) return false;
  if (!validateThresholds(t).valid) return false;
  return PERFORMANCE_LEVELS.every((l) => {
    const v = t.min[l];
    return typeof v === "number" && Number.isFinite(v);
  });
}

/**
 * يشتق مستوى الأداء من نسبة مئوية باستخدام الحدود المُعتمدة فقط.
 * يعيد `null` إذا كانت النسبة غير متوفرة أو لم تُعتمد حدود صالحة ومفعّلة.
 */
export function deriveLevelFromPercent(
  percent: number | null | undefined,
  t: LevelThresholds,
): PerformanceLevel | null {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) return null;
  if (!canDeriveLevel(t)) return null;
  const values = PERFORMANCE_LEVELS.map((l) => t.min[l] as number);
  let found: PerformanceLevel | null = null;
  for (let i = 0; i < values.length; i += 1) {
    if (percent >= values[i]) found = PERFORMANCE_LEVELS[i];
  }
  return found;
}

/** وصف نصي للحدود — يُعرض في التقرير والإعدادات. */
export function describeThresholds(t: LevelThresholds): string {
  if (!t.enabled) return "غير مفعّلة — يُعرض مستوى المؤشر كما ورد في التقرير فقط.";
  if (!validateThresholds(t).valid) return "غير صالحة — لم تُعتمد، ولا يُشتق أي مستوى من النسبة.";
  const ranges = PERFORMANCE_LEVELS.map((l, i) => {
    const lo = t.min[l] as number;
    const next = i < PERFORMANCE_LEVELS.length - 1 ? (t.min[PERFORMANCE_LEVELS[i + 1]] as number) : null;
    const range = next === null ? `${lo}% فأكثر` : `${lo}% إلى أقل من ${next}%`;
    return `${LEVEL_META[l].label}: ${range}`;
  });
  return `${ranges.join(" — ")} (المصدر: ${t.referenceName}${t.referenceEdition ? ` — إصدار ${t.referenceEdition}` : ""})`;
}

/** هل المستوى مأخوذ من التقرير أم مشتق بحدود معتمدة أم غير متوفر. */
export type LevelSource = "reported" | "thresholds" | "none";

export interface LevelResolution {
  level: PerformanceLevel | null;
  source: LevelSource;
}

/**
 * يقرر مستوى المؤشر:
 * - إن ورد المستوى في التقرير → يُستخدم كما ورد (reported).
 * - وإلا إن كانت هناك نسبة وحدود معتمدة → يُشتق ويُعلَّم (thresholds).
 * - وإلا → غير متوفر (none). ولا يُخمَّن أي مستوى.
 */
export function resolveLevel(
  reportedLevel: PerformanceLevel | null | undefined,
  percent: number | null | undefined,
  t: LevelThresholds,
): LevelResolution {
  if (reportedLevel) return { level: reportedLevel, source: "reported" };
  const derived = deriveLevelFromPercent(percent, t);
  if (derived) return { level: derived, source: "thresholds" };
  return { level: null, source: "none" };
}