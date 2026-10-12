import { describe, expect, it } from "vitest";
import { buildIndicators, type IndicatorInput } from "@/lib/analysis/compute";
import { pdfPageRef } from "@/lib/extract/rows";
import { DEFAULT_LEVEL_THRESHOLDS, type LevelThresholds } from "@/lib/domain/levels";
import { buildRecommendation, DEFAULT_RULES, proposeTarget } from "./rules";

const thresholds = DEFAULT_LEVEL_THRESHOLDS;

const VALID_THRESHOLDS: LevelThresholds = {
  enabled: true,
  referenceName: "مرجع التقويم المدرسي المعتمد",
  referenceEdition: "الإصدار الثالث",
  referenceUrl: "",
  notes: "",
  min: { tahyea: 0, intilaq: 50, taqaddum: 75, tamayyuz: 90 },
};

function indicator(code: string, value: number | null, level: "tahyea" | "intilaq" | "taqaddum" | "tamayyuz" | null = null) {
  const inputs: IndicatorInput[] = [{ code, value, level, ref: pdfPageRef(7), rawText: `نص المؤشر ${code}` }];
  const all = buildIndicators(inputs, { thresholds });
  return all.find((i) => i.code === code)!;
}

describe("proposeTarget — المستهدف مقترح لا نتيجة", () => {
  it("لا يقترح رقمًا بلا خط أساس", () => {
    const t = proposeTarget(null, null, thresholds, DEFAULT_RULES);
    expect(t.value).toBeNull();
    expect(t.rationale).toContain("خط أساس");
  });

  it("لا يفترض تجاوز 100% عند غياب الحدود المعتمدة", () => {
    const t = proposeTarget(100, "tamayyuz", thresholds, DEFAULT_RULES);
    expect(t.value).toBeLessThanOrEqual(DEFAULT_RULES.maxSuggestedTarget);
    expect(t.rationale).toContain("استدامة");
  });

  it("لا يقترح رفعًا فوق خط الأساس في مستوى التميز", () => {
    const t = proposeTarget(97, "tamayyuz", thresholds, DEFAULT_RULES);
    expect(t.value).toBe(97);
    expect(t.rationale).toContain("استدامة");
  });

  it("يقترح زيادة متحفظة من مستوى التهيئة عند غياب الحدود", () => {
    const t = proposeTarget(40, "tahyea", thresholds, DEFAULT_RULES);
    expect(t.value).toBe(60); // 40 + 20
    expect(t.rationale).toContain("مقترح ابتدائي");
  });

  it("يستخدم حد المستوى الأعلى عند اعتماد حدود مرجعية", () => {
    const t = proposeTarget(60, "intilaq", VALID_THRESHOLDS, DEFAULT_RULES);
    expect(t.value).toBe(75);
    expect(t.rationale).toContain("مرجع التقويم المدرسي المعتمد");
    expect(t.rationale).toContain("الإصدار الثالث");
  });

  it("لا يتجاوز الحد الأعلى المعتمد مهما كانت النسبة", () => {
    const t = proposeTarget(99, "tahyea", thresholds, { ...DEFAULT_RULES, maxSuggestedTarget: 95 });
    expect(t.value).toBe(95);
  });
});

describe("buildRecommendation", () => {
  it("يربط التوصية بمصدر المؤشر (رقم الصفحة)", () => {
    const rec = buildRecommendation(indicator("1-1-1-1", 87), { thresholds, rules: DEFAULT_RULES });
    expect(rec.evidenceRefs[0].page).toBe(7);
    expect(rec.baseline).toContain("87%");
    expect(rec.baseline).toContain("صفحة 7");
  });

  it("لا ينسب توصية لهيئة تقويم التعليم إلا إذا وردت في التقرير", () => {
    const withAdvice = buildRecommendation(indicator("1-1-1-1", 87), {
      thresholds,
      rules: DEFAULT_RULES,
      reportAdvice: { "1-1-1-1": "الاستمرار في تطوير الخطة التشغيلية." },
    });
    expect(withAdvice.actions.some((a) => a.includes("الاستمرار في تطوير الخطة"))).toBe(true);

    const withoutAdvice = buildRecommendation(indicator("2-1-1-1", 70), { thresholds, rules: DEFAULT_RULES });
    expect(withoutAdvice.actions.some((a) => a.includes("الاستمرار في تطوير الخطة"))).toBe(false);
  });

  it("يقترح القياس قبل المعالجة عندما لا توجد نسبة", () => {
    const rec = buildRecommendation(indicator("2-1-1-5", null), { thresholds, rules: DEFAULT_RULES });
    expect(rec.proposedTargetPercent).toBeNull();
    expect(rec.gap).toContain("لا يمكن تحديد الفجوة");
    expect(rec.actions[0]).toContain("أداة قياس");
  });

  it("يحسب الفجوة فقط مقابل المستهدف المقترح ويصف ذلك", () => {
    const rec = buildRecommendation(indicator("1-2-1-1", 45, "tahyea"), {
      thresholds,
      rules: DEFAULT_RULES,
    });
    expect(rec.gapValue).toBe(20);
    expect(rec.gap).toContain("نقطة مئوية");
    expect(rec.gap).toContain("لم يُعتمد بعد");
    expect(rec.gapBasis).toBe("proposed-target");
  });

  it("يعطي الأولوية في الإجراءات لأضعف حالة", () => {
    const rec = buildRecommendation(indicator("1-1-1-1", 25, "tahyea"), { thresholds, rules: DEFAULT_RULES });
    expect(rec.ruleId).toBe("level-tahyea");
  });

  it("يستخدم قاعدة الفئة عند غياب النسبة والمستوى", () => {
    const rec = buildRecommendation(indicator("3-2-1-4", null), { thresholds, rules: DEFAULT_RULES });
    expect(rec.ruleId).toBe("missing-measurement");
  });

  it("يتضمن كل الحقول المطلوبة في التوصية", () => {
    const rec = buildRecommendation(indicator("1-1-1-1", 70, "intilaq"), { thresholds, rules: DEFAULT_RULES });
    expect(rec.strengths.length).toBeGreaterThan(0);
    expect(rec.gap).toBeTruthy();
    expect(rec.target).toBeTruthy();
    expect(rec.actions.length).toBeGreaterThan(0);
    expect(rec.owner).toBeTruthy();
    expect(rec.duration).toBeTruthy();
    expect(rec.measure).toBeTruthy();
    expect(rec.baseline).toBeTruthy();
    expect(rec.tool).toBeTruthy();
    expect(rec.evidence.length).toBeGreaterThan(0);
    expect(rec.followUp).toBeTruthy();
    expect(rec.disclaimer).toContain("ليست بيانًا رسميًا");
  });

  it("لا يكرر الإجراءات", () => {
    const rec = buildRecommendation(indicator("2-1-1-4", 65, "intilaq"), { thresholds, rules: DEFAULT_RULES });
    expect(new Set(rec.actions).size).toBe(rec.actions.length);
  });

  it("يقترح إجراء قياس عندما تكون القواعد مفعّلة", () => {
    const rec = buildRecommendation(indicator("2-1-1-5", null), {
      thresholds,
      rules: { ...DEFAULT_RULES, proposeMeasurementWhenMissing: false },
    });
    expect(rec.actions.some((a) => a.includes("أداة قياس"))).toBe(false);
  });

  it("يحذف مقترح التقرير عند تعطيله من الإعدادات", () => {
    const rec = buildRecommendation(indicator("1-1-1-1", 87), {
      thresholds,
      rules: { ...DEFAULT_RULES, useReportAdvice: false },
      reportAdvice: { "1-1-1-1": "مقترح خاص بالمؤشر للاختبار." },
    });
    expect(rec.actions.some((a) => a.includes("مقترح خاص بالمؤشر"))).toBe(false);
  });
});