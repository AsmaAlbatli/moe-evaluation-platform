import { describe, expect, it } from "vitest";
import { extractFromPdf, extractPdfText, MIN_CHARS_PER_PAGE } from "./pdf";

/**
 * اختبار تكاملي حقيقي: نبني ملف PDF صالحًا ونمرّره على محرك pdf.js
 * ثم على محرّك الاستخراج، للتحقق من أن المسار كاملًا يعمل فعلًا.
 * المحتوى اصطناعي بالكامل (لاتيني) لسببين:
 *  - ضمان ثبات النتيجة عبر بيئات التشغيل.
 *  - عدم استخدام أي بيانات مدرسية حقيقية في الاختبارات.
 */

/** يبني ملف PDF بسيطًا من سطور نصية باستخدام خط Helvetica القياسي. */
function buildPdf(lines: string[]): Uint8Array {
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const contentLines = lines.map((line, i) => `BT /F1 12 Tf 60 ${740 - i * 20} Td (${escape(line)}) Tj ET`);

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${contentLines.join("\n").length + 1} >>\nstream\n${contentLines.join("\n")}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${off.toString().padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

describe("قراءة ملف PDF حقيقي عبر pdf.js", () => {
  const lines = [
    "School Name: Test Primary School",
    "1-1-1-1",
    "Sets a comprehensive operational plan",
    "87%",
    "1-2-1-1",
    "Reinforces Islamic values",
    "45",
    "2-1-1-1",
    "Provides equal learning opportunities",
    "93%",
  ];

  it("يقرأ النص من الملف ويحفظ الأسطر", async () => {
    const text = await extractPdfText(buildPdf(lines));
    expect(text.pageCount).toBe(1);
    expect(text.totalChars).toBeGreaterThan(0);
    expect(text.pages[0].lines.length).toBeGreaterThan(0);
    expect(text.pages[0].lines.join(" ")).toContain("87%");
  });

  it("يستخرج المؤشرات ونسبها من الملف فعليًا", async () => {
    const result = await extractFromPdf(buildPdf(lines));

    expect(result.mode).toBe("text");
    expect(result.pageCount).toBe(1);
    expect(result.needsOcr).toBe(false);

    expect(result.result.indicators.get("1-1-1-1")?.value).toBe(87);
    expect(result.result.indicators.get("2-1-1-1")?.value).toBe(93);
    expect(result.result.indicators.get("1-2-1-1")?.value).toBe(45);
  });

  it("يحفظ رقم الصفحة مرجعًا لكل نتيجة مستخرجة", async () => {
    const result = await extractFromPdf(buildPdf(lines));
    const hit = result.result.indicators.get("1-1-1-1")!;
    expect(hit.ref.kind).toBe("pdf-page");
    expect(hit.ref.page).toBe(1);
    expect(hit.ref.label).toBe("صفحة 1");
  });

  it("لا يقرن القيمةكسرية بنسبة", async () => {
    const result = await extractFromPdf(buildPdf(["1-1-1-2", "Follows up the operational plan", "0.87"]));
    const hit = result.result.indicators.get("1-1-1-2")!;
    expect(hit.value).toBeNull();
    expect(hit.valueIssue).toBeTruthy();
  });

  it("يصف الملف ضعيف الاستخراج إذا كان خاليًا من النص", async () => {
    // صفحة فارغة تمامًا: صفر أحرف
    const result = await extractFromPdf(buildPdf([]));
    expect(result.totalChars).toBe(0);
    expect(result.needsOcr).toBe(true);
    expect(result.result.indicators.size).toBe(0);
  });

  it("حد التمييز مبني على عدد الصفحات", async () => {
    const result = await extractFromPdf(buildPdf(lines));
    expect(result.totalChars > result.pageCount * MIN_CHARS_PER_PAGE).toBe(true);
  });
});