#!/usr/bin/env node
/**
 * تبديل مخطط Prisma بين SQLite و PostgreSQL.
 *
 *   node scripts/use-db-provider.mjs sqlite
 *   node scripts/use-db-provider.mjs postgres
 *
 * ينسخ المخطط المناسب إلى prisma/schema.prisma.
 * الحقول والعلاقات متطابقة، والفرق الوحيد نوع قاعدة البيانات.
 */

import { copyFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const prismaDir = resolve(here, "..", "prisma");

const target = String(process.argv[2] ?? "").toLowerCase();

const SOURCES = {
  sqlite: resolve(prismaDir, "schema.sqlite.prisma"),
  postgres: resolve(prismaDir, "schema.postgres.prisma"),
};
const DEST = resolve(prismaDir, "schema.prisma");

if (!Object.hasOwn(SOURCES, target)) {
  console.error("الاستخدام: node scripts/use-db-provider.mjs <sqlite|postgres>");
  process.exit(1);
}

const source = SOURCES[target];
let current = "";
try {
  current = readFileSync(DEST, "utf8");
} catch {
  /* لا يوجد ملف حالي */
}

if (readFileSync(source, "utf8") === current) {
  console.log(`مخطط قاعدة البيانات مضبوط بالفعل على: ${target}`);
  process.exit(0);
}

copyFileSync(source, DEST);
console.log(`تم تحديث prisma/schema.prisma إلى نسخة: ${target}`);
console.log("الخطوة التالية:");
if (target === "sqlite") {
  console.log('  اضبط DATABASE_URL="file:./dev.db" ثم نفّذ: npm run db:push');
} else {
  console.log("  اضبط DATABASE_URL على رابط PostgreSQL ثم نفّذ: npm run db:deploy");
}