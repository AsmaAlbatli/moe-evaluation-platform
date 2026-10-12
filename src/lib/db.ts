import "server-only";

import { PrismaClient } from "@prisma/client";

/**
 * عميل Prisma واحد لكل عملية تشغيل.
 * في بيئة التطوير (NODE_ENV=development) يُعاد استخدام العميل بين
 * إعادة التحميلات حتى لا تتضخم الاتصالات.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** يحوّل أخطاء Prisma المعروفة إلى رسائل عربية واضحة. */
export function describeDbError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("Unique constraint")) {
      return "تعارض في القيم: يوجد سجل بنفس المفاتيح.";
    }
    if (error.message.includes("Foreign key")) {
      return "مرجع غير صالح: السجل المرتبط غير موجود.";
    }
    if (error.message.includes("Can't reach database")) {
      return "تعذّر الاتصال بقاعدة البيانات. تحقّق من متغير DATABASE_URL وتشغيل الخادم.";
    }
    return error.message;
  }
  return "خطأ غير معروف في قاعدة البيانات.";
}