import { describe, expect, it } from "vitest";
import {
  groupItemsIntoLines,
  harvestOcrText,
  MIN_CHARS_PER_PAGE,
  ocrPagesToRows,
  pageLinesToRows,
} from "./pdf";
import { harvestRows, type RawRow } from "./rows";

/** بيانات اختبار اصطناعية بالكامل — لا تُستخدم أي بيانات مدرسية حقيقية. */

function harvestCode(rows: RawRow[], code: string) {
  return harvestRows(rows).indicators.get(code)!;
}

describe("groupItemsIntoLines", () => {
  it("يجمع العناصر التي تشترك في نفس الإحداثي الرأسي", () => {
    const lines = groupItemsIntoLines([
      { str: "87%", x: 500, y: 100 },
      { str: "1-1-1-1", x: 100, y: 100 },
      { str: "المؤشر الثاني", x: 100, y: 80 },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("1-1-1-1");
    expect(lines[0]).toContain("87%");
  });

  it("يتجاهل الفراغات ويضغط المسافات", () => {
    expect(groupItemsIntoLines([{ str: "  نص   طويل ", x: 0, y: 10 }])).toEqual(["نص طويل"]);
  });

  it("يتعامل مع صفحة بلا عناصر", () => {
    expect(groupItemsIntoLines([])).toEqual([]);
  });
});

describe("pageLinesToRows", () => {
  const pages = [
    {
      page: 4,
      lines: [
        "اسم المدرسة: مدرسة الاختبار الابتدائية",
        "1-1-1-1",
        "تضع المدرسة خطة تشغيلية شاملة وفق أهداف تطويرية محددة.",
        "تشير النتائج إلى أن المؤشر تحقق بدرجة متميزة.",
        "نص لا علاقة له بالمؤشر",
      ],
    },
  ];

  it("يضم أسطر السياق التالية لسطر الرمز", () => {
    const rows = pageLinesToRows(pages);
    const contextRow = rows.find((r) => r.cells[0] === "1-1-1-1")!;
    // النافذة تغطي نص المؤشر وجملة المستوى
    expect(contextRow.cells).toHaveLength(4);
    expect(contextRow.cells[2]).toContain("بدرجة متميزة");
  });

  it("يتوقف عند رمز المؤشر التالي حتى لا تُنسب نتيجة غيره", () => {
    const rows = pageLinesToRows([
      {
        page: 1,
        lines: [
          "1-1-1-1",
          "نص المؤشر الأول",
          "1-2-1-1",
          "نص المؤشر الثاني",
          "99%",
        ],
      },
    ]);
    const first = rows.find((r) => r.cells[0] === "1-1-1-1")!;
    expect(first.cells.some((c) => c.includes("99%"))).toBe(false);
  });

  it("يسجّل رقم الصفحة مرجعًا لكل صف", () => {
    for (const r of pageLinesToRows(pages)) {
      expect(r.ref.page).toBe(4);
      expect(r.ref.label).toContain("صفحة 4");
    }
  });

  it("يتعامل مع نهاية الصفحة دون تجاوز المصفوفة", () => {
    const rows = pageLinesToRows([{ page: 1, lines: ["1-1-1-1"] }]);
    expect(rows[0].cells).toEqual(["1-1-1-1"]);
  });

  it("يتخطي الأسطر الفارغة", () => {
    const rows = pageLinesToRows([{ page: 1, lines: ["", "   ", "نص"] }]);
    expect(rows).toHaveLength(1);
  });
});

describe("استخراج من نصوص PDF — منطق خالص", () => {
  it("يستخرج المؤشر ونسبته ومستواه من أسطر صفحة", () => {
    const rows = pageLinesToRows([
      {
        page: 2,
        lines: [
          "1-1-1-1",
          "تضع المدرسة خطة تشغيلية شاملة وفق أهداف تطويرية محددة.",
          "تشير النتائج إلى أن المؤشر تحقق بدرجة متميزة.",
          "87%",
        ],
      },
    ]);
    const hit = harvestCode(rows, "1-1-1-1");
    expect(hit.value).toBe(87);
    expect(hit.level).toBe("tamayyuz");
  });

  it("لا يلتقط كلمة «التميز» من نص طويل ضمن السياق", () => {
    const rows = pageLinesToRows([
      {
        page: 2,
        lines: [
          "1-1-1-1",
          "تضع المدرسة خطة تشغيلية شاملة وفق أهداف تطويرية محددة.",
          "الاستمرار في تطوير خطتها بما يضمن استدامة التميز فيها، وإشراك الكادر التعليمي في تطويرها واتخاذ القرارات المتعلقة بها وهذا النص طويل جدًا ليع تجاوز الحد الأقصى لطول خلية المستوى المسموح بقراءة كلمة عابرة فيه.",
          "87%",
        ],
      },
    ]);
    const hit = harvestCode(rows, "1-1-1-1");
    expect(hit.value).toBe(87);
    expect(hit.level).toBeNull();
  });
});

describe("نصوص التحليل البصري (OCR)", () => {
  it("يحوّل نص كل صفحة إلى أسطر ويبني صفوفًا", () => {
    const rows = ocrPagesToRows([
      { page: 1, text: "اسم المدرسة\n\nمدرسة الاختبار\n1-1-1-1\n 87% " },
    ]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.cells[0] === "1-1-1-1")).toBe(true);
  });

  it("يستخرج النتائج من نص OCR مع التحذير عند غياب النتائج", () => {
    const result = harvestOcrText([
      {
        page: 1,
        text: [
          "1-1-1-1",
          "تضع المدرسة خطة تشغيلية شاملة وفق أهداف تطويرية محددة.",
          "تشير النتائج إلى أن المؤشر تحقق بدرجة متميزة",
          "87%",
        ].join("\n"),
      },
    ]);
    expect(result.indicators.get("1-1-1-1")?.value).toBe(87);
    expect(result.indicators.get("1-1-1-1")?.level).toBe("tamayyuz");
  });

  it("يعرض النتيجة ولا يخمّن شيئًا عند غيابها", () => {
    const result = harvestOcrText([{ page: 1, text: "صفحة بلا أي نتائج واضحة إطلاقًا" }]);
    expect(result.indicators.size).toBe(0);
    expect(result.school.name.value).toBeNull();
  });
});

describe("حد التمييز بين ملف نصي وملف ممسوح ضوئيًا", () => {
  it("الحد الأدنى موجب ومعقول", () => {
    expect(MIN_CHARS_PER_PAGE).toBeGreaterThan(0);
  });
});