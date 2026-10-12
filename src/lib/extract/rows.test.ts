import { describe, expect, it } from "vitest";
import {
  assessExtractionQuality,
  excelCellRef,
  findCriterionCode,
  findDomainId,
  findReportedLevel,
  harvestRows,
  pdfPageRef,
  toColumnLetter,
  type RawRow,
} from "./rows";

/**
 * بيانات اختبار اصطناعية بالكامل.
 * لا تُستخدم أي بيانات مدرسية حقيقية في الاختبارات.
 */

const row = (cells: string[], page = 1, sheet?: string): RawRow => ({
  cells,
  ref: sheet ? excelCellRef(sheet, 1, 1) : pdfPageRef(page),
  cellRefs: cells.map((_, i) => (sheet ? excelCellRef(sheet, 1, i + 1) : pdfPageRef(page))),
});

describe("toColumnLetter", () => {
  it("يحوّل أرقام الأعمدة إلى أحرف", () => {
    expect(toColumnLetter(1)).toBe("A");
    expect(toColumnLetter(4)).toBe("D");
    expect(toColumnLetter(26)).toBe("Z");
    expect(toColumnLetter(27)).toBe("AA");
  });
});

describe("استخراج بيانات المدرسة", () => {
  it("يقرأ الحقول من صفوف «التسمية | القيمة»", () => {
    const r = harvestRows([
      row(["اسم المدرسة", "مدرسة الأندلس الابتدائية"]),
      row(["الرقم الوزاري", "١٢٣٤٥"]),
      row(["المرحلة الدراسية", "الابتدائية"]),
      row(["عدد الطلبة", "453"]),
      row(["عدد المعلمين", "38"]),
      row(["مديرة المدرسة", "أ. سارة"]),
      row(["النسبة العامة", "٨٧٫٥٪"]),
    ]);

    expect(r.school.name.value).toBe("مدرسة الأندلس الابتدائية");
    expect(r.school.ministryNo.value).toBe("١٢٣٤٥");
    expect(r.school.stage.value).toBe("الابتدائية");
    expect(r.school.studentsCount.value).toBe(453);
    expect(r.school.teachersCount.value).toBe(38);
    expect(r.school.principalName.value).toBe("أ. سارة");
    expect(r.school.overallPercent.value).toBe(87.5);
  });

  it("يسجّل مرجع المصدر لكل حقل", () => {
    const r = harvestRows([row(["اسم المدرسة", "مدرسة الاختبار"], 3)]);
    expect(r.school.name.source.page).toBe(3);
  });

  it("يترك الحقول غير الموجودة null ولا يضع أصفارًا", () => {
    const r = harvestRows([row(["اسم المدرسة", "مدرسة الاختبار"])]);
    expect(r.school.studentsCount.value).toBeNull();
    expect(r.school.studentsCount.found).toBe(false);
    expect(r.school.overallPercent.value).toBeNull();
  });

  it("يقرأ الحقل من صيغة «التسمية: القيمة» داخل خلية واحدة", () => {
    const r = harvestRows([row(["اسم المدرسة: مدرسة الفاروق الابتدائية بنات"])]);
    expect(r.school.name.value).toBe("مدرسة الفاروق الابتدائية بنات");
  });
});

describe("استخراج نتائج المؤشرات", () => {
  it("يقرأ رمز المؤشر ونسبته من صف Excel", () => {
    const r = harvestRows([row(["1-1-1-1", "تضع المدرسة خطة تشغيلية شاملة", "87%"], 0, "النتائج")]);
    const hit = r.indicators.get("1-1-1-1");
    expect(hit).toBeDefined();
    expect(hit!.value).toBe(87);
    expect(hit!.explicitSign).toBe(true);
    expect(hit!.ref.sheet).toBe("النتائج");
    expect(hit!.ref.cell).toBe("C1");
  });

  it("يتجاهل الرمز غير الموجود في الكتالوج ويُحذّر", () => {
    // 3-4 صيغة صالحة لكنها ليست معيارًا معتمدًا في كتالوج المجال الثالث
    const r = harvestRows([row(["3-4-1-1", "رمز غير معروف", "50%"])]);
    expect(r.indicators.size).toBe(0);
    expect(r.warnings.some((w) => w.type === "unmatched-code")).toBe(true);
  });

  it("لا يحوّل الكسرية إلى نسبة ويحذّر", () => {
    const r = harvestRows([row(["1-1-1-2", "نص", "0.87"])]);
    const hit = r.indicators.get("1-1-1-2");
    expect(hit!.value).toBeNull();
    expect(hit!.valueIssue).toContain("كسرية");
    expect(r.warnings.some((w) => w.type === "fraction-value")).toBe(true);
  });

  it("يسجّل تحذيرًا عند غياب علامة النسبة الصريحة", () => {
    const r = harvestRows([row(["2-1-1-1", "نص", "77"])]);
    expect(r.warnings.some((w) => w.type === "no-percent-sign")).toBe(true);
  });

  it("يكتشف التعارض في قيمة المؤشر نفسه ويحافظ على الأولى", () => {
    const r = harvestRows([
      row(["1-1-1-1", "نص", "87%"], 2),
      row(["1-1-1-1", "نص", "62%"], 5),
    ]);
    expect(r.indicators.get("1-1-1-1")!.value).toBe(87);
    expect(r.warnings.some((w) => w.type === "conflict")).toBe(true);
  });

  it("لا يكرر المؤشر عند تكرار الصف بالقيمة نفسها", () => {
    const r = harvestRows([
      row(["1-1-1-1", "نص", "87%"], 2),
      row(["1-1-1-1", "نص", "87%"], 9),
    ]);
    expect(r.indicators.size).toBe(1);
    expect(r.warnings.filter((w) => w.type === "conflict")).toHaveLength(0);
  });
});

describe("استخراج مستوى الأداء من التقرير", () => {
  it("يقرأ كلمة المستوى وحدها", () => {
    expect(findReportedLevel("التهيئة")).toBe("tahyea");
    expect(findReportedLevel("الانطلاق")).toBe("intilaq");
    expect(findReportedLevel("التقدم")).toBe("taqaddum");
    expect(findReportedLevel("التميز")).toBe("tamayyuz");
  });

  it("يقرأ من الوصف «بدرجة متميزة»", () => {
    expect(findReportedLevel("تشير النتائج إلى أن المؤشر تحقق بدرجة متميزة")).toBe("tamayyuz");
    expect(findReportedLevel(" achieved بدرجة متقدمة")).toBe("taqaddum");
    expect(findReportedLevel("بدرجة متوسطة")).toBe("intilaq");
    expect(findReportedLevel("بدرجة ضعيفة")).toBe("tahyea");
  });

  it("يقرأ من «مستوى الأداء: التميز»", () => {
    expect(findReportedLevel("مستوى الأداء: التميز")).toBe("tamayyuz");
  });

  it("لا يلتقط كلمة «التميز» العابرة داخل نص طويل", () => {
    const advice =
      "الاستمرار في تطوير خطتها التشغيلية بما يضمن استدامة التميز فيها، وإشراك الكادر التعليمي في تطويرها.";
    expect(findReportedLevel(advice)).toBeNull();
  });

  it("لا ينسب مستوى لمؤشر نصّه يحوي الترقيم فقط", () => {
    const r = harvestRows([
      row([
        "1-1-1-1",
        "تضع المدرسة خطة تشغيلية شاملة وفق أهداف تطويرية محددة.",
        "الاستمرار في تطوير خطتها التشغيلية بما يضمن استدامة التميز فيها، وإشراك الكادر التعليمي.",
        "92%",
      ]),
    ]);
    const hit = r.indicators.get("1-1-1-1")!;
    expect(hit.value).toBe(92);
    expect(hit.level).toBeNull();
  });

  it("يربط المستوى الوارد في التقرير بالنسبة", () => {
    const r = harvestRows([row(["2-1-1-1", "نص المؤشر", "مستوى الانطلاق"])]);
    expect(r.indicators.get("2-1-1-1")!.level).toBe("intilaq");
  });
});

describe("استخراج نسب المعايير والمجالات", () => {
  it("يعرف المجال من اسمه", () => {
    expect(findDomainId("الإدارة المدرسية")).toBe(1);
    expect(findDomainId("التعليم والتعلم")).toBe(2);
    expect(findDomainId("نواتج التعلم")).toBe(3);
    expect(findDomainId("البيئة المدرسية")).toBe(4);
    expect(findDomainId("مجال غير معروف")).toBeNull();
  });

  it("يعرف المعيار من الرمز أو الاسم", () => {
    expect(findCriterionCode("1-2")).toBe("1-2");
    expect(findCriterionCode("قيادة العملية التعليمية")).toBe("1-2");
    expect(findCriterionCode("بناء خبرات التعلم")).toBe("2-1");
  });

  it("يستخرج نسبة المجال كما وردت", () => {
    const r = harvestRows([row(["نواتج التعلم", "78.5%"])]);
    expect(r.domains.get(3)?.value).toBe(78.5);
  });

  it("لا يخلط رمز المعيار برمز المؤشر", () => {
    expect(findCriterionCode("1-2-1-3")).toBeNull();
  });
});

describe("جودة الاستخراج", () => {
  it("جيدة عند نتائج سليمة بلا تحذيرات", () => {
    const r = harvestRows([row(["1-1-1-1", "نص", "87%"])]);
    expect(assessExtractionQuality(r).quality).toBe("good");
  });

  it("ضعيفة عند وجود تعارض", () => {
    const r = harvestRows([
      row(["1-1-1-1", "نص", "87%"], 1),
      row(["1-1-1-1", "نص", "12%"], 2),
    ]);
    expect(assessExtractionQuality(r).quality).toBe("weak");
  });

  it("ضعيفة جدًا عند عدم تعرّف أي مؤشر", () => {
    const r = harvestRows([row(["بعض النص العام"]), row(["نص آخر"])]);
    const q = assessExtractionQuality(r);
    expect(q.quality).toBe("poor");
    expect(q.reasons.join(" ")).toContain("لم يُتعرَّف");
  });
});

describe("الأسطر غير المطابقة", () => {
  it("تسجّل السطور التي لا تُربط بنتيجة", () => {
    const r = harvestRows([row(["فقرة تمهيدية لا تحتوي نتائج"])]);
    expect(r.unmatched.length).toBeGreaterThan(0);
    expect(r.unmatched[0].ref.label).toContain("صفحة");
  });
});