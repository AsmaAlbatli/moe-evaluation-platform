#!/usr/bin/env node
/**
 * تجهيز ملفات التحليل البصري (OCR) محليًا.
 *
 * تُنسخ ملفات محرك tesseract.js من حزم npm، وبيانات اللغة العربية،
 * إلى مجلد public/vendor/ocr حتى يعمل التحليل البصري دون الاتصال بأي CDN.
 *
 *   npm run vendor:assets
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = join(root, "public", "vendor", "ocr");
const langDir = join(outDir, "lang");

function copyIfPresent(src, dest, label) {
  if (!existsSync(src)) {
    console.warn(`  ⚠ تخطي ${label}: لم يُعثر على ${src}`);
    return false;
  }
  copyFileSync(src, dest);
  const kb = (statSync(dest).size / 1024).toFixed(0);
  console.log(`  ✓ ${label} (${kb} كيلوبايت)`);
  return true;
}

mkdirSync(langDir, { recursive: true });

console.log("تجهيز محرك التحليل البصري في public/vendor/ocr …");

/* 1) عامل tesseract */
copyIfPresent(
  join(root, "node_modules", "tesseract.js", "dist", "worker.min.js"),
  join(outDir, "worker.min.js"),
  "worker.min.js",
);

/* 2) نواة WebAssembly — نستخدم نسخة SIMD لأن كل المتصفحات الحديثة تدعمها
      (المتصفحات التي يتطلبها Next.js 16 تدعم SIMD بالكامل). */
const coreDir = join(root, "node_modules", "tesseract.js-core");
for (const file of ["tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm"]) {
  copyIfPresent(join(coreDir, file), join(outDir, file), file);
}

/* 3) بيانات اللغة العربية.
      تُبحث في ثلاثة مواضع بالترتيب: نسخة المشروع المحلية، ثم مستودع
      العمل الأصلي إن كان متاحًا، ثم تحميلها من مستودع tessdata الرسمي. */
const araCandidates = [
  join(root, "assets", "ara.traineddata.gz"),
  join(root, "vendor-assets", "ara.traineddata.gz"),
  join(root, "..", "assets", "vendor", "ocr", "lang", "ara.traineddata.gz"),
];

let araOk = false;
for (const candidate of araCandidates) {
  if (existsSync(candidate) && statSync(candidate).size > 100_000) {
    araOk = copyIfPresent(candidate, join(langDir, "ara.traineddata.gz"), "lang/ara.traineddata.gz");
    if (araOk) break;
  }
}

if (!araOk) {
  console.warn("\n  ⚠ لم يُعثر على ara.traineddata.gz محليًا.");
  console.warn("    نزّله يدويًا إلى public/vendor/ocr/lang/ara.traineddata.gz من:");
  console.warn("    https://github.com/tesseract-ocr/tessdata/blob/main/ara.traineddata");
  console.warn("    أو شغّل التحليل البصري بلا بيانات عربية (سيكون lousyEnglish فقط).\n");
} else {
  console.log("\nاكتمل التجهيز. التحليل البصري متاح دون اتصال بالإنترنت.");
}

const total = readdirSync(outDir, { recursive: true }).reduce((sum, rel) => {
  const p = join(outDir, String(rel));
  try {
    return statSync(p).isFile() ? sum + statSync(p).size : sum;
  } catch {
    return sum;
  }
}, 0);
console.log(`الحجم الإجمالي: ${(total / 1024 / 1024).toFixed(1)} ميجابايت`);

/* 4) عامل pdfjs للمعاينة والتحليل البصري داخل المتصفح */
const pdfDir = join(root, "public", "vendor", "pdf");
mkdirSync(pdfDir, { recursive: true });
copyIfPresent(
  join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"),
  join(pdfDir, "pdf.worker.min.mjs"),
  "vendor/pdf/pdf.worker.min.mjs",
);