import "server-only";

import { createHash } from "node:crypto";
import { prisma, describeDbError } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { buildStorageKey, putObject } from "@/lib/storage";
import { extractFromWorkbook } from "@/lib/extract/excel";
import { extractFromPdf, harvestOcrText } from "@/lib/extract/pdf";
import {
  assessExtractionQuality,
  emptySchoolInfo,
  type ExtractionWarning,
  type HarvestResult,
  type IndicatorHit,
  type SchoolInfo,
} from "@/lib/extract/rows";
import {
  buildIndicators,
  ANALYSIS_KIND_LABEL,
  type AnalysisKind,
  type IndicatorInput,
  type IndicatorResult,
} from "@/lib/analysis/compute";
import type { LevelThresholds, PerformanceLevel } from "@/lib/domain/levels";

/**
 * خدمة ingest: تستقبل ملف التقرير، تستخرج محتواه، تنشئ التحليل،
 * وتخزّن الملف محميًا. لا تُكتب أي نسبة لم ترد في الملف.
 */

export type SupportedKind = "pdf" | "xlsx" | "xls" | "csv";

export const ACCEPTED_EXTENSIONS: SupportedKind[] = ["pdf", "xlsx", "xls", "csv"];
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export interface IngestOptions {
  kind: AnalysisKind;
  /** اسم المدرسة كيدخله المستخدم (اختياري؛ يُستخدم إن لم يُستخرج) */
  titleHint?: string;
  /** صفحات ناتجة عن التحليل البصري في المتصفح (للملفات الممسوحة ضوئيًا) */
  ocrPages?: { page: number; text: string }[];
}

export interface IngestResult {
  analysisId: string;
  quality: "good" | "weak" | "poor";
  qualityReasons: string[];
  warnings: ExtractionWarning[];
  indicatorCount: number;
  schoolFound: string[];
  needsOcr: boolean;
  notices: string[];
}

export function detectKind(filename: string): SupportedKind | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "xlsx") return "xlsx";
  if (ext === "xls") return "xls";
  if (ext === "csv") return "csv";
  return null;
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function mergeSchoolInfo(harvest: SchoolInfo): SchoolInfo {
  const out = emptySchoolInfo();
  for (const key of Object.keys(out) as (keyof SchoolInfo)[]) {
    const src = harvest[key];
    if (src && src.found) out[key] = src;
  }
  return out;
}

function toIndicatorInputs(hits: Map<string, IndicatorHit>): IndicatorInput[] {
  return [...hits.entries()].map(([code, hit]) => ({
    code,
    value: hit.value,
    level: hit.level,
    ref: hit.ref,
    rawText: hit.rawText,
    explicitSign: hit.explicitSign,
    valueIssue: hit.valueIssue,
  }));
}

export async function ingestReport(
  file: { name: string; type: string; buffer: Buffer },
  options: IngestOptions,
): Promise<IngestResult> {
  const kind = detectKind(file.name);
  if (!kind) {
    throw new Error("صيغة الملف غير مدعومة. الصيغ المدعومة: PDF و XLSX و XLS و CSV.");
  }
  if (file.buffer.length > MAX_FILE_BYTES) {
    throw new Error("حجم الملف يتجاوز الحد المسموح (20 ميجابايت).");
  }

  const settings = await getSettings();

  /* ---------- 1) الاستخراج ---------- */
  let harvest: HarvestResult;
  let extractMode = "text";
  let pageCount: number | null = null;
  let needsOcr = false;
  const notices: string[] = [];

  if (kind === "pdf") {
    if (options.ocrPages && options.ocrPages.length > 0) {
      harvest = harvestOcrText(options.ocrPages);
      extractMode = "ocr";
      pageCount = options.ocrPages.length;
      notices.push(
        "تمت قراءة الملف بالتحليل البصري (OCR) داخل المتصفح. راجع كل نتيجة قبل اعتمادها.",
      );
    } else {
      const pdfResult = await extractFromPdf(new Uint8Array(file.buffer));
      harvest = pdfResult.result;
      pageCount = pdfResult.pageCount;
      needsOcr = pdfResult.needsOcr;
      if (needsOcr) {
        notices.push(
          "النص المستخرج من الملف ضعيف جدًا، ويبدو أنه ملف ممسوح ضوئيًا. فعّل خيار «التحليل البصري (OCR)» لقراءة الملف بدقة أعلى.",
        );
      }
    }
  } else {
    const wbResult = extractFromWorkbook(new Uint8Array(file.buffer));
    harvest = wbResult.result;
    notices.push(`تمت قراءة ${wbResult.meta.sheetNames.length} ورقة من ملف الجدول.`);
  }

  const { quality, reasons } = assessExtractionQuality(harvest);
  if (quality !== "good") {
    notices.push(...reasons);
  }
  if (harvest.unmatched.length > 0) {
    notices.push(
      `تعذّر ربط ${harvest.unmatched.length} سطرًا بالنتائج المعروفة، وعُرضت في جدول «أسطر غير مطابقة» للمراجعة.`,
    );
  }

  /* ---------- 2) بناء المؤشرات ---------- */
  const inputs = toIndicatorInputs(harvest.indicators);
  const indicators = buildIndicators(inputs, { thresholds: settings.thresholds });

  /* ---------- 3) تخزين الملف ---------- */
  const storageKey = buildStorageKey(file.name, options.kind === "external" ? "external" : "self");
  const stored = await putObject(storageKey, file.buffer, file.type || "application/octet-stream");

  /* ---------- 4) إنشاء التحليل ---------- */
  const extractedName = harvest.school.name.value;
  const title =
    options.titleHint?.trim() ||
    (extractedName !== null && extractedName !== "" ? String(extractedName) : "") ||
    `${ANALYSIS_KIND_LABEL[options.kind]} — ${file.name}`;

  const schoolFields = mergeSchoolInfo(harvest.school);
  const rawOverall = schoolFields.overallPercent.value;
  const overallValue = rawOverall === null ? null : Number(rawOverall);

  try {
    const analysis = await prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: {
          name: schoolFields.name.value ? String(schoolFields.name.value) : null,
          ministryNo: schoolFields.ministryNo.value ? String(schoolFields.ministryNo.value) : null,
          stage: schoolFields.stage.value ? String(schoolFields.stage.value) : null,
          academicYear: schoolFields.academicYear.value ? String(schoolFields.academicYear.value) : null,
          educationOffice: schoolFields.educationOffice.value
            ? String(schoolFields.educationOffice.value)
            : null,
          schoolType: schoolFields.schoolType.value ? String(schoolFields.schoolType.value) : null,
          gender: schoolFields.gender.value ? String(schoolFields.gender.value) : null,
          principalName: schoolFields.principalName.value ? String(schoolFields.principalName.value) : null,
          studentsCount:
            schoolFields.studentsCount.value === null
              ? null
              : Number(schoolFields.studentsCount.value),
          teachersCount:
            schoolFields.teachersCount.value === null
              ? null
              : Number(schoolFields.teachersCount.value),
        },
      });

      const created = await tx.analysis.create({
        data: {
          kind: options.kind,
          status: "in_review",
          title,
          schoolId: school.id,
          overallPercent: overallValue,
          overallSource: overallValue !== null ? "extracted" : "absent",
          thresholdsSnapshot: JSON.stringify(settings.thresholds),
          extractionQuality: quality,
          extractionSummary: reasons.join(" | ") || "تمت القراءة بدون أخطاء.",
        },
      });

      // المؤشرات: نحفظ المتوفر فقط، ونترك الباقي فارغًا (لا أصفار)
      const toSave = indicators.filter((i) => i.presentInFile || i.level !== null);
      if (toSave.length > 0) {
        await tx.indicatorResult.createMany({
          data: toSave.map((i) => ({
            analysisId: created.id,
            code: i.code,
            domainId: i.domainId,
            criterionCode: i.criterionCode,
            percent: i.percent,
            percentSource: i.percentSource,
            level: i.level,
            levelSource: i.levelSource,
            sourceLabel: i.source.label,
            sourcePage: i.source.page ?? null,
            sourceSheet: i.source.sheet ?? null,
            sourceCell: i.source.cell ?? null,
            rawText: i.rawText,
            presentInFile: i.presentInFile,
            valueIssue: i.valueIssue,
          })),
        });
      }

      const aggregateRows = [
        ...[...harvest.criteria.entries()].map(([code, hit]) => ({
          scope: "criterion",
          code,
          value: hit.value,
          ref: hit.ref,
        })),
        ...[...harvest.domains.entries()].map(([id, hit]) => ({
          scope: "domain",
          code: String(id),
          value: hit.value,
          ref: hit.ref,
        })),
      ];
      if (aggregateRows.length > 0) {
        await tx.aggregateResult.createMany({
          data: aggregateRows.map((r) => ({
            analysisId: created.id,
            scope: r.scope,
            code: r.code,
            value: r.value,
            sourceLabel: r.ref.label,
            sourcePage: r.ref.page ?? null,
            sourceSheet: r.ref.sheet ?? null,
            sourceCell: r.ref.cell ?? null,
          })),
        });
      }

      await tx.sourceFile.create({
        data: {
          analysisId: created.id,
          originalName: file.name,
          kind,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.buffer.length,
          sha256: sha256(file.buffer),
          storageDriver: stored.driver,
          storageKey: stored.key,
          extractMode,
          extractQuality: quality,
          pageCount,
          notes: reasons.join(" | "),
        },
      });

      await tx.revision.create({
        data: {
          analysisId: created.id,
          entity: "analysis",
          entityId: created.id,
          field: "إنشاء التحليل",
          oldValue: "",
          newValue: `${ANALYSIS_KIND_LABEL[options.kind]} — ${file.name}`,
          actor: settings.preparedBy,
          note: `تمت قراءة الملف واستخراج ${toSave.length} مؤشرًا بجودة: ${quality}.`,
        },
      });

      return created;
    });

    return {
      analysisId: analysis.id,
      quality,
      qualityReasons: reasons,
      warnings: harvest.warnings,
      indicatorCount: indicators.filter((i) => i.percent !== null).length,
      schoolFound: Object.entries(schoolFields)
        .filter(([, f]) => f.found)
        .map(([key]) => key),
      needsOcr,
      notices,
    };
  } catch (error) {
    throw new Error(describeDbError(error));
  }
}

/** يعيد بناء مؤشرات التحليل من قاعدة البيانات (مع تطبيق إعدادات الحدود الحالية). */
export async function loadAnalysisIndicators(
  analysisId: string,
  thresholds: LevelThresholds,
): Promise<IndicatorResult[]> {
  const rows = await prisma.indicatorResult.findMany({
    where: { analysisId },
    orderBy: [{ domainId: "asc" }, { code: "asc" }],
  });

  const inputs: IndicatorInput[] = rows.map((r) => ({
    code: r.code,
    value: r.percent,
    level: (r.level as IndicatorInput["level"]) ?? null,
    ref: {
      kind: (r.sourcePage ? "pdf-page" : r.sourceSheet ? "excel-cell" : "none") as "pdf-page",
      label: r.sourceLabel,
      page: r.sourcePage ?? undefined,
      sheet: r.sourceSheet ?? undefined,
      cell: r.sourceCell ?? undefined,
    },
    rawText: r.rawText,
    valueIssue: r.valueIssue,
  }));

  // مهم: التعديلات اليدوية فقط هي التي تُوسم «إدخال يدوي من المدرسة».
  // القيم المستخرجة من الملف تبقى «مستخرجة من التقرير» مهما أُعيد بناء التحليل.
  const manual = new Map<
    string,
    { percent?: number | null; level?: PerformanceLevel | null; notes?: string; reviewed?: boolean }
  >();
  for (const r of rows) {
    const level = (r.level as PerformanceLevel | null) ?? null;
    if (r.percentSource === "manual") {
      manual.set(r.code, {
        percent: r.percent,
        level,
        notes: r.notes,
        reviewed: r.reviewed,
      });
    } else if (r.notes || r.reviewed) {
      // مستخرجة لكن مراجَعة/معلَّمة: نمرّر الملاحظات فقط دون المساس بمصدر النسبة.
      manual.set(r.code, { notes: r.notes, reviewed: r.reviewed });
    }
  }

  // نبني القائمة الكاملة (46 مؤشرًا)؛ المفقود يبقى null وليس صفرًا.
  // نشتق المستوى من النسبة فقط إن كان مصدره «حدود معتمدة» عند تغيّر الإعدادات.
  return buildIndicators(inputs, { thresholds, manual });
}