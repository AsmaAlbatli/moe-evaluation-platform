import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { extractFromWorkbook, formatCellValue, rowsFromWorkbook } from "./excel";
import { toColumnLetter } from "./rows";

/**
 * بيانات اختبار اصطناعية بالكامل — لا تُستخدم أي بيانات مدرسية حقيقية.
 */

type Row = (string | number)[];

function makeWorkbook(rowsBySheet: Record<string, Row[]>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(rowsBySheet)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(out);
}

describe("formatCellValue", () => {
  it("يزيل الأصفار الزائدة من الأعداد العشرية", () => {
    expect(formatCellValue({ v: 87.5, t: "n" } as never)).toBe("87.5");
    expect(formatCellValue({ v: 87, t: "n" } as never)).toBe("87");
  });

  it("يترجم القيم المنطقية والتواريخ", () => {
    expect(formatCellValue({ v: true, t: "b" } as never)).toBe("نعم");
    expect(formatCellValue({ v: false, t: "b" } as never)).toBe("لا");
    expect(formatCellValue({ v: new Date("2025-03-01"), t: "d" } as never)).toBe("2025-03-01");
  });

  it("يعيد نصًا فارغًا للقيم الفارغة", () => {
    expect(formatCellValue({ v: null, t: "z" } as never)).toBe("");
    expect(formatCellValue({ v: undefined, t: "z" } as never)).toBe("");
  });
});

describe("rowsFromWorkbook", () => {
  it("يقرأ كل الأوراق ويحدد إحداثيات الخلايا", () => {
    const buffer = makeWorkbook({
      "النتائج": [
        ["رمز المؤشر", "نص المؤشر", "النسبة"],
        ["1-1-1-1", "تضع المدرسة خطة تشغيلية", 87],
      ],
    });
    const meta = rowsFromWorkbook(buffer);
    expect(meta.sheetNames).toEqual(["النتائج"]);
    expect(meta.sheetRowCounts["النتائج"]).toBe(2);

    const second = meta.rows.find((r) => r.cells[0] === "1-1-1-1")!;
    expect(second.ref.sheet).toBe("النتائج");
    expect(second.cellRefs![0].cell).toBe("A2");
    expect(second.cellRefs![2].cell).toBe("C2");
  });

  it("يتخطى الصفوف الفارغة تمامًا", () => {
    const buffer = makeWorkbook({ "أوراق": [["", "", ""], ["نص"]] });
    expect(rowsFromWorkbook(buffer).rows).toHaveLength(1);
  });
});

describe("extractFromWorkbook — استخراج كامل من ملف Excel", () => {
  it("يستخرج بيانات المدرسة ومؤشراتها كما وردت", () => {
    const buffer = makeWorkbook({
      "بيانات المدرسة": [
        ["البيان", "القيمة"],
        ["اسم المدرسة", "مدرسة الاختبار الابتدائية"],
        ["الرقم الوزاري", "12345"],
        ["المرحلة الدراسية", "الابتدائية"],
        ["عدد الطلبة", "453"],
        ["عدد المعلمين", "38"],
        ["مديرة المدرسة", "أ. سارة"],
        ["النسبة العامة", "87.5%"],
      ],
      "نتائج المؤشرات": [
        ["رمز المؤشر", "نص المؤشر", "النسبة", "المستوى"],
        ["1-1-1-1", "تضع المدرسة خطة تشغيلية شاملة", "87%", ""],
        ["1-1-1-2", "تتابع المدرسة تنفيذ خطتها التشغيلية", "92%", ""],
        ["1-2-1-1", "تعزز المدرسة القيم الإسلامية", "45%", "التهيئة"],
        ["3-1-1-2", "نتائج مرتفعة في الرياضيات", "78.5%", ""],
      ],
    });

    const { result, meta } = extractFromWorkbook(buffer);

    expect(meta.sheetNames).toEqual(["بيانات المدرسة", "نتائج المؤشرات"]);
    expect(result.school.name.value).toBe("مدرسة الاختبار الابتدائية");
    expect(result.school.ministryNo.value).toBe("12345");
    expect(result.school.stage.value).toBe("الابتدائية");
    expect(result.school.studentsCount.value).toBe(453);
    expect(result.school.teachersCount.value).toBe(38);
    expect(result.school.principalName.value).toBe("أ. سارة");
    expect(result.school.overallPercent.value).toBe(87.5);

    expect(result.indicators.get("1-1-1-1")?.value).toBe(87);
    expect(result.indicators.get("1-1-1-2")?.value).toBe(92);
    expect(result.indicators.get("1-2-1-1")?.value).toBe(45);
    expect(result.indicators.get("1-2-1-1")?.level).toBe("tahyea");
    expect(result.indicators.get("3-1-1-2")?.value).toBe(78.5);

    // المؤشر الذي لم يرد له يُترك فارغًا
    expect(result.indicators.has("4-2-1-1")).toBe(false);
  });

  it("يحفظ مرجع الخلية لكل نتيجة", () => {
    const buffer = makeWorkbook({
      "النتائج": [["1-1-1-1", "نص", "87%"]],
    });
    const { result } = extractFromWorkbook(buffer);
    expect(result.indicators.get("1-1-1-1")?.ref.cell).toBe("C1");
    expect(result.indicators.get("1-1-1-1")?.ref.sheet).toBe("النتائج");
  });

  it("يتحمل ملفًا بلا نتائج ويكشف ذلك في الجودة", () => {
    const buffer = makeWorkbook({
      "مقدمة": [["هذه صفحة تمهيدية بلا نتائج"]],
    });
    const { result } = extractFromWorkbook(buffer);
    expect(result.indicators.size).toBe(0);
  });

  it("يكشف القيمة الكسرية الملتبسة بدل ضربها في مئة", () => {
    const buffer = makeWorkbook({
      "النتائج": [["1-1-1-1", "نص", "0.87"]],
    });
    const { result } = extractFromWorkbook(buffer);
    expect(result.indicators.get("1-1-1-1")?.value).toBeNull();
    expect(result.warnings.some((w) => w.type === "fraction-value")).toBe(true);
  });
});

describe("toColumnLetter عبر حدود صحيحة", () => {
  it("يعيد أسماء أعمدة صحيحة", () => {
    expect(toColumnLetter(52)).toBe("AZ");
    expect(toColumnLetter(53)).toBe("BA");
  });
});