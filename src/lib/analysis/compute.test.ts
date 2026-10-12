import { describe, expect, it } from "vitest";
import {
  buildDomainSummaries,
  buildIndicators,
  computeCoverage,
  computePlanCompletion,
  computePriorityIndicators,
  describeValues,
  round2,
  type IndicatorInput,
  type IndicatorResult,
} from "./compute";
import { DEFAULT_LEVEL_THRESHOLDS, type LevelThresholds } from "@/lib/domain/levels";
import { pdfPageRef, excelCellRef } from "@/lib/extract/rows";
import { TOTAL_INDICATORS } from "@/lib/domain/catalog";

const thresholds = DEFAULT_LEVEL_THRESHOLDS;

const input = (code: string, value: number | null, level: IndicatorResult["level"] = null): IndicatorInput => ({
  code,
  value,
  level,
  ref: pdfPageRef(3),
  rawText: `المؤشر ${code}`,
});

function summarize(indicators: IndicatorResult[]) {
  return buildDomainSummaries({
    indicators,
    reportedDomains: new Map(),
    reportedCriteria: new Map(),
    thresholds,
  });
}

describe("buildIndicators", () => {
  it("يبني القائمة الكاملة لكل مؤشرات الكتالوج", () => {
    const all = buildIndicators([], { thresholds });
    expect(all).toHaveLength(TOTAL_INDICATORS);
    expect(TOTAL_INDICATORS).toBe(46);
  });

  it("المؤشر غير الوارد يبقى null وليس صفرًا", () => {
    const all = buildIndicators([input("1-1-1-1", 87)], { thresholds });
    const missing = all.find((i) => i.code === "2-1-1-5")!;
    expect(missing.percent).toBeNull();
    expect(missing.presentInFile).toBe(false);
    expect(missing.percentSource).toBe("absent");
  });

  it("يوسم النسبة المستخرجة ب مصدرها", () => {
    const all = buildIndicators([input("1-1-1-1", 87)], { thresholds });
    const found = all.find((i) => i.code === "1-1-1-1")!;
    expect(found.percent).toBe(87);
    expect(found.percentSource).toBe("extracted");
    expect(found.presentInFile).toBe(true);
  });

  it("يطبّق التعديل اليدوي ويوسمه بمصدر «إدخال يدوي»", () => {
    const manual = new Map([["1-1-1-1", { percent: 91.5, reviewed: true, notes: "مصحّح يدويًا" }]]);
    const all = buildIndicators([input("1-1-1-1", 87)], { thresholds, manual });
    const found = all.find((i) => i.code === "1-1-1-1")!;
    expect(found.percent).toBe(91.5);
    expect(found.percentSource).toBe("manual");
    expect(found.reviewed).toBe(true);
    expect(found.notes).toBe("مصحّح يدويًا");
  });

  it("لا يشتق أي مستوى ما لم تعتمد الإدارة حدودًا", () => {
    const all = buildIndicators([input("1-1-1-1", 96)], { thresholds });
    const found = all.find((i) => i.code === "1-1-1-1")!;
    expect(found.level).toBeNull();
    expect(found.levelSource).toBe("none");
  });

  it("يشتق المستوى عند اعتماد حدود صالحة", () => {
    const t: LevelThresholds = {
      enabled: true,
      referenceName: "مرجع اختباري",
      referenceEdition: "١",
      referenceUrl: "",
      notes: "",
      min: { tahyea: 0, intilaq: 50, taqaddum: 75, tamayyuz: 90 },
    };
    const all = buildIndicators([input("1-1-1-1", 96)], { thresholds: t });
    const found = all.find((i) => i.code === "1-1-1-1")!;
    expect(found.level).toBe("tamayyuz");
    expect(found.levelSource).toBe("thresholds");
  });

  it("يعتمد المستوى الوارد في التقرير ولا يشتق غيره", () => {
    const t: LevelThresholds = {
      ...DEFAULT_LEVEL_THRESHOLDS,
      enabled: true,
      referenceName: "مرجع",
      referenceEdition: "١",
      min: { tahyea: 0, intilaq: 50, taqaddum: 75, tamayyuz: 90 },
    };
    const all = buildIndicators([input("1-1-1-1", 96, "intilaq")], { thresholds: t });
    const found = all.find((i) => i.code === "1-1-1-1")!;
    expect(found.level).toBe("intilaq");
    expect(found.levelSource).toBe("reported");
  });
});

describe("describeValues", () => {
  it("يحسب المتوسط من المتاح فقط ولا يعدّ المفقود صفرًا", () => {
    const s = describeValues([80, 90, null, undefined]);
    expect(s.count).toBe(2);
    expect(s.average).toBe(85);
    expect(s.min).toBe(80);
    expect(s.max).toBe(90);
  });

  it("لا يعيد متوسطًا عند غياب كل القيم", () => {
    const s = describeValues([null, null]);
    expect(s.count).toBe(0);
    expect(s.average).toBeNull();
    expect(s.min).toBeNull();
  });

  it("يتجاهل القيم غير الرقمية", () => {
    expect(describeValues([Number.NaN, 50]).count).toBe(1);
  });
});

describe("round2", () => {
  it("يقرّب لخانتين عشريتين", () => {
    expect(round2(33.333333)).toBe(33.33);
    expect(round2(80)).toBe(80);
  });
});

describe("buildDomainSummaries", () => {
  const indicators = buildIndicators(
    [
      input("1-1-1-1", 80),
      input("1-1-1-2", 90),
      input("1-2-1-1", 60),
      input("2-1-1-1", 70),
    ],
    { thresholds },
  );

  it("يعطي أربعة مجالات بالترتيب", () => {
    const domains = summarize(indicators);
    expect(domains).toHaveLength(4);
    expect(domains.map((d) => d.name)).toEqual([
      "الإدارة المدرسية",
      "التعليم والتعلم",
      "نواتج التعلم",
      "البيئة المدرسية",
    ]);
  });

  it("يفضّل النسبة الرسمية الواردة في التقرير على المتوسط الحسابي", () => {
    const domains = buildDomainSummaries({
      indicators,
      reportedDomains: new Map([
        [1, { value: 77.25, ref: excelCellRef("النتائج", 5, 2) }],
      ]),
      reportedCriteria: new Map(),
      thresholds,
    });
    const d1 = domains.find((d) => d.id === 1)!;
    expect(d1.aggregate.reported).toBe(77.25);
    expect(d1.aggregate.display).toBe(77.25);
    expect(d1.aggregate.kind).toBe("reported");
    // المتوسط الحسابي يبقى محفوظًا للعلم لكنه ليس المعروض
    expect(d1.aggregate.computed).toBe(76.67);
  });

  it("يوسم المتوسط الحسابي استرشاديًا حين لا ترد النسبة الرسمية", () => {
    const domains = summarize(indicators);
    const d1 = domains.find((d) => d.id === 1)!;
    expect(d1.aggregate.reported).toBeNull();
    expect(d1.aggregate.kind).toBe("computed");
    expect(d1.aggregate.display).toBe(76.67);
  });

  it("لا يعيد قيمة لمجال بلا بيانات إطلاقًا", () => {
    const domains = summarize(indicators);
    const d4 = domains.find((d) => d.id === 4)!;
    expect(d4.aggregate.display).toBeNull();
    expect(d4.aggregate.kind).toBe("none");
    expect(d4.stats.count).toBe(0);
  });

  it("يعدّ المؤشرات في كل مستوى ويفصل غير المتوفر", () => {
    const withLevels = buildIndicators(
      [input("1-1-1-1", 20, "tahyea"), input("1-1-1-2", 80, "taqaddum")],
      { thresholds },
    );
    const domains = summarize(withLevels);
    const d1 = domains.find((d) => d.id === 1)!;
    expect(d1.counts.tahyea).toBe(1);
    expect(d1.counts.taqaddum).toBe(1);
    // بقية مؤشرات المجال غير واردة في الملف
    expect(d1.counts.missing).toBe(d1.indicators.length - 2);
  });
});

describe("computePriorityIndicators", () => {
  it("يضع المؤشرات بلا نسبة في المقدمة لأنها بلا قياس", () => {
    const indicators = buildIndicators([input("1-1-1-1", 90)], { thresholds });
    const priorities = computePriorityIndicators(indicators, 5);
    expect(priorities[0].indicator.percent).toBeNull();
    expect(priorities[0].reason).toContain("لم ترد نسبة");
  });

  it("يرتّب تصاعديًا بالنسبة بين المتوفر", () => {
    const indicators = buildIndicators(
      [input("1-1-1-1", 90), input("1-1-1-2", 30), input("1-2-1-1", 60)],
      { thresholds },
    );
    // نضع النسب في كل مؤشر موجود فقط
    const withPercent = indicators.filter((i) => i.percent !== null);
    const priorities = computePriorityIndicators(withPercent, 3);
    const percents = priorities.map((p) => p.indicator.percent);
    expect(percents).toEqual([...percents].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });
});

describe("computeCoverage", () => {
  it("يحسب التغطية دون اعتبار المفقود صفرًا", () => {
    const indicators = buildIndicators([input("1-1-1-1", 87)], { thresholds });
    const c = computeCoverage(indicators);
    expect(c.total).toBe(TOTAL_INDICATORS);
    expect(c.withPercent).toBe(1);
    expect(c.percentComplete).toBe(2);
    expect(c.reviewedComplete).toBe(false);
  });
});

describe("computePlanCompletion", () => {
  it("يحسب نسبة الإنجاز بوزن متصاعد", () => {
    expect(
      computePlanCompletion([
        { status: "done" },
        { status: "in_progress" },
        { status: "not_started" },
        { status: "blocked" },
      ]),
    ).toBe(38);
  });

  it("يعيد صفرًا عند خلو القائمة", () => {
    expect(computePlanCompletion([])).toBe(0);
  });
});