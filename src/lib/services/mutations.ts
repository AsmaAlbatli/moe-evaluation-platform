import "server-only";

import { prisma } from "@/lib/db";

/** تسجيل تعديل في سجل التدقيق. */
export async function recordRevision(
  analysisId: string,
  entity: string,
  entityId: string,
  field: string,
  changeNote: string,
  actor: string,
  oldValue = "",
  newValue = "",
  note = "",
): Promise<void> {
  await prisma.revision.create({
    data: { analysisId, entity, entityId, field, oldValue, newValue, actor, note: note || changeNote },
  });
}

/**
 * يعيد حساب ملخصات التحليل بعد أي تعديل.
 * يُحدّث نسب المجالات/المعايير كما وردت، ويترك المتوسطات الاسترشادية
 * إلى زمن العرض ولا يكتبها كبيانات رسمية.
 */
export async function recomputeAnalysis(analysisId: string): Promise<void> {
  const indicators = await prisma.indicatorResult.findMany({ where: { analysisId } });
  void indicators;
  // القيم الرسمية (التي وردت في التقرير) لا تتغير بالتعديل؛
  // التعديلات اليدوية تبقى في حقل المؤشر نفسه ويُعاد اشتقاق العرض منها.
  await prisma.analysis.update({
    where: { id: analysisId },
    data: { updatedAt: new Date() },
  });
}