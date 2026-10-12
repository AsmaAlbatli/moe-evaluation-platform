import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/db.ts", "src/lib/settings.ts", "src/lib/ai/client.ts", "src/lib/storage.ts"],
    },
  },
  resolve: {
    alias: {
      // حزمة server-only ترمي استثناءً خارج بيئة مكوّنات الخادم،
      // فنوجّهها إلى نسخة فارغة أثناء الاختبارات ليمكن اختبار وحدات الخادم.
      "server-only": resolve(import.meta.dirname, "./src/test/stubs/server-only.ts"),
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
});