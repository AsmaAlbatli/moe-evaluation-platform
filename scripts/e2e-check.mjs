import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

/**
 * اختبار شامل فعلي عبر واجهة HTTP:
 * رفع ملف Excel ← رفع ملف PDF ← قراءة التحليل ← تصدير Excel ← تصدير التقرير.
 * التشغيل:  node scripts/e2e-check.mjs [http://localhost:3111]
 */

const BASE = process.argv[2] ?? "http://localhost:3111";
const FIXTURES = join(import.meta.dirname, "..", ".tmp-fixtures");

const checks = [];
function check(name, ok, extra = "") {
  checks.push({ name, ok });
  console.log(`${ok ? "✔" : "✘"} ${name}${extra ? ` — ${extra}` : ""}`);
}

async function json(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function upload(fileName, kind, titleHint) {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(join(FIXTURES, fileName))]), fileName);
  form.append("kind", kind);
  if (titleHint) form.append("titleHint", titleHint);
  return json(`${BASE}/api/analyses/ingest`, { method: "POST", body: form });
}

function findFiles(dir) {
  return readdirSync(dir);
}

/**
 * يقرأ ورقة «تفاصيل المؤشرات» من ملف التصدير ويحصي وسم مصدر كل نسبة.
 * هذا هو الفحص الحاسم لقاعدة «عدم اختلاق البيانات»: لا يجوز أن تُوسم نسبة
 * مستخرجة من الملف بأنها «إدخال يدوي من المدرسة».
 */
async function readIndicatorSourceLabels(analysisId) {
  const res = await fetch(`${BASE}/api/analyses/${analysisId}/export/excel`);
  const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
  const sheetName = wb.SheetNames.find((n) => n.includes("تفاصيل المؤشرات"));
  if (!sheetName) return { extracted: 0, absent: 0, manualCodes: [] };

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false });
  const header = rows[0].map((h) => String(h ?? ""));
  const col = (...names) => header.findIndex((h) => names.some((n) => h.includes(n)));

  const codeCol = col("رمز المؤشر", "الرمز");
  const sourceCol = col("مصدر النسبة", "مصدر القيمة");
  if (sourceCol < 0) return { extracted: 0, absent: 0, manualCodes: [] };

  let extracted = 0;
  let absent = 0;
  const manualCodes = [];
  for (const row of rows.slice(1)) {
    const src = String(row[sourceCol] ?? "").trim();
    if (src.includes("مستخرج")) extracted += 1;
    else if (src.includes("غير متوفر") || src === "") absent += 1;
    else if (src.includes("إدخال يدوي")) manualCodes.push(String(row[codeCol] ?? "").trim());
  }
  return { extracted, absent, manualCodes };
}

/* ---------------------------------------------------------------- */

console.log(`\n=== فحص شامل على ${BASE} ===\n`);

const files = findFiles(FIXTURES);
const xlsxName = files.find((f) => f.endsWith(".xlsx"));
const pdfName = files.find((f) => f.endsWith(".pdf"));

if (!xlsxName || !pdfName) {
  console.error("لم تُوجد ملفات الاختبار. شغّل أولًا: npx vite-node src/test/make-fixtures.ts");
  process.exit(1);
}

/* 1) رفع ملف Excel */
console.log("— رفع ملف Excel —");
const excel = await upload(xlsxName, "external", "تحليل تجريبي — Excel");
check("رفع ملف Excel لم يُسجّل خطأ", excel.status === 200 && !excel.body.error, excel.body.error ?? "");
const excelId = excel.body.analysisId;

check("استُخرج عدد معقول من المؤشرات", (excel.body.indicatorCount ?? 0) >= 10, `${excel.body.indicatorCount} مؤشرًا`);
check("جودة الاستخراج جيدة", excel.body.quality === "good", excel.body.quality);
check("لا يحتاج تحليلًا بصريًا", excel.body.needsOcr === false);
check("استُخرج اسم المدرسة", (excel.body.schoolFound ?? []).includes("name"));
check(
  "تحذير القيمة الكسرية 0.92 صدر",
  (excel.body.warnings ?? []).some((w) => w.type === "fraction-value"),
);

/* 2) رفع ملف PDF */
console.log("\n— رفع ملف PDF —");
const pdf = await upload(pdfName, "external", "تحليل تجريبي — PDF");
check("رفع ملف PDF لم يُسجّل خطأ", pdf.status === 200 && !pdf.body.error, pdf.body.error ?? "");
const pdfId = pdf.body.analysisId;
check("استُخرجت مؤشرات من PDF", (pdf.body.indicatorCount ?? 0) >= 4, `${pdf.body.indicatorCount} مؤشرًا`);
check("تقرأ قراءة نصية بلا OCR", pdf.body.needsOcr === false);

/* 3) قراءة ملخص التحليل */
console.log("\n— قراءة التحليل —");
const summary = await json(`${BASE}/api/analyses/${excelId}`);
check("قراءة ملخص التحليل", summary.status === 200);
check("التغطية محسوبة", summary.body.coverage?.total === 46, `${summary.body.coverage?.total} مؤشرًا`);
check(
  "المؤشر بلا نسبة محسوب كغير متوفر",
  summary.body.coverage?.withPercent < summary.body.coverage?.total,
  `${summary.body.coverage?.withPercent} من ${summary.body.coverage?.total}`,
);
check("أربعة مجالات", summary.body.domains?.length === 4);
check("توجد أولويات تحسين", (summary.body.priorities?.length ?? 0) > 0);

/* 4) تصدير Excel */
console.log("\n— تصدير Excel —");
const excelExport = await fetch(`${BASE}/api/analyses/${excelId}/export/excel`);
check("تصدير Excel ناجح", excelExport.status === 200);
const excelBuffer = Buffer.from(await excelExport.arrayBuffer());
check("ملف Excel غير فارغ", excelBuffer.length > 5000, `${excelBuffer.length} بايت`);
check(
  "نوع المحتوى صحيح",
  excelExport.headers.get("content-type")?.includes("spreadsheetml") ?? false,
);
check("اسم الملف مُرمَّز", (excelExport.headers.get("content-disposition") ?? "").includes("filename*="));

/* 5) تصدير التقرير (HTML عربي) */
console.log("\n— تصدير التقرير —");
const report = await fetch(`${BASE}/api/analyses/${excelId}/export/report`);
check("تصدير التقرير ناجح", report.status === 200);
const html = await report.text();
check("التقرير باتجاه عربي", html.includes('dir="rtl"'));
check("التقرير بمقاس A4", html.includes("size: A4"));
check("التقرير يحوي بيانات المدرسة", html.includes("مدرسة النموذج التجريبية"));
check("التقرير يحوي المرجع (صفحة أو خلية)", html.includes("ورقة:"));
check("التقرير يحوي التنبيهات", html.includes("غير متوفر"));
check("التقرير يحوي المخططات", html.includes("<svg"));
check("التقرير يذكر مُعِدّ التقرير", html.includes("المشرفة أسماء الباتلي"));

/* 6) صفحة الواجهة */
console.log("\n— صفحات الواجهة —");
for (const path of ["/", "/external", "/self", "/analyses", "/settings", `/analyses/${excelId}`]) {
  const page = await fetch(`${BASE}${path}`);
  check(`الصفحة ${path}`, page.status === 200, `HTTP ${page.status}`);
}
const home = await (await fetch(`${BASE}/`)).text();
check("الصفحة الرئيسية تعرض ترويسة الوزارة", home.includes("وزارة التعليم"));
check("اتجاه الصفحة RTL", home.includes('dir="rtl"'));

/* 7) حماية الملفات */
console.log("\n— حماية الملفات —");
const noToken = await fetch(`${BASE}/api/files/external/2026/01/secret.pdf`);
check("الملف محمي بدون رمز", noToken.status === 403, `HTTP ${noToken.status}`);
const badToken = await fetch(`${BASE}/api/files/external/2026/01/secret.pdf?token=abc.def`);
check("الملف محمي برمز خاطئ", badToken.status === 403, `HTTP ${badToken.status}`);

/* 8) حفظ تعديل عبر واجهة المراجعة */
console.log("\n— حفظ تعديلات —");
const patch = await json(`${BASE}/api/analyses/${excelId}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    indicators: { "1-2-1-3": { percent: 52.5, level: "tahyea", notes: "مصحّح يدويًا", reviewed: true } },
    overallPercent: 85,
  }),
});
check("حفظ التعديل نجح", patch.status === 200 && patch.body.ok, patch.body.error ?? "");

/* 8.1) وسم مصدر النسبة بعد إعادة بناء التحليل */
const labels = await readIndicatorSourceLabels(excelId);
check("النسب المستخرجة تبقى موسومة «مستخرج من الملف»", labels.extracted > 0, labels.extracted + " مؤشرًا");
check("المؤشرات غير الواردة «غير متوفر»", labels.absent > 0, labels.absent + " مؤشرًا");
check(
  "«إدخال يدوي» محصور في النسبة المعدّلة فقط",
  labels.manualCodes.length === 1 && labels.manualCodes[0] === "1-2-1-3",
  labels.manualCodes.join(" / ") || "لا يوجد",
);

/* 9) خطة التحسين */
console.log("\n— خطة التحسين —");
const plan = await json(`${BASE}/api/analyses/${excelId}/plan`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "createFromIndicator", code: "1-2-1-3" }),
});
check("إنشاء بند خطة من مؤشر", plan.status === 200 && plan.body.ok, plan.body.error ?? "");

if (plan.body.planId) {
  const update = await json(`${BASE}/api/analyses/${excelId}/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "update",
      planId: plan.body.planId,
      patch: { target: 70, actual: 61, status: "in_progress" },
    }),
  });
  check("تحديث بند الخطة", update.status === 200 && update.body.ok, update.body.error ?? "");
  check("نسبة الإنجاز محسوبة من خط الأساس", typeof update.body.completion === "number", `${update.body.completion}%`);
}

/* 10) الإعدادات */
console.log("\n— الإعدادات —");
const settings = await json(`${BASE}/api/settings`);
check("قراءة الإعدادات", settings.status === 200);
check("الحدود غير مفعّلة افتراضيًا", settings.body.thresholds?.enabled === false);
check("لا حدود افتراضية", settings.body.thresholds?.min?.tahyea === null);

const badThresholds = await json(`${BASE}/api/settings`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    thresholds: {
      enabled: true,
      referenceName: "",
      referenceEdition: "",
      referenceUrl: "",
      notes: "",
      min: { tahyea: 0, intilaq: 50, taqaddum: 75, tamayyuz: 90 },
    },
  }),
});
check("تُرفض حدود بلا مرجع معتمد", badThresholds.status === 400, badThresholds.body.error ?? "");

const goodThresholds = await json(`${BASE}/api/settings`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    thresholds: {
      enabled: true,
      referenceName: "مرجع اختبار",
      referenceEdition: "الإصدار ١",
      referenceUrl: "",
      notes: "",
      min: { tahyea: 0, intilaq: 50, taqaddum: 75, tamayyuz: 90 },
    },
  }),
});
check("تُقبل حدود صالحة مع مرجع", goodThresholds.status === 200, goodThresholds.body.error ?? "");

/* 11) إرجاع الحدود للتعطيل */
await json(`${BASE}/api/settings`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    thresholds: {
      enabled: false,
      referenceName: "",
      referenceEdition: "",
      referenceUrl: "",
      notes: "",
      min: { tahyea: null, intilaq: null, taqaddum: null, tamayyuz: null },
    },
  }),
});
check("أُعيد تعطيل الحدود", true);

/* ---------------------------------------------------------------- */
const failed = checks.filter((c) => !c.ok);
console.log(`\n=== النتيجة: ${checks.length - failed.length} من ${checks.length} فحصًا ناجحًا ===`);
if (failed.length > 0) {
  console.log("\nالفحوص الفاشلة:");
  for (const f of failed) console.log(`  - ${f.name}`);
  process.exit(1);
}
console.log(`معرّفات التحاليل: Excel=${excelId}  PDF=${pdfId}`);