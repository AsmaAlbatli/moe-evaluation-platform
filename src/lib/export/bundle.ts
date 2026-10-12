import type { IndicatorResult, DomainSummary, AnalysisKind } from "@/lib/analysis/compute";
import type { LevelThresholds } from "@/lib/domain/levels";
import type { Recommendation } from "@/lib/recommendations/rules";
import type { SchoolField } from "@/lib/extract/rows";

/** حزمة موحّدة تغذّي مولّد تقرير HTML ومولّد مصنّف Excel. */
export interface ExportBundle {
  meta: {
    analysisId: string;
    title: string;
    kind: AnalysisKind;
    kindLabel: string;
    status: string;
    statusLabel: string;
    generatedAtLabel: string;
    preparedBy: string;
    schoolsScope: string;
    extractionQuality: string | null;
    extractionQualityLabel: string;
  };
  school: SchoolField[];
  overall: { value: number | null; source: string; sourceLabel: string };
  thresholds: LevelThresholds;
  thresholdsNote: string;
  domains: DomainSummary[];
  indicators: IndicatorResult[];
  recommendations: Map<string, Recommendation>;
  plans: ExportPlanRow[];
  revisions: ExportRevisionRow[];
  /** رابط الشعار الرسمي المرفوع (إن وُجد) */
  logoUrl: string | null;
  /** ملاحظات التنبيه الظاهرة في التقرير */
  notices: string[];
}

export interface ExportPlanRow {
  indicatorCode: string | null;
  title: string;
  actions: string[];
  owner: string;
  startDate: string | null;
  endDate: string | null;
  baseline: string | null;
  target: number | null;
  actual: number | null;
  measure: string;
  tool: string;
  evidence: string;
  followUp: string;
  status: string;
  statusLabel: string;
  progressNote: string;
  completion: number | null;
}

export interface ExportRevisionRow {
  createdAtLabel: string;
  entityLabel: string;
  fieldLabel: string;
  oldValue: string;
  newValue: string;
  actor: string;
  note: string;
}

export const PLAN_STATUS_LABEL: Record<string, string> = {
  not_started: "لم يبدأ",
  in_progress: "قيد التنفيذ",
  done: "منجز",
  blocked: "متوقف",
};

export const STATUS_LABEL: Record<string, string> = {
  in_review: "قيد المراجعة",
  approved: "معتمد",
};

export const QUALITY_LABEL: Record<string, string> = {
  good: "جيدة",
  weak: "ضعيفة — تحتاج مراجعة",
  poor: "ضعيفة جدًا — يُنصح بإعادة الرفع أو التحليل البصري",
};

export const VALUE_SOURCE_LABEL: Record<string, string> = {
  extracted: "مستخرج من الملف",
  manual: "إدخال يدوي من المدرسة",
  absent: "غير متوفر",
};

export const LEVEL_SOURCE_LABEL: Record<string, string> = {
  reported: "كما ورد في التقرير",
  thresholds: "مشتق من حدود معتمدة",
  none: "غير متوفر",
};