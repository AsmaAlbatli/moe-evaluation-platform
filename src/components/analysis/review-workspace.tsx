"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Save, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/tables/data-table";
import { LevelBadge, SourceChip } from "@/components/common/level-badge";
import { PERFORMANCE_LEVELS, LEVEL_LABEL, type PerformanceLevel } from "@/lib/domain/levels";
import { SCHOOL_FIELDS, type SchoolFieldKey } from "@/lib/extract/rows";
import type { IndicatorResult } from "@/lib/analysis/compute";
import { LEVEL_SOURCE_LABEL, VALUE_SOURCE_LABEL } from "@/lib/export/bundle";
import { ExportToolbar } from "./export-toolbar";

interface IndicatorPatch {
  percent: number | null;
  level: PerformanceLevel | null;
  notes: string;
  reviewed: boolean;
}

interface SchoolState {
  name: string;
  ministryNo: string;
  stage: string;
  academicYear: string;
  educationOffice: string;
  schoolType: string;
  gender: string;
  principalName: string;
  studentsCount: string;
  teachersCount: string;
}

export interface ReviewWorkspaceProps {
  analysisId: string;
  status: string;
  indicators: IndicatorResult[];
  school: Record<string, string | number | null>;
  overallPercent: number | null;
  thresholdsEnabled: boolean;
  files: { id: string; originalName: string; kind: string; url: string; pageCount: number | null }[];
}

/**
 * شاشة مراجعة كل مؤشر وتصحيحه قبل حفظ التحليل.
 * لا تُحفظ أي قيمة لم يراها المستخدم بوضوح، وكل تعديل يُسجَّل في سجل التعديلات.
 */
export function ReviewWorkspace({
  analysisId,
  status,
  indicators,
  school,
  overallPercent,
  thresholdsEnabled,
  files,
}: ReviewWorkspaceProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const [patches, setPatches] = useState<Record<string, IndicatorPatch>>(() =>
    Object.fromEntries(
      indicators.map((i) => [
        i.code,
        {
          percent: i.percent,
          level: i.level,
          notes: i.notes ?? "",
          reviewed: i.reviewed,
        },
      ]),
    ),
  );

  const [schoolState, setSchoolState] = useState<SchoolState>(() => ({
    name: String(school.name ?? ""),
    ministryNo: String(school.ministryNo ?? ""),
    stage: String(school.stage ?? ""),
    academicYear: String(school.academicYear ?? ""),
    educationOffice: String(school.educationOffice ?? ""),
    schoolType: String(school.schoolType ?? ""),
    gender: String(school.gender ?? ""),
    principalName: String(school.principalName ?? ""),
    studentsCount: school.studentsCount === null || school.studentsCount === undefined ? "" : String(school.studentsCount),
    teachersCount: school.teachersCount === null || school.teachersCount === undefined ? "" : String(school.teachersCount),
  }));

  const [overall, setOverall] = useState(overallPercent === null ? "" : String(overallPercent));

  const rows = useMemo(
    () =>
      indicators.map((i) => {
        const patch = patches[i.code];
        return { ...i, percent: patch.percent, level: patch.level, notes: patch.notes, reviewed: patch.reviewed };
      }),
    [indicators, patches],
  );

  const changedCount = useMemo(
    () =>
      indicators.filter((i) => {
        const p = patches[i.code];
        return p.percent !== i.percent || p.level !== i.level || (p.notes ?? "") !== (i.notes ?? "");
      }).length,
    [indicators, patches],
  );

  function updatePatch(code: string, patch: Partial<IndicatorPatch>) {
    setPatches((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }));
    setDirty(true);
  }

  function markReviewed(code: string, checked: boolean) {
    updatePatch(code, { reviewed: checked });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const indicatorPayload: Record<string, IndicatorPatch> = {};
      for (const i of indicators) {
        const p = patches[i.code];
        if (
          p.percent !== i.percent ||
          p.level !== i.level ||
          (p.notes ?? "") !== (i.notes ?? "") ||
          p.reviewed !== i.reviewed
        ) {
          indicatorPayload[i.code] = p;
        }
      }

      const schoolPayload: Record<string, string | number | null> = {};
      for (const [key, value] of Object.entries(schoolState)) {
        const original = school[key];
        const normalized = value === "" ? null : value;
        if (String(original ?? "") !== String(normalized ?? "")) {
          schoolPayload[key] =
            key === "studentsCount" || key === "teachersCount"
              ? normalized === null
                ? null
                : Number(normalized)
              : (normalized as string | null);
        }
      }

      const overallValue = overall.trim() === "" ? null : Number(overall);

      const response = await fetch(`/api/analyses/${analysisId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          indicators: indicatorPayload,
          ...(Object.keys(schoolPayload).length > 0 ? { school: schoolPayload } : {}),
          ...(overallValue !== overallPercent ? { overallPercent: overallValue } : {}),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "تعذّر حفظ التعديلات.");
      }

      toast.success("تم حفظ التعديلات وتسجيلها في سجل التعديلات.");
      setDirty(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر حفظ التعديلات.");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    await handleSave();
    const response = await fetch(`/api/analyses/${analysisId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    if (response.ok) {
      toast.success("تم اعتماد التحليل.");
      router.refresh();
    } else {
      toast.error("تعذّر اعتماد التحليل.");
    }
  }

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "code",
      header: "المؤشر",
      sortValue: (r) => r.code,
      searchValue: (r) => `${r.code} ${r.text} ${r.criterionName}`,
      render: (r) => (
        <div>
          <span className="num font-bold text-brand">{r.code}</span>
          <p className="mt-0.5 max-w-[22rem] text-xs leading-snug text-slate-700">{r.text}</p>
        </div>
      ),
    },
    {
      key: "criterion",
      header: "المجال / المعيار",
      hideOnMobile: true,
      sortValue: (r) => r.domainName,
      searchValue: (r) => `${r.domainName} ${r.criterionName}`,
      render: (r) => (
        <span className="text-xs text-slate-600">
          {r.domainName}
          <br />
          <span className="text-slate-400">{r.criterionName}</span>
        </span>
      ),
    },
    {
      key: "percent",
      header: "النسبة الفعلية",
      sortValue: (r) => r.percent,
      render: (r) => (
        <div className="min-w-[120px]">
          <Input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={r.percent === null ? "" : r.percent}
            placeholder="غير متوفر"
            aria-label={`نسبة المؤشر ${r.code}`}
            onChange={(e) => {
              const raw = e.target.value;
              updatePatch(r.code, {
                percent: raw === "" ? null : Math.max(0, Math.min(100, Number(raw))),
              });
            }}
            className="h-8 text-sm"
          />
          <p className="mt-0.5 text-[10px] text-slate-400">
            {VALUE_SOURCE_LABEL[r.percentSource]}
          </p>
        </div>
      ),
    },
    {
      key: "level",
      header: "مستوى الأداء",
      sortValue: (r) => r.level ?? "zzz",
      render: (r) => (
        <div className="min-w-[150px] space-y-1">
          <Select
            value={r.level ?? "none"}
            onValueChange={(v) =>
              updatePatch(r.code, { level: v === "none" ? null : (v as PerformanceLevel) })
            }
          >
            <SelectTrigger className="h-8 w-full text-xs" aria-label={`مستوى المؤشر ${r.code}`}>
              <span className="truncate">{r.level ? LEVEL_LABEL[r.level] : "غير متوفر"}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">غير متوفر</SelectItem>
              {PERFORMANCE_LEVELS.map((l) => (
                <SelectItem key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap items-center gap-1">
            <LevelBadge level={r.level} levelSource={r.levelSource} />
            <span className="text-[10px] text-slate-400">{LEVEL_SOURCE_LABEL[r.levelSource]}</span>
          </div>
        </div>
      ),
    },
    {
      key: "source",
      header: "المصدر في الملف",
      hideOnMobile: true,
      render: (r) => (
        <div className="text-[11px] text-slate-500">
          <p>{r.source.label}</p>
          {r.presentInFile ? (
            <SourceChip label="ورد في الملف" />
          ) : (
            <SourceChip label="لم يرد في الملف" />
          )}
          {r.valueIssue && <p className="mt-0.5 text-amber-700">{r.valueIssue}</p>}
        </div>
      ),
    },
    {
      key: "raw",
      header: "النص الأصلي",
      hideOnMobile: true,
      render: (r) =>
        showRaw && r.rawText ? (
          <p className="max-w-[24rem] text-[10px] leading-relaxed text-slate-500">{r.rawText.slice(0, 400)}</p>
        ) : (
          <span className="text-[10px] text-slate-400">—</span>
        ),
    },
    {
      key: "notes",
      header: "ملاحظات المراجعة",
      render: (r) => (
        <Textarea
          value={r.notes}
          onChange={(e) => updatePatch(r.code, { notes: e.target.value })}
          placeholder="ملاحظة تظهر في التقرير المعتمد"
          aria-label={`ملاحظات المؤشر ${r.code}`}
          rows={2}
          className="min-h-[48px] text-xs"
        />
      ),
    },
    {
      key: "reviewed",
      header: "تمت المراجعة",
      render: (r) => (
        <label className="flex cursor-pointer items-center gap-1.5 text-xs">
          <Checkbox
            checked={r.reviewed}
            onCheckedChange={(v) => markReviewed(r.code, v === true)}
            aria-label={`تحديد ${r.code} كمراجَع`}
          />
          {r.reviewed ? "نعم" : "لا"}
        </label>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <Alert>
        <TriangleAlert className="size-4" />
        <AlertTitle>كيف تعمل هذه الشاشة</AlertTitle>
        <AlertDescription>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
            <li>
              كل نتيجة مستخرجة تُعرض مع مرجعها من الملف (رقم الصفحة أو الخلية) والنص الأصلي كما ورد.
            </li>
            <li>
              المؤشر الذي لم ترد نسبته يظهر «غير متوفر». يمكنك إدخال النسبة يدويًا إن كانت متاحة من مصدر
              آخر، ولا تُعامل القيمة الفارغة كصفر.
            </li>
            <li>
              {thresholdsEnabled
                ? "المستويات تُشتق من الحدود الرقمية المعتمدة في الإعدادات عند غياب مستوى صريح في التقرير."
                : "لا تُربط النسبة بالمستوى لأن الإدارة لم تعتمد حدودًا رقمية؛ يُعرض المستوى كما ورد في التقرير فقط."}
            </li>
            <li>كل تعديل يُحفظ في سجل التعديلات مع التاريخ والقيمة قبل وبعد.</li>
          </ul>
        </AlertDescription>
      </Alert>

      {/* بيانات المدرسة */}
      <Card>
        <CardHeader className="bg-gradient-to-l from-brand-soft to-white">
          <CardTitle className="text-navy">تصحيح بيانات المدرسة</CardTitle>
          <CardDescription>
            أي معلومة لم ترد في التقرير تظهر «غير متوفرة». أدخل ما هو متاح لديك من مصادر المدرسة.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SCHOOL_FIELDS.filter((f) => f.key !== "overallPercent").map((f) => (
            <div key={f.key}>
              <Label htmlFor={`school-${f.key}`} className="text-xs">
                {f.label}
              </Label>
              <Input
                id={`school-${f.key}`}
                type={f.type === "int" ? "number" : "text"}
                value={String(schoolState[f.key as keyof SchoolState] ?? "")}
                placeholder="غير متوفر"
                onChange={(e) => {
                  setSchoolState((prev) => ({ ...prev, [f.key]: e.target.value }));
                  setDirty(true);
                }}
                className="mt-1 h-9 text-sm"
              />
            </div>
          ))}

          <div>
            <Label htmlFor="school-overall" className="text-xs">
              النسبة العامة
            </Label>
            <Input
              id="school-overall"
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={overall}
              placeholder="غير متوفرة"
              onChange={(e) => {
                setOverall(e.target.value);
                setDirty(true);
              }}
              className="mt-1 h-9 text-sm"
            />
            <p className="mt-1 text-[10px] text-slate-400">
              لا تُحسب تلقائيًا. إن كانت متاحة في التقرير أدخلها، وإلا اتركها فارغة.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* الملفات المرفوعة */}
      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-navy">الملفات المصدر</CardTitle>
            <CardDescription>الملفات محفوظة في مسار محمي ولا تُتاح برابط مباشر.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {files.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 rounded border border-border p-2">
                  <span className="text-xs">
                    <span className="font-semibold">{f.originalName}</span>
                    <span className="text-slate-400">
                      {" "}
                      — {f.kind.toUpperCase()}
                      {f.pageCount ? ` — ${f.pageCount} صفحة` : ""}
                    </span>
                  </span>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-brand hover:underline"
                  >
                    معاينة
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* جدول المؤشرات */}
      <Card>
        <CardHeader className="bg-gradient-to-l from-brand-soft to-white">
          <CardTitle className="text-navy">مراجعة المؤشرات وتصحيحها</CardTitle>
          <CardDescription>
            {indicators.length} مؤشرًا — {changedCount} مؤشرًا عليه تعديلات غير محفوظة
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              {showRaw ? "إخفاء النص الأصلي" : "إظهار النص الأصلي"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                for (const code of Object.keys(patches)) updatePatch(code, { reviewed: true });
              }}
            >
              تحديد الكل كمراجَع
            </Button>
          </div>

          <DataTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.code}
            searchPlaceholder="ابحث برمز المؤشر أو نصه أو المعيار…"
            emptyMessage="لا توجد مؤشرات."
            filters={[
              {
                key: "level",
                label: "المستوى",
                options: [
                  ...PERFORMANCE_LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] })),
                  { value: "none", label: "غير متوفر" },
                ],
                test: (r, v) => (v === "none" ? r.level === null : r.level === v),
              },
              {
                key: "presence",
                label: "الحالة",
                options: [
                  { value: "present", label: "ورد في الملف" },
                  { value: "missing", label: "غير متوفر" },
                  { value: "reviewed", label: "تمت مراجعته" },
                ],
                test: (r, v) =>
                  v === "present"
                    ? r.presentInFile
                    : v === "missing"
                      ? r.percent === null
                      : r.reviewed,
              },
            ]}
          />
        </CardContent>
      </Card>

      {/* شريط الحفظ */}
      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white/95 p-3 shadow-lg backdrop-blur">
        <span className="text-xs text-slate-600">
          {dirty ? "لديك تعديلات غير محفوظة." : "كل التعديلات محفوظة."}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <ExportToolbar analysisId={analysisId} onSave={handleSave} saving={saving} dirty={dirty} />
          {status !== "approved" && (
            <Button type="button" variant="default" onClick={() => void handleApprove()} disabled={saving}>
              <Save className="size-4" aria-hidden />
              حفظ واعتماد التحليل
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export type { SchoolFieldKey };