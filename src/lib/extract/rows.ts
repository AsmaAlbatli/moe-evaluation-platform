/**
 * محرّك الاستخراج الموحّد.
 *
 * يعمل على مصفوفة صفوف (كل صف = خلايا نصية + مرجع مصدر)، ويستخرج منها:
 *  - بيانات المدرسة (كل حقل مع مرجع مصدره)
 *  - نتائج المؤشرات (رمز + نسبة أو مستوى) مع رقم الصفحة/الخلية
 *  - نتائج المعايير والمجالات كما وردت
 *  - تحذيرات الجودة (تعارض أرقام، قيم ملتبسة، رموز غير معروفة)
 *
 * قاعدة أساسية: لا تُملأ أي قيمة غير موجودة في الملف. القيمة الغائبة = null.
 */

import {
  findIndicatorCode,
  normalizeCode,
  parseIntegerValue,
  parsePercentValue,
  textHasAny,
  normalizeArabic,
} from "@/lib/text/arabic";
import { CRITERION_BY_CODE, DOMAINS, INDICATOR_BY_CODE, type DomainId } from "@/lib/domain/catalog";
import { PERFORMANCE_LEVELS, type PerformanceLevel } from "@/lib/domain/levels";

/* ------------------------------------------------------------------ */
/*  مراجع المصدر                                                       */
/* ------------------------------------------------------------------ */

export type SourceKind = "pdf-page" | "excel-cell" | "ocr-line" | "manual" | "none";

export interface SourceRef {
  kind: SourceKind;
  /** وصف عربي مقروء: «صفحة ٣» أو «ورقة: النتائج — D12» */
  label: string;
  page?: number;
  sheet?: string;
  cell?: string;
  row?: number;
  line?: number;
}

export const NO_SOURCE: SourceRef = { kind: "none", label: "غير متوفر" };

export function pdfPageRef(page: number): SourceRef {
  return { kind: "pdf-page", label: `صفحة ${page}`, page };
}

export function ocrLineRef(page: number, line: number): SourceRef {
  return { kind: "ocr-line", label: `صفحة ${page} — سطر ${line}`, page, line };
}

export function excelCellRef(sheet: string, row: number, col: number): SourceRef {
  return {
    kind: "excel-cell",
    label: `ورقة: ${sheet} — الخلية ${toColumnLetter(col)}${row}`,
    sheet,
    cell: `${toColumnLetter(col)}${row}`,
    row,
  };
}

export function manualRef(note = "إدخال يدوي"): SourceRef {
  return { kind: "manual", label: note };
}

/** يحوّل رقم العمود إلى حرفه: 1 → A، 27 → AA */
export function toColumnLetter(col: number): string {
  let n = col;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out || "A";
}

/* ------------------------------------------------------------------ */
/*  الصفوف والتحذيرات                                                  */
/* ------------------------------------------------------------------ */

export interface RawRow {
  cells: string[];
  ref: SourceRef;
  /** مرجع كل خلية على حدة (اختياري) — يُستخدم لتحديد خلية النسبة بدقة */
  cellRefs?: SourceRef[];
}

/** مرجع الخلية عند فهرس معيّن، ويرجع لمرجع الصف إن لم تتوفر مراجع الخلايا. */
export function refAt(row: RawRow, index: number): SourceRef {
  return row.cellRefs?.[index] ?? row.ref;
}

export type WarningType =
  | "conflict"
  | "ambiguous"
  | "unmatched-code"
  | "no-percent-sign"
  | "fraction-value"
  | "empty-value"
  | "unknown-field";

export interface ExtractionWarning {
  type: WarningType;
  message: string;
  ref: SourceRef;
  code?: string;
}

/* ------------------------------------------------------------------ */
/*  بيانات المدرسة                                                     */
/* ------------------------------------------------------------------ */

export type SchoolFieldKey =
  | "name"
  | "ministryNo"
  | "stage"
  | "academicYear"
  | "educationOffice"
  | "schoolType"
  | "gender"
  | "evaluationType"
  | "reportDate"
  | "principalName"
  | "studentsCount"
  | "teachersCount"
  | "overallPercent";

export const SCHOOL_FIELDS: readonly {
  key: SchoolFieldKey;
  label: string;
  type: "text" | "int" | "percent";
  /** كلمات دالة تُطابَق بعد تطبيع النص */
  keys: string[];
}[] = [
  {
    key: "name",
    label: "اسم المدرسة",
    type: "text",
    // لا تُدرَج الكلمة المجردة «المدرسة» هنا لأنها تطابق «مديرة المدرسة» أيضًا.
    // المطابقة تعتمد أطول كلمة مطابقة، فتكفي «اسم المدرسة» للتمييز.
    keys: ["اسم المدرسة", "اسم المدرسه", "اسم البن"],
  },
  {
    key: "ministryNo",
    label: "الرقم الوزاري أو الإحصائي",
    type: "text",
    keys: ["الرقم الوزاري", "الرقم الاحصائي", "الرقم الإحصائي", "الرقم的模式", "كود المدرسة"],
  },
  { key: "stage", label: "المرحلة الدراسية", type: "text", keys: ["المرحلة", "المرحلة الدراسية"] },
  {
    key: "academicYear",
    label: "العام الدراسي",
    type: "text",
    keys: ["العام الدراسي", "العام الدراسي", "العام"],
  },
  { key: "educationOffice", label: "إدارة التعليم", type: "text", keys: ["ادارة التعليم", "الإدارة العامة للتعليم"] },
  { key: "schoolType", label: "نوع المدرسة", type: "text", keys: ["نوع المدرسة", "نوع المدارس"] },
  { key: "gender", label: "جنس المدرسة", type: "text", keys: ["الجنس", "نوع المدرسة من حيث الجنس"] },
  { key: "evaluationType", label: "نوع التقويم", type: "text", keys: ["نوع التقويم", "نوع التقييم", "دورة التقويم"] },
  { key: "reportDate", label: "تاريخ التقرير", type: "text", keys: ["تاريخ التقرير", "التاريخ", "تاريخ"] },
  {
    key: "principalName",
    label: "مديرة المدرسة",
    type: "text",
    keys: ["المديرة", "مديرة المدرسة", "رئيسة المدرسة", "مدير المدرسة", "رئيس المدرسة"],
  },
  {
    key: "studentsCount",
    label: "عدد الطلاب أو الطالبات",
    type: "int",
    keys: ["عدد الطلبة", "عدد الطلاب", "عدد الطالبات", "العدد الإجمالي للطلبة", "إجمالي الطلبة", "عدد المتعلمين"],
  },
  {
    key: "teachersCount",
    label: "عدد المعلمين",
    type: "int",
    keys: ["عدد المعلمين", "عدد المعلمات", "عدد المعلمين والمعلمات", "إجمالي المعلمين", "الكادر التعليمي"],
  },
  {
    key: "overallPercent",
    label: "النسبة العامة",
    type: "percent",
    keys: ["النسبة العامة", "الأداء العام", "النسبة الكلية", "المتوسط العام", "النتائج العامة"],
  },
] as const;

export interface SchoolField {
  key: SchoolFieldKey;
  label: string;
  value: string | number | null;
  source: SourceRef;
  found: boolean;
}

export type SchoolInfo = Record<SchoolFieldKey, SchoolField>;

/* ------------------------------------------------------------------ */
/*  النتائج المستخرجة                                                  */
/* ------------------------------------------------------------------ */

export interface IndicatorHit {
  code: string;
  /** النسبة كما وردت — null إن لم ترد */
  value: number | null;
  /** سبب رفض أي نسبة مرشّحة */
  valueIssue: string | null;
  /** المستوى كما ورد نصيًا — null إن لم يرد */
  level: PerformanceLevel | null;
  ref: SourceRef;
  rawText: string;
  /** هل رأت علامة نسبة صريحة؟ */
  explicitSign: boolean;
}

export interface AggregateHit {
  code: string;
  value: number;
  ref: SourceRef;
  rawText: string;
}

export interface UnmatchedRow {
  text: string;
  ref: SourceRef;
}

/**
 * يختار أنسب حقل مدرسي للخلية الأولى.
 * يعتمد أطول كلمة مطابقة، حتى لا تلتقط «المدرسة» في «مديرة المدرسة».
 */
function matchSchoolField(cell: string): SchoolFieldKey | null {
  const n = normalizeArabic(cell);
  if (!n) return null;

  let best: { key: SchoolFieldKey; length: number } | null = null;
  for (const f of SCHOOL_FIELDS) {
    for (const k of f.keys) {
      const nk = normalizeArabic(k);
      if (nk.length >= 3 && n.includes(nk) && (!best || nk.length > best.length)) {
        best = { key: f.key, length: nk.length };
      }
    }
  }
  return best?.key ?? null;
}

/**
 * يقسم «التسمية: القيمة» إلى قيمة، مع محاولة الحفاظ على النص الأصلي.
 * نجرّب الكلمة كما وردت أولًا؛ فإن لم تُوجد نلجأ للنص المطبَّع.
 */
function splitInlineLabel(cell: string, key: string): string | null {
  const strip = (s: string) => s.replace(/^[\s:：\-–—]+/, "").trim();
  for (const candidate of [key, normalizeArabic(key)]) {
    if (!candidate) continue;
    const at = cell.indexOf(candidate);
    if (at >= 0) {
      const tail = strip(cell.slice(at + candidate.length));
      if (tail) return tail;
    }
  }
  const n = normalizeArabic(cell);
  const nk = normalizeArabic(key);
  const at = n.indexOf(nk);
  if (at < 0) return null;
  return strip(n.slice(at + nk.length)) || null;
}

export interface HarvestResult {
  school: SchoolInfo;
  indicators: Map<string, IndicatorHit>;
  criteria: Map<string, AggregateHit>;
  domains: Map<number, AggregateHit>;
  warnings: ExtractionWarning[];
  unmatched: UnmatchedRow[];
}

/* ------------------------------------------------------------------ */
/*  أدوات مساعدة                                                       */
/* ------------------------------------------------------------------ */

export function emptySchoolInfo(): SchoolInfo {
  const out = {} as SchoolInfo;
  for (const f of SCHOOL_FIELDS) {
    out[f.key] = { key: f.key, label: f.label, value: null, source: NO_SOURCE, found: false };
  }
  return out;
}

const LEVEL_KEYWORD_INDEX: { level: PerformanceLevel; keys: string[] }[] = [
  { level: "tahyea", keys: ["التهيئة"] },
  { level: "intilaq", keys: ["الانطلاق"] },
  { level: "taqaddum", keys: ["التقدم"] },
  { level: "tamayyuz", keys: ["التميز"] },
];

/**
 * كلمات المستويات بعد التطبيع.
 * نطبّعها برمجيًا لأن التطبيع يحوّل «التهيئة» إلى «التهييه»
 * (تحويل ئ إلى ي)، فكتابة النمط يدويًا عرضة للخطأ.
 */
const LEVEL_WORDS: Record<PerformanceLevel, string> = {
  tahyea: normalizeArabic("التهيئة"),
  intilaq: normalizeArabic("الانطلاق"),
  taqaddum: normalizeArabic("التقدم"),
  tamayyuz: normalizeArabic("التميز"),
};

const LEVEL_WORD_ALT = Object.values(LEVEL_WORDS).join("|");

/** أقصى طول خلية يُسمح بقراءتها كخلية «مستوى». */
const LEVEL_CELL_MAX_LENGTH = 120;

const STANDALONE_LEVEL_RE = new RegExp(
  `^(?:بمستوي|مستوي|بمستوى|مستوى)?\\s*(${LEVEL_WORD_ALT})\\s*[%٪]?$`,
);

const PREFIXED_LEVEL_RE = new RegExp(
  `(?:بمستوي|مستوي|بمستوى|مستوى)\\s[^|%]{0,20}?(${LEVEL_WORD_ALT})`,
);

/** أوصاف الدرجة كما وردت في التقارير: متميّزة / متقدّمة / متوسطة / ضعيفة. */
const DEGREE_WORDS: [string, PerformanceLevel][] = [
  [normalizeArabic("متميزة"), "tamayyuz"],
  [normalizeArabic("متقدمة"), "taqaddum"],
  [normalizeArabic("متوسطة"), "intilaq"],
  [normalizeArabic("ضعيفة"), "tahyea"],
  [normalizeArabic("منخفضة"), "tahyea"],
];

const DEGREE_KEYWORD = normalizeArabic("بدرجة");

function levelFromWord(word: string): PerformanceLevel {
  const w = normalizeArabic(word);
  for (const [level, text] of Object.entries(LEVEL_WORDS) as [PerformanceLevel, string][]) {
    if (w === text) return level;
  }
  return "tahyea";
}

/** يطابق كلمة مستوى في خلية قصيرة، أو عبارة «مستوى الأداء: التميز». */
function matchStandaloneLevel(t: string): PerformanceLevel | null {
  // كلمة المستوى وحدها (مع نسبة اختيارية)
  const only = t.match(STANDALONE_LEVEL_RE);
  if (only) return levelFromWord(only[1]);

  // «مستوى الأداء: التميز» أو «بمستوى الانطلاق» داخل خلية قصيرة
  const prefixed = t.match(PREFIXED_LEVEL_RE);
  if (prefixed) return levelFromWord(prefixed[1]);

  return null;
}

/** يطابق عبارة «… بدرجة متميزة/متقدمة/متوسطة/ضعيفة». */
function matchDegreePhrase(t: string): PerformanceLevel | null {
  if (!t.includes(DEGREE_KEYWORD)) return null;
  const after = t.slice(t.indexOf(DEGREE_KEYWORD) + DEGREE_KEYWORD.length);
  const head = after.slice(0, 24);
  for (const [word, level] of DEGREE_WORDS) {
    if (head.includes(word)) return level;
  }
  return null;
}

/**
 * يستخرج مستوى الأداء كما ورد في الملف.
 *
 * يقتصر على الخلايا القصيرة حصرًا، حتى لا تلتقط كلمة «التميز» العابرة داخل
 * نص المؤشر أو داخل عمود «مقترحات التحسين» وتُسند مستوى غير صحيح.
 */
export function findReportedLevelInCells(cells: readonly string[]): PerformanceLevel | null {
  for (const cell of cells) {
    const t = normalizeArabic(cell);
    if (!t || t.length > LEVEL_CELL_MAX_LENGTH) continue;
    if (t.includes(DEGREE_KEYWORD)) {
      const lv = matchDegreePhrase(t);
      if (lv) return lv;
    }
    const direct = matchStandaloneLevel(t);
    if (direct) return direct;
  }
  return null;
}

/** نسخة نصية للاختبارات والاستخدام مع نص واحد. */
export function findReportedLevel(text: unknown): PerformanceLevel | null {
  return findReportedLevelInCells([String(text ?? "")]);
}

/** أسماء المجالات الأربعة المرصودة في التقرير. */
export function findDomainId(text: unknown): DomainId | null {
  if (textHasAny(text, "الإدارة المدرسية")) return 1;
  if (textHasAny(text, "التعليم والتعلم")) return 2;
  if (textHasAny(text, "نواتج التعلم")) return 3;
  if (textHasAny(text, "البيئة المدرسية")) return 4;
  return null;
}

const DOMAIN_NAMES = new Map(DOMAINS.map((d) => [d.id, d.name]));

/** يستنتج معيارًا من رمز «1-2» أو من اسم المعيار الوارد في النص. */
export function findCriterionCode(text: unknown): string | null {
  const raw = String(text ?? "");
  const m = raw.match(/(?:^|\s|\||،)([1-4])\s*[-–—]\s*([1-5])(?:\s|$|\||،)/) ?? raw.match(/^([1-4])\s*[-–—]\s*([1-5])$/);
  if (m) {
    const code = `${m[1]}-${m[2]}`;
    if (CRITERION_BY_CODE.has(code)) return code;
  }
  for (const code of CRITERION_BY_CODE.keys()) {
    const crit = CRITERION_BY_CODE.get(code)!;
    if (textHasAny(raw, crit.name)) return code;
  }
  return null;
}

/** يستخرج أرقامًا من صف مع أعمدتها. */
function cellsWithNumbers(cells: string[]): { index: number; raw: string }[] {
  const out: { index: number; raw: string }[] = [];
  cells.forEach((c, i) => {
    if (/[%٪]/.test(c) || /\d/.test(c)) out.push({ index: i, raw: c });
  });
  return out;
}

/** يختار خلية النسبة المناسبة: تفضّل ما بعد خلية الرمز، وتفضّل علامة النسبة. */
function pickPercentCell(cells: string[], startIndex: number): { index: number; raw: string } | null {
  const candidates = cellsWithNumbers(cells).filter((c) => c.index >= startIndex);
  if (candidates.length === 0) return null;
  return candidates.find((c) => /[%٪]/.test(c.raw)) ?? candidates[0];
}

/* ------------------------------------------------------------------ */
/* Harvest                                                             */
/* ------------------------------------------------------------------ */

/**
 * يمرّ على الصفوف ويستخرج كل ما يمكن استخراجه دون افتراض.
 */
export function harvestRows(rows: RawRow[]): HarvestResult {
  const result: HarvestResult = {
    school: emptySchoolInfo(),
    indicators: new Map(),
    criteria: new Map(),
    domains: new Map(),
    warnings: [],
    unmatched: [],
  };

  for (const row of rows) {
    const cells = row.cells.map((c) => String(c ?? "").trim());
    const nonEmpty = cells.filter((c) => c !== "");
    if (nonEmpty.length === 0) continue;

    const joined = nonEmpty.join(" | ");
    const firstCell = nonEmpty[0] ?? "";

    /* ---------- 1) بيانات المدرسة: «التسمية | القيمة» ---------- */
    const matchedField = matchSchoolField(firstCell);
    if (matchedField && !findIndicatorCode(joined)) {
      const applied = applySchoolField(result, matchedField, nonEmpty, row);
      if (applied) continue;
    }
    // صيغة «اسم المدرسة: فاطمة الزهراء» داخل خلية واحدة
    if (!findIndicatorCode(joined)) {
      const inlineField = matchSchoolField(firstCell);
      if (inlineField) {
        const applied = applyInlineSchoolField(result, inlineField, firstCell, row.ref);
        if (applied) continue;
      }
    }

    /* ---------- 2) المؤشر: رمز + نسبة/مستوى ---------- */
    const code = findIndicatorCode(joined);
    if (code) {
      harvestIndicator(result, code, cells, nonEmpty, row, joined);
      continue;
    }

    /* ---------- 3) المعيار: رمز/اسم + نسبة ---------- */
    const critCode = findCriterionCode(joined);
    if (critCode) {
      const picked = pickPercentCell(cells, 1);
      if (picked) {
        const pickedRef = refAt(row, picked.index);
        const parsed = parsePercentValue(picked.raw);
        if (parsed.ok) {
          recordAggregate(
            result.criteria,
            critCode,
            { code: critCode, value: parsed.parsed.value, ref: pickedRef, rawText: joined },
            result.warnings,
          );
          continue;
        }
        result.warnings.push({
          type: "fraction-value",
          message: `تعذّر قراءة نسبة المعيار «${critCode}»: ${parsed.reason}. النص: «${joined.slice(0, 80)}»`,
          ref: pickedRef,
          code: critCode,
        });
      }
      continue;
    }

    /* ---------- 4) المجال: اسم + نسبة ---------- */
    const domId = findDomainId(joined);
    if (domId !== null) {
      const picked = pickPercentCell(cells, 1);
      if (picked) {
        const pickedRef = refAt(row, picked.index);
        const parsed = parsePercentValue(picked.raw);
        if (parsed.ok) {
          recordAggregate(
            result.domains,
            domId,
            { code: String(domId), value: parsed.parsed.value, ref: pickedRef, rawText: joined },
            result.warnings,
          );
          continue;
        }
        result.warnings.push({
          type: "fraction-value",
          message: `تعذّر قراءة نسبة المجال «${DOMAIN_NAMES.get(domId)}»: ${parsed.reason}.`,
          ref: pickedRef,
        });
      }
      continue;
    }

    /* ---------- 5) صف غير مطابق ---------- */
    if (nonEmpty.length > 0 && joined.length > 3) {
      result.unmatched.push({ text: joined.slice(0, 200), ref: row.ref });
    }
  }

  return result;
}

function recordAggregate<K>(
  map: Map<K, AggregateHit>,
  key: K,
  hit: AggregateHit,
  warnings: ExtractionWarning[],
) {
  const existing = map.get(key);
  if (!existing) {
    map.set(key, hit);
    return;
  }
  if (Math.abs(existing.value - hit.value) > 0.001) {
    warnings.push({
      type: "conflict",
      message: `تعارض في القيم: ${hit.code} ورد بقيمة ${hit.value} في «${hit.ref.label}» وقيمة ${existing.value} في «${existing.ref.label}». راجع يدويًا.`,
      ref: hit.ref,
      code: hit.code,
    });
    return;
  }
  map.set(key, hit);
}

function harvestIndicator(
  result: HarvestResult,
  code: string,
  cells: string[],
  nonEmpty: string[],
  row: RawRow,
  joined: string,
) {
  const ref = row.ref;
  const known = INDICATOR_BY_CODE.has(code);
  if (!known) {
    result.warnings.push({
      type: "unmatched-code",
      message: `الرمز «${code}» غير موجود في كتالوج المعايير المعتمد. أُهمل ولم يُحتسب ضمن النتائج.`,
      ref,
      code,
    });
    return;
  }

  const codeCellIndex = cells.findIndex((c) => findIndicatorCode(c));
  const startIndex = codeCellIndex >= 0 ? codeCellIndex + 1 : 0;

  let value: number | null = null;
  let valueIssue: string | null = null;
  let explicitSign = false;
  const picked = pickPercentCell(cells, startIndex);

  if (picked) {
    const pickedRef = refAt(row, picked.index);
    const parsed = parsePercentValue(picked.raw);
    if (parsed.ok) {
      value = parsed.parsed.value;
      explicitSign = parsed.parsed.explicitSign;
      if (!parsed.parsed.explicitSign) {
        result.warnings.push({
          type: "no-percent-sign",
          message: `قيمة المؤشر ${code} قُرئت من «${picked.raw}» دون علامة نسبة صريحة. راجع الرقم.`,
          ref: pickedRef,
          code,
        });
      }
    } else {
      valueIssue = parsed.reason;
      result.warnings.push({
        type: "fraction-value",
        message: `تعذّر قراءة نسبة المؤشر ${code}: ${parsed.reason}. النص: «${picked.raw}».`,
        ref: pickedRef,
        code,
      });
    }
  }

  // نافذة السياق: نقتصر على الخلايا القصيرة حتى لا نلتقط كلمات عابرة
  const level = findReportedLevelInCells(nonEmpty);

  const hit: IndicatorHit = {
    code,
    value,
    valueIssue,
    level,
    ref: picked && value !== null ? refAt(row, picked.index) : ref,
    rawText: joined.slice(0, 500),
    explicitSign,
  };

  const existing = result.indicators.get(code);
  if (!existing) {
    result.indicators.set(code, hit);
    return;
  }
  if (existing.value !== value && value !== null && existing.value !== null) {
    result.warnings.push({
      type: "conflict",
      message: `تعارض في قيمة المؤشر ${code}: ${existing.value} في «${existing.ref.label}» و${value} في «${ref.label}». اعتُمدت القيمة الأولى، وراجع يدويًا.`,
      ref,
      code,
    });
    return;
  }
  if (existing.value === null && value !== null) {
    existing.value = value;
    existing.valueIssue = null;
    existing.explicitSign = explicitSign;
    existing.ref = ref;
    existing.rawText = hit.rawText;
  }
  if (!existing.level && hit.level) existing.level = hit.level;
}

/** يحاول قراءة قيمة حقل مدرسي من صف «التسمية | القيمة». */
function applySchoolField(
  result: HarvestResult,
  key: SchoolFieldKey,
  cells: string[],
  row: RawRow,
): boolean {
  const def = SCHOOL_FIELDS.find((f) => f.key === key)!;
  const current = result.school[key];

  // القيمة = أول خلية بعد التسمية صالحة للنوع المطلوب
  for (let i = 1; i < cells.length; i += 1) {
    const raw = cells[i];
    if (!raw) continue;
    const ref = refAt(row, i);
    if (def.type === "text") {
      // إذا كانت الخلية التالية تسمية حقل آخر فلا تُعتبر قيمة لهذا الحقل
      const isOtherLabel = SCHOOL_FIELDS.some((f) => f.key !== key && matchSchoolField(raw) === f.key);
      if (isOtherLabel) continue;
      setSchoolField(result, key, raw, ref);
      return true;
    }
    if (def.type === "int") {
      const n = parseIntegerValue(raw);
      if (n === null) continue;
      if (!current.found || (typeof current.value === "number" && n > current.value)) {
        setSchoolField(result, key, n, ref);
      } else {
        addConflict(result, key, current.value, n, ref);
      }
      return true;
    }
    const parsed = parsePercentValue(raw);
    if (parsed.ok) {
      if (!current.found) setSchoolField(result, key, parsed.parsed.value, ref);
      else addConflict(result, key, current.value, parsed.parsed.value, ref);
      return true;
    }
    result.warnings.push({
      type: "fraction-value",
      message: `تعذّر قراءة «${def.label}»: ${parsed.reason}. النص: «${raw}».`,
      ref,
    });
    return true;
  }
  return false;
}

/** يقرأ «التسمية: القيمة» من خلية واحدة. */
function applyInlineSchoolField(
  result: HarvestResult,
  key: SchoolFieldKey,
  cell: string,
  ref: SourceRef,
): boolean {
  const def = SCHOOL_FIELDS.find((f) => f.key === key)!;

  for (const k of def.keys) {
    const tail = splitInlineLabel(cell, k);
    if (!tail) continue;

    if (def.type === "int") {
      const num = parseIntegerValue(tail);
      if (num !== null) {
        setSchoolField(result, key, num, ref);
        return true;
      }
      continue;
    }
    if (def.type === "percent") {
      const parsed = parsePercentValue(tail);
      if (parsed.ok) {
        setSchoolField(result, key, parsed.parsed.value, ref);
        return true;
      }
      continue;
    }
    setSchoolField(result, key, tail, ref);
    return true;
  }
  return false;
}

function setSchoolField(result: HarvestResult, key: SchoolFieldKey, value: string | number, ref: SourceRef) {
  result.school[key] = { ...result.school[key], value, source: ref, found: true };
}

function addConflict(
  result: HarvestResult,
  key: SchoolFieldKey,
  a: string | number | null,
  b: string | number | null,
  ref: SourceRef,
) {
  if (String(a) === String(b)) return;
  result.warnings.push({
    type: "conflict",
    message: `تعارض في «${result.school[key].label}»: ${a} مقابل ${b} (${ref.label}). اعتُمدت القيمة الأولى، وراجع يدويًا.`,
    ref,
  });
}

/** ملخص جودة الاستخراج لعرضه للمستخدم. */
export type ExtractionQuality = "good" | "weak" | "poor";

export function assessExtractionQuality(r: HarvestResult): {
  quality: ExtractionQuality;
  reasons: string[];
} {
  const reasons: string[] = [];
  const warnings = r.warnings;
  const conflicts = warnings.filter((w) => w.type === "conflict").length;
  const ambiguous = warnings.filter((w) => w.type === "fraction-value" || w.type === "no-percent-sign").length;
  const hits = r.indicators.size;
  const withValue = [...r.indicators.values()].filter((h) => h.value !== null).length;

  if (conflicts > 0) reasons.push(`${conflicts} تعارض في الأرقام يحتاج مراجعة يدوية.`);
  if (ambiguous > 0) reasons.push(`${ambiguous} قيمة لم تُقرأ بثقة وتحتاج تحققًا.`);
  if (hits === 0) reasons.push("لم يُتعرَّف على أي مؤشر في الملف.");
  else if (hits < 10) reasons.push(`تعُرّف على ${hits} مؤشر فقط — قد يكون الملف جزئيًا أو جدول نتائجه غير مكتمل.`);

  let quality: ExtractionQuality = "good";
  if (conflicts > 0 || ambiguous > 2 || hits === 0) quality = "weak";
  if (hits === 0 || (withValue === 0 && hits > 0)) quality = "poor";

  return { quality, reasons };
}

export { PERFORMANCE_LEVELS, normalizeCode, LEVEL_KEYWORD_INDEX };