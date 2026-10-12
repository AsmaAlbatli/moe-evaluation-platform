import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * إعدادات lint.
 * ملاحظة: القواعد الأخص تُكتب بعد القواعد العامة لأن ESLint يجعل
 * آخر تعريف هو الساري.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  /* ---------------- استثناءات المسارات ---------------- */
  {
    ignores: [
      // مخرجات البناء
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      "next-env.d.ts",

      // ملفات موفّرة محليًا (محرك التحليل البصري وعامل pdf.js)
      "public/vendor/**",

      // ملفات مؤقتة للاختبارات
      ".tmp-fixtures/**",
      ".tmp-storage-tests/**",

      // مولّد Prisma
      "prisma/schema.prisma",
    ],
  },

  /* ---------------- قواعد عامة على شيفرة المشروع ---------------- */
  {
    rules: {
      // نسمح بـ console للأخطاء والتحذيرات فقط، ونمنعه في بقية الشيفرة
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // المتغيرات التي تبدأ بشرطة سفلية تُعدّ مستخدمة عمدًا
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  /* ---------------- استثناءات خاصة ---------------- */

  // مكوّنات shadcn/ui المولّدة — تُحدَّث آليًا عبر أمر shadcn ولا نعدّلها يدويًا
  {
    files: ["src/components/ui/**/*.tsx"],
    rules: {
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react/jsx-key": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "no-console": "off",
    },
  },

  // ملفات الاختبار
  {
    files: ["src/**/*.test.ts", "src/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },

  // سكربتات التشغيل — مخرجاتها نصية إلى الطرفية بطبيعتها
  {
    files: ["scripts/**/*.mjs", "eslint.config.mjs"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-console": "off",
    },
  },
]);

export default eslintConfig;