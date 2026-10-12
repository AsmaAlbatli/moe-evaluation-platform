import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * اختبار انحدار: إعادة بناء التحليل من قاعدة البيانات يجب أن تحافظ على
 * تمييز مصدر كل نسبة:
 *  - «مستخرج من التقرير» لكل القيم التي استُخرجت من الملف ولم تُعدَّل.
 *  - «إدخال يدوي من المدرسة» للقيم التي عدّلتها المدرسة فقط.
 *
 * الخلل الذي يمنع هذا الاختبار (줄أ سابق):
 * كانت كل الصفوف تُمرَّر إلى خريطة `manual`، فيُعاد وسم جميع النسب
 * المستخرجة بأنها «إدخال يدوي».
 */

const rows: unknown[] = [];

vi.mock("@/lib/db", () => ({
  prisma: {
    indicatorResult: {
      findMany: () => Promise.resolve(rows),
    },
  },
  describeDbError: (e: unknown) => String(e),
}));

type StoredRow = {
  code: string;
  percent: number | null;
  percentSource: string;
  level: string | null;
  notes: string | null;
  reviewed: boolean;
  sourceLabel: string;
  sourcePage: number | null;
  sourceSheet: string | null;
  sourceCell: string | null;
  rawText: string;
  valueIssue: string | null;
};

function storedRow(overrides: Partial<StoredRow> & { code: string }): StoredRow {
  return {
    percent: 88,
    percentSource: "extracted",
    level: null,
    notes: null,
    reviewed: false,
    sourceLabel: "ورقة نتائج: H2",
    sourcePage: null,
    sourceSheet: "نتائج",
    sourceCell: "B2",
    rawText: "88%",
    valueIssue: null,
    ...overrides,
  };
}

async function loadIndicators() {
  const { loadAnalysisIndicators } = await import("./ingest");
  const { DEFAULT_LEVEL_THRESHOLDS } = await import("@/lib/domain/levels");
  return loadAnalysisIndicators("analysis-1", DEFAULT_LEVEL_THRESHOLDS);
}

beforeEach(() => {
  rows.length = 0;
});

describe("loadAnalysisIndicators — مصدر النسبة بعد إعادة البناء", () => {
  it("يبقي النسبة المستخرجة موسومة «مستخرج» ولا يحوّلها إلى إدخال يدوي", async () => {
    rows.push(storedRow({ code: "1-1-1-1", percent: 88, percentSource: "extracted" }));

    const indicators = await loadIndicators();
    const first = indicators.find((i) => i.code === "1-1-1-1")!;

    expect(first.percent).toBe(88);
    expect(first.percentSource).toBe("extracted");
    expect(first.percentSource).not.toBe("manual");
  });

  it("يحافظ على «إدخال يدوي» للنسبة التي عدّلتها المدرسة", async () => {
    rows.push(storedRow({ code: "1-1-1-2", percent: 91.5, percentSource: "manual" }));

    const indicators = await loadIndicators();
    const edited = indicators.find((i) => i.code === "1-1-1-2")!;

    expect(edited.percent).toBe(91.5);
    expect(edited.percentSource).toBe("manual");
  });

  it("اعتماد المراجعة وحده لا يحوّل القيمة المستخرجة إلى إدخال يدوي", async () => {
    rows.push(
      storedRow({
        code: "1-2-1-1",
        percent: 74,
        percentSource: "extracted",
        reviewed: true,
        notes: "تمت مراجعة النسبة واعتمادها كما وردت.",
      }),
    );

    const indicators = await loadIndicators();
    const reviewed = indicators.find((i) => i.code === "1-2-1-1")!;

    expect(reviewed.percentSource).toBe("extracted");
    expect(reviewed.reviewed).toBe(true);
    expect(reviewed.notes).toBe("تمت مراجعة النسبة واعتمادها كما وردت.");
  });

  it("المؤشر غير المخزَّن يبقى «غير متوفر» (null) وليس صفرًا ولا يدويًا", async () => {
    rows.push(storedRow({ code: "1-1-1-1", percent: 88, percentSource: "extracted" }));

    const indicators = await loadIndicators();
    const missing = indicators.find((i) => i.code === "4-2-1-3")!;

    expect(missing.percent).toBeNull();
    expect(missing.percentSource).toBe("absent");
    expect(missing.presentInFile).toBe(false);
  });

  it("يبني القائمة الكاملة (46 مؤشرًا) ويحافظ على مرجع المصدر", async () => {
    rows.push(storedRow({ code: "2-1-1-1", percent: 63, percentSource: "extracted" }));

    const indicators = await loadIndicators();
    expect(indicators).toHaveLength(46);

    const found = indicators.find((i) => i.code === "2-1-1-1")!;
    expect(found.source.kind).toBe("excel-cell");
    expect(found.source.sheet).toBe("نتائج");
    expect(found.source.cell).toBe("B2");
    expect(found.rawText).toBe("88%");
  });
});