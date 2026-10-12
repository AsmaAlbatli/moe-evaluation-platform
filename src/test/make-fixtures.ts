import { writeFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

/**
 * توليد ملفات اختبار اصطناعية (بلا بيانات مدارس حقيقية) داخل .tmp-fixtures
 * لاختبار الرفع والاستخراج فعليًا عبر واجهة API.
 */

const OUT = join(import.meta.dirname, "..", "..", ".tmp-fixtures");
writeFileSync(join(OUT, ".keep"), "");

/* ---------------- 1) ملف Excel ---------------- */

const wb = XLSX.utils.book_new();

XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([
    ["البيان", "القيمة"],
    ["اسم المدرسة", "مدرسة النموذج التجريبية"],
    ["الرقم الوزاري", "98765"],
    ["المرحلة الدراسية", "الابتدائية"],
    ["العام الدراسي", "1447/1448"],
    ["إدارة التعليم", "الإدارة العامة للتعليم بمنطقة النموذج"],
    ["نوع المدرسة", "حكومية"],
    ["مديرة المدرسة", "أ. نموذج"],
    ["عدد الطلبة", "512"],
    ["عدد المعلمين", "41"],
    ["النسبة العامة", "84.5%"],
  ]),
  "بيانات المدرسة",
);

XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([
    ["رمز المؤشر", "نص المؤشر", "النسبة", "المستوى"],
    ["1-1-1-1", "تضع المدرسة خطة تشغيلية شاملة", "88%", ""],
    ["1-1-1-2", "تتابع المدرسة تنفيذ خطتها التشغيلية", "82%", ""],
    ["1-2-1-1", "تعزز المدرسة القيم الإسلامية والهوية الوطنية", "76%", ""],
    ["1-2-1-3", "تطبق إجراءات محددة لدعم الانضباط", "48%", "التهيئة"],
    ["1-3-1-2", "تعزز مشاركة الأسرة", "91%", ""],
    ["1-4-1-4", "تنفذ خطة التحسين بناء على نتائج التقويم", "69%", ""],
    ["2-1-1-1", "توفر فرص متكافئة للتعلم", "85%", ""],
    ["2-1-1-7", "تنمي مهارات التفكير العليا", "73%", ""],
    ["2-2-1-3", "تحلل نتائج التقويم وتوظفها", "58%", ""],
    ["3-1-1-2", "نتائج مرتفعة في الرياضيات", "0.92", ""],
    ["3-2-1-3", "التزام بالممارسات الصحية", "80%", ""],
    ["4-2-1-2", "تتابع صيانة المبنى", "64%", ""],
  ]),
  "نتائج المؤشرات",
);

XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([
    ["المجال", "النسبة"],
    ["الإدارة المدرسية", "79.0%"],
    ["التعليم والتعلم", "72.0%"],
    ["نواتج التعلم", "80.0%"],
    ["البيئة المدرسية", "64.0%"],
  ]),
  "ملخص المجالات",
);

writeFileSync(
  join(OUT, "تقرير-نموذج-تجريبي.xlsx"),
  XLSX.write(wb, { type: "buffer", bookType: "xlsx" }),
);

/* ---------------- 2) ملف PDF نصي ---------------- */

/** يبني PDF بسيطًا بخط Helvetica (لاتيني) — للاختبار فقط. */
function buildPdf(lines: string[]): Buffer {
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const content = lines.map((line, i) => `BT /F1 11 Tf 55 ${755 - i * 19} Td (${escape(line)}) Tj ET`);

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.join("\n").length + 1} >>\nstream\n${content.join("\n")}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${off.toString().padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

const pdfLines = [
  "School Name: Prototype Test Primary School",
  "1-1-1-1",
  "Sets a comprehensive operational plan",
  "88%",
  "1-2-1-3",
  "Applies specific procedures to support discipline",
  "48",
  "2-1-1-1",
  "Provides equal learning opportunities",
  "85%",
  "3-1-1-2",
  "High results in Mathematics",
  "77%",
  "4-2-1-2",
  "Follows up periodic maintenance",
  "64%",
];

writeFileSync(join(OUT, "report-prototype-test.pdf"), buildPdf(pdfLines));

console.log("تم إنشاء ملفات الاختبار في:", OUT);