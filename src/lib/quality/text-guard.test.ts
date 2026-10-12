import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * حارس جودة النصوص العربية.
 *
 * أثناء كتابة المشروع تسرّب بعض الكلمات الأجنبية ورموز الاستبدال
 * (�) داخل الجمل العربية المعروضة للمستخدم.
 * هذا الاختبار يمنع تكرارها تلقائيًا.
 */

const ROOT = join(import.meta.dirname, "..", "..", "..");
const SRC = join(ROOT, "src");

function collectFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      out.push(...collectFiles(full, exts));
    } else if (exts.some((e) => entry.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

const files = collectFiles(SRC, [".ts", ".tsx"]).filter((f) => {
  const rel = f.replace(/\\/g, "/");
  return !rel.endsWith(".test.ts") && !rel.endsWith(".test.tsx") && !rel.includes("/ui/");
});

/** معرّفات تقنية ومصطلحات ثابتة مقبولة داخل النص العربي. */
const TECH_ALLOWLIST = new Set([
  "useState", "useMemo", "useRef", "useCallback", "useRouter", "useSearchParams",
  "useEffect", "useParams", "usePathname", "className", "nextConfig", "tailwindcss",
  "OpenAI", "Azure", "OpenRouter", "Gemini", "Vercel", "Prisma", "Next", "js",
  "Vitest", "Tailwind", "TypeScript", "JavaScript", "PostgreSQL", "SQLite",
  "Postgres", "shadcn", "Excel", "JSON", "CSV", "PDF", "HTML", "CSS",
  "OCR", "CDN", "URL", "API", "AI", "SQL", "Node", "S3", "Blob", "WebP", "SVG",
  "PNG", "JPG", "XLSX", "XLS", "TLS", "MOE", "PDFs",
  "png", "jpg", "jpeg", "pdf", "xlsx", "xls", "csv", "txt", "mjs", "ts",
  "tsx", "svg", "postcss", "eslint", "npm", "prisma", "http", "https", "env",
  "pdfjs", "public", "src", "app", "api", "lib", "name", "type",
  "value", "code", "data", "text", "icon", "config", "true", "false", "null",
  "id", "class", "dir", "lang", "auto", "none", "utf", "React",
  // عبارات أوامر تقنية
  "npm", "install", "npx", "run", "dev", "build", "start", "test", "push",
  "deploy", "migrate", "generate", "studio", "copy", "randomBytes",
]);

/** سطور الكود (باستثناء التعليقات) التي تحمل نصوصًا عربية. */
function codeLinesWithArabic(source: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  source.split(/\r?\n/).forEach((line, i) => {
    const commentIdx = line.indexOf("//");
    const code = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    if (/[\u0600-\u06FF]/.test(code)) out.push({ line: i + 1, text: code.trim() });
  });
  return out;
}

describe("سلامة النصوص العربية المعروضة", () => {
  it("لا توجد رموز استبدال (�) في الشيفرة", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (readFileSync(file, "utf8").includes("\uFFFD")) offenders.push(file.replace(/\\/g, "/"));
    }
    expect(offenders).toEqual([]);
  });

  it("لا توجد كلمات أجنبية ملتصقة داخل جمل عربية في الشيفرة", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const { line, text } of codeLinesWithArabic(source)) {
        const matches = text.match(/[\u0600-\u06FF][A-Za-z]{2,}|[A-Za-z]{2,}[\u0600-\u06FF]/g);
        if (!matches) continue;
        for (const m of matches) {
          const token = /^[A-Za-z]/.test(m)
            ? m.split(/[\u0600-\u06FF]/)[0]
            : m.split(/[\u0600-\u06FF]/).pop()!;
          if (TECH_ALLOWLIST.has(token)) continue;
          offenders.push(`${file.replace(/\\/g, "/")}:${line} → «${m}»`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("لا توجد كلمات أجنبية متصلة بحرف عربي داخل نفس النص", () => {
    // النمط الذي ظهرت به أخطاء الكتابة: كلمة أجنبية ملتصقة بحرف عربي
    // مثل «المستهدفAlways» أو «زيادةConserv». نمسح النصوص فقط.
  const offenders: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const quoted = /(["'`])((?:[^"'`\\]|\\.)*)\1/g;
    for (const m of source.matchAll(quoted)) {
      const body = m[2];
      for (const hit of body.match(/[\u0600-\u06FF][A-Za-z]{3,}|[A-Za-z]{3,}[\u0600-\u06FF]/g) ?? []) {
        const token = /^[A-Za-z]/.test(hit)
          ? hit.split(/[\u0600-\u06FF]/)[0]
          : hit.split(/[\u0600-\u06FF]/).pop()!;
        if (TECH_ALLOWLIST.has(token)) continue;
        const lineNo = source.slice(0, m.index!).split(/\r?\n/).length;
        offenders.push(`${file.replace(/\\/g, "/")}:${lineNo} → «${hit}»`);
      }
    }
  }
  expect(offenders).toEqual([]);
  });
});