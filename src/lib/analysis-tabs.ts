/** تبويبات صفحات التحليل الواحد — وحدة محايدة تعمل في الخادم والعميل. */

export interface AnalysisTab {
  href: string;
  label: string;
}

/** يبني روابط التبويبات لمعرّف تحليل معيّن. */
export function analysisTabs(analysisId: string): AnalysisTab[] {
  const base = `/analyses/${analysisId}`;
  return [
    { href: base, label: "لوحة المعلومات" },
    { href: `${base}/review`, label: "مراجعة وتصحيح النتائج" },
    { href: `${base}/indicators`, label: "تحليل المؤشرات والتوصيات" },
    { href: `${base}/plan`, label: "خطة التحسين" },
    { href: `${base}/report`, label: "التقرير والتصدير" },
  ];
}