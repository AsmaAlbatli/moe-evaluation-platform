/**
 * أدوات معالجة النصوص العربية والأرقام.
 *
 * هدف هذه الوحدة: قراءة ما كُتب في الملف بأمان ودقة، دون اختراع أي قيمة.
 * كل دالة تُعيد `null` عند غياب المعلومة، ولا تُرجع صفرًا كبديل.
 */

const TASHKEEL = /[ً-ْٰـ]/g; // تشكيل + علامة إهمال + تطويل
const ARABIC_LETTERS = /[آأإٱ]/g; // آ أ إ ٱ → ا
const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
const ARABIC_DECIMAL = /[٫،]/g;
const ARABIC_THOUSANDS = /[٬,\s](?=\d{3}\b)/g;

/** يوحّد صور الهمزات والتاء المربوطة والألف المقصورة لأجل المطابقة فقط. */
export function normalizeArabic(input: unknown): string {
  return String(input ?? "")
    .replace(TASHKEEL, "")
    .replace(ARABIC_LETTERS, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىي]/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ـ+/g, "")
    .replace(/[-‏‪-‮﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** يحوّل الأرقام العربية/الفارسية إلى أرقام لاتينية. */
export function toLatinDigits(input: unknown): string {
  return String(input ?? "")
    .replace(ARABIC_DECIMAL, ".")
    .replace(ARABIC_THOUSANDS, "")
    .replace(ARABIC_DIGITS, (d) => {
      const code = d.charCodeAt(0);
      if (code >= 0x06f0) return String(code - 0x06f0);
      return String(code - 0x0660);
    });
}

/** يبني تعبيرًا نمطيًا من بدائل عربية خام بعد تطبيعها (آمن بلا رموز خاصة). */
export function alternativesRegex(...alts: string[]): RegExp {
  const escaped = alts
    .map((a) => normalizeArabic(a).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter(Boolean);
  if (escaped.length === 0) return /$^/; // لا يطابق أي شيء
  return new RegExp(escaped.join("|"));
}

/** هل يحتوي النص (بعد التطبيع) على أي من الكلمات البديلة؟ */
export function textHasAny(text: unknown, ...alts: string[]): boolean {
  return alternativesRegex(...alts).test(normalizeArabic(text));
}

/** يعيد قيمة النمط أو null. */
export function matchNormalized(text: unknown, ...alts: string[]): RegExpMatchArray | null {
  return normalizeArabic(text).match(alternativesRegex(...alts));
}

export interface PercentParse {
  value: number;
  /** هل رافق الرقم علامة نسبة صريحة؟ */
  explicitSign: boolean;
}

export type PercentParseResult =
  | { ok: true; parsed: PercentParse }
  | { ok: false; reason: string; raw: string };

/**
 * يستخرج نسبة مئوية من قيمة (رقم أو نص) دون افتراضات.
 *
 * الحالات التي لا تُقبل (تُعاد كـ `ok:false` بدل تخمين قيمة):
 *  - قيمة كسرية بلا علامة نسبة مثل `0.87` (قد تكون وزنًا لا نسبة).
 *  - قيمة خارج المجال 0..100.
 *  - نص بلا أرقام.
 */
export function parsePercentValue(input: unknown): PercentParseResult {
  const raw = String(input ?? "").trim();
  if (raw === "") return { ok: false, reason: "قيمة فارغة", raw };

  const normalized = toLatinDigits(raw).replace(/[٫،]/g, ".");
  const explicitSign = /[%٪]/.test(raw) || /%/.test(normalized);
  const m = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!m) return { ok: false, reason: "لا توجد قيمة رقمية", raw };

  const value = Number.parseFloat(m[0]);
  if (!Number.isFinite(value)) return { ok: false, reason: "قيمة غير صالحة", raw };
  if (value < 0) return { ok: false, reason: "قيمة سالبة", raw };
  if (value > 100) return { ok: false, reason: "قيمة خارج المجال 0..100", raw };

  if (!explicitSign && value > 0 && value <= 1 && /^0\.\d+/.test(normalized)) {
    return {
      ok: false,
      reason: "قيمة كسرية بلا علامة نسبة (قد تكون وزنًا) — يلزم التحقق اليدوي",
      raw,
    };
  }

  return { ok: true, parsed: { value, explicitSign } };
}

/** يستخرج عددًا صحيحًا موجبًا (عدد الطلاب/المعلمين) دون علامة نسبة. */
export function parseIntegerValue(input: unknown): number | null {
  const raw = String(input ?? "").trim();
  if (raw === "") return null;
  const normalized = toLatinDigits(raw).replace(/[٫،]/g, "").replace(/[٬,\s](?=\d{3}\b)/g, "");
  const m = normalized.match(/-?\d[\d\s]*$/);
  if (!m) return null;
  // نُزيل المسافات فقط — لا تُزال إشارة السالب حتى لا يتحول -3 إلى 3
  const value = Number.parseInt(m[0].replace(/\s/g, ""), 10);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

/** يستخرج نسبة كعدد صحيح (للعدادات). */
export function parseRatioPercent(input: unknown): number | null {
  const r = parsePercentValue(input);
  return r.ok ? r.parsed.value : null;
}

/* ------------------------------------------------------------------ */
/*  مطابقة الرموز (أرقام-أرقام-أرقام-أرقام)                             */
/* ------------------------------------------------------------------ */

/**
 * رمز المؤشر في التقويم المدرسي على النمط: المجال(1-4)-المعيار(1-5)-المعيار الفرعي(1)-المؤشر(1-9)
 * مثال: 1-2-1-3 أو 1 - 2 - 1 - 3
 */
export const INDICATOR_CODE_PATTERN = /\b([1-4])\s*[-–—]\s*([1-5])\s*[-–—]\s*([1-9])\s*[-–—]\s*([1-9])\b/;

export function findIndicatorCode(text: unknown): string | null {
  const m = String(text ?? "").match(INDICATOR_CODE_PATTERN);
  return m ? `${m[1]}-${m[2]}-${m[3]}-${m[4]}` : null;
}

/** يزيل الفراغات ويوحّد الشرطات لعرض الرمز. */
export function normalizeCode(code: string): string {
  return code.trim().replace(/\s*[-–—]\s*/g, "-");
}

/** تنسيق النسبة للعرض: «٨٧٫٥٪» تبقى لاتينية مع فاصلة عشرية واحدة. */
export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "غير متوفر";
  const fixed = value.toFixed(digits);
  const trimmed = fixed.replace(/\.?0+$/, "");
  return `${trimmed}%`;
}

/** تنسيق عدد صحيح للعرض. */
export function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "غير متوفر";
  return new Intl.NumberFormat("ar-EG", { useGrouping: true }).format(value);
}