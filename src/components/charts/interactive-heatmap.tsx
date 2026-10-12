"use client";

import { useRouter } from "next/navigation";
import { IndicatorHeatmap, type HeatmapGroup } from "@/components/charts/indicator-heatmap";

/**
 * غلاف تفاعلي للخريطة الحرارية ينقل المستخدم إلى صفحة المؤشر عند الضغط عليه.
 * إضافةً لذلك يبقى كل التفاعل داخل مكوّن العميل.
 */
export function InteractiveHeatmap({
  groups,
  analysisId,
}: {
  groups: HeatmapGroup[];
  analysisId: string;
}) {
  const router = useRouter();
  return (
    <IndicatorHeatmap
      groups={groups}
      onSelectCode={(code) => router.push(`/analyses/${analysisId}/indicators?code=${code}`)}
    />
  );
}