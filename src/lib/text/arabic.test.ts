import { describe, expect, it } from "vitest";
import {
  findIndicatorCode,
  formatInteger,
  formatPercent,
  normalizeArabic,
  parseIntegerValue,
  parsePercentValue,
  toLatinDigits,
} from "@/lib/text/arabic";

describe("normalizeArabic", () => {
  it("يوحّد صور الهمزات والتاء المربوطة والألف المقصورة", () => {
    expect(normalizeArabic("الإدارة المدرسية")).toBe(normalizeArabic("الادارة المدرسية"));
    expect(normalizeArabic("معلمة")).toBe(normalizeArabic("معلمه"));
  });

  it("يزيل التشكيل ويضغط المسافات", () => {
    expect(normalizeArabic("  اَلتَّحْصِيل   التعليمي ")).toBe("التحصيل التعليمي");
  });

  it("لا يخترع قيمة عند غياب نص", () => {
    expect(normalizeArabic(undefined)).toBe("");
    expect(normalizeArabic(null)).toBe("");
  });
});

describe("toLatinDigits", () => {
  it("يحوّل الأرقام العربية والفارسية", () => {
    expect(toLatinDigits("٨٧")).toBe("87");
    expect(toLatinDigits("۴۵")).toBe("45");
  });

  it("يحوّل الفاصلة العشرية العربية", () => {
    expect(toLatinDigits("٨٧٫٥")).toBe("87.5");
  });
});

describe("parsePercentValue", () => {
  it("يقرأ النسبة مع علامة صريحة", () => {
    const r = parsePercentValue("87%");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parsed.value).toBe(87);
      expect(r.parsed.explicitSign).toBe(true);
    }
  });

  it("يقرأ نسبة بأرقام عربية وعلامة عربية", () => {
    const r = parsePercentValue("٩٢٫٥٪");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.parsed.value).toBe(92.5);
  });

  it("يقرأ عددًا صحيحًا بلا علامة نسبة", () => {
    const r = parsePercentValue(74);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parsed.value).toBe(74);
      expect(r.parsed.explicitSign).toBe(false);
    }
  });

  it("يرفض القيمة الكسرية بلا علامة نسبة بدل ضربها في مئة", () => {
    // 0.87 قد تكون وزنًا لا نسبة — لا يجوز افتراض أنها 87%
    const r = parsePercentValue("0.87");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("كسرية");
  });

  it("يقبل الكسرية إن وردت مع علامة نسبة صريحة", () => {
    const r = parsePercentValue("0.87%");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.parsed.value).toBe(0.87);
  });

  it("يرفض القيم خارج المجال والسالبة", () => {
    expect(parsePercentValue("150%").ok).toBe(false);
    expect(parsePercentValue("-5").ok).toBe(false);
  });

  it("يرفض النص بلا أرقام والفارغ", () => {
    expect(parsePercentValue("غير متوفر").ok).toBe(false);
    expect(parsePercentValue("").ok).toBe(false);
    expect(parsePercentValue(null).ok).toBe(false);
  });

  it("لا يعيد صفرًا كبديل عن قيمة مفقودة", () => {
    expect(parsePercentValue("لا يوجد").ok).toBe(false);
  });
});

describe("parseIntegerValue", () => {
  it("يقرأ الأعداد الصحيحة بالطرق المختلفة", () => {
    expect(parseIntegerValue("453")).toBe(453);
    expect(parseIntegerValue("١٢٣")).toBe(123);
    expect(parseIntegerValue("1,204")).toBe(1204);
  });

  it("يرفض الصفر والسالب والنص", () => {
    expect(parseIntegerValue("0")).toBeNull();
    expect(parseIntegerValue("-3")).toBeNull();
    expect(parseIntegerValue("كثير")).toBeNull();
  });
});

describe("findIndicatorCode", () => {
  it("يقرأ رمز المؤشر مع نص ملتصق به", () => {
    expect(findIndicatorCode("المؤشر 4-2-1-3")).toBe("4-2-1-3");
  });

  it("يرفض الرمز خارج النطاق المسموح", () => {
    expect(findIndicatorCode("5-1-1-1")).toBeNull();
    expect(findIndicatorCode("1-9-1-1")).toBeNull();
    expect(findIndicatorCode("نص بلا رمز")).toBeNull();
  });
});

describe("التنسيق للعرض", () => {
  it("يعرض غير المتوفر بدل صفر", () => {
    expect(formatPercent(null)).toBe("غير متوفر");
    expect(formatPercent(undefined)).toBe("غير متوفر");
    expect(formatInteger(null)).toBe("غير متوفر");
  });

  it("يزيل الأصفار الزائدة", () => {
    expect(formatPercent(87)).toBe("87%");
    expect(formatPercent(87.5)).toBe("87.5%");
  });
});