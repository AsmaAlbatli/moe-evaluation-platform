import { describe, expect, it } from "vitest";
import {
  canDeriveLevel,
  DEFAULT_LEVEL_THRESHOLDS,
  deriveLevelFromPercent,
  describeThresholds,
  LEVEL_META,
  resolveLevel,
  validateThresholds,
  type LevelThresholds,
} from "@/lib/domain/levels";

/** حدود صالحة للاختبار فقط — تُ-simulated كمرجع معتمد. */
const VALID: LevelThresholds = {
  enabled: true,
  referenceName: "مرجع اختباري",
  referenceEdition: "الإصدار ١",
  referenceUrl: "",
  notes: "",
  min: { tahyea: 0, intilaq: 50, taqaddum: 75, tamayyuz: 90 },
};

describe("الافتراضي: لا حدود رقمية", () => {
  it("الإعداد الافتراضي معطّل وبلا حدود", () => {
    expect(DEFAULT_LEVEL_THRESHOLDS.enabled).toBe(false);
    expect(DEFAULT_LEVEL_THRESHOLDS.min.tahyea).toBeNull();
    expect(DEFAULT_LEVEL_THRESHOLDS.min.tamayyuz).toBeNull();
  });

  it("لا يشتق أي مستوى عندما تكون الحدود غير معتمدة", () => {
    expect(canDeriveLevel(DEFAULT_LEVEL_THRESHOLDS)).toBe(false);
    expect(deriveLevelFromPercent(87, DEFAULT_LEVEL_THRESHOLDS)).toBeNull();
    expect(deriveLevelFromPercent(100, DEFAULT_LEVEL_THRESHOLDS)).toBeNull();
  });

  it("الوصف يوضّح التعطيل", () => {
    expect(describeThresholds(DEFAULT_LEVEL_THRESHOLDS)).toContain("غير مفعّلة");
  });
});

describe("التحقق من صحة الحدود المعتمدة", () => {
  it("يقبل حدودًا متتالية مع مرجع وإصدار", () => {
    expect(validateThresholds(VALID).valid).toBe(true);
  });

  it("يرفض الحدود بلا مرجع معتمد", () => {
    const r = validateThresholds({ ...VALID, referenceName: "  " });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("المرجع");
  });

  it("يرفض الحدود بلا إصدار", () => {
    const r = validateThresholds({ ...VALID, referenceEdition: "" });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("إصدار");
  });

  it("يرفض حدًا ناقصًا", () => {
    const r = validateThresholds({ ...VALID, min: { ...VALID.min, taqaddum: null } });
    expect(r.valid).toBe(false);
  });

  it("يرفض حدودًا غير متتالية", () => {
    const r = validateThresholds({
      ...VALID,
      min: { tahyea: 0, intilaq: 60, taqaddum: 50, tamayyuz: 90 },
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("متتالية");
  });

  it("يرفض حدودًا خارج المجال 0..100", () => {
    expect(validateThresholds({ ...VALID, min: { ...VALID.min, tamayyuz: 140 } }).valid).toBe(false);
    expect(validateThresholds({ ...VALID, min: { ...VALID.min, tahyea: -5 } }).valid).toBe(false);
  });
});

describe("اشتقاق المستوى من النسبة عند وجود حدود معتمدة", () => {
  it("يوزّع النسب على المستويات وفق الحدود", () => {
    expect(deriveLevelFromPercent(0, VALID)).toBe("tahyea");
    expect(deriveLevelFromPercent(49.9, VALID)).toBe("tahyea");
    expect(deriveLevelFromPercent(50, VALID)).toBe("intilaq");
    expect(deriveLevelFromPercent(74.9, VALID)).toBe("intilaq");
    expect(deriveLevelFromPercent(75, VALID)).toBe("taqaddum");
    expect(deriveLevelFromPercent(89.9, VALID)).toBe("taqaddum");
    expect(deriveLevelFromPercent(90, VALID)).toBe("tamayyuz");
    expect(deriveLevelFromPercent(100, VALID)).toBe("tamayyuz");
  });

  it("لا يشتق شيئًا من نسبة مفقودة", () => {
    expect(deriveLevelFromPercent(null, VALID)).toBeNull();
    expect(deriveLevelFromPercent(Number.NaN, VALID)).toBeNull();
  });
});

describe("resolveLevel — أولوية لما ورد في التقرير", () => {
  it("يعتمد المستوى الوارد في التقرير حتى لو خالفت النسبة الحد المعتمد", () => {
    const r = resolveLevel("tahyea", 95, VALID);
    expect(r.level).toBe("tahyea");
    expect(r.source).toBe("reported");
  });

  it("يشتق من النسبة عند غياب المستوى في التقرير", () => {
    const r = resolveLevel(null, 78, VALID);
    expect(r.level).toBe("taqaddum");
    expect(r.source).toBe("thresholds");
  });

  it("يعيد «غير متوفر» عند غياب النسبة والمستوى وعدم وجود حدود", () => {
    const r = resolveLevel(null, null, DEFAULT_LEVEL_THRESHOLDS);
    expect(r.level).toBeNull();
    expect(r.source).toBe("none");
  });
});

describe("التدرج اللوني المعتمد", () => {
  it("يربط كل مستوى بلونه المحدد في المواصفة", () => {
    expect(LEVEL_META.tahyea.color).toBe("#DC2626"); // أحمر
    expect(LEVEL_META.intilaq.color).toBe("#EA580C"); // برتقالي
    expect(LEVEL_META.taqaddum.color).toBe("#2563EB"); // أزرق
    expect(LEVEL_META.tamayyuz.color).toBe("#16A34A"); // أخضر
  });

  it("العناوين عربية", () => {
    expect(LEVEL_META.tahyea.label).toBe("التهيئة");
    expect(LEVEL_META.intilaq.label).toBe("الانطلاق");
    expect(LEVEL_META.taqaddum.label).toBe("التقدم");
    expect(LEVEL_META.tamayyuz.label).toBe("التميز");
  });

  it("الترتيب تصاعدي من التهيئة إلى التميز", () => {
    const orders = ["tahyea", "intilaq", "taqaddum", "tamayyuz"].map(
      (k) => LEVEL_META[k as keyof typeof LEVEL_META].order,
    );
    expect(orders).toEqual([0, 1, 2, 3]);
  });
});

describe("وصف الحدود", () => {
  it("يذكر المرجع والإصدار", () => {
    const d = describeThresholds(VALID);
    expect(d).toContain("مرجع اختباري");
    expect(d).toContain("الإصدار ١");
  });
});