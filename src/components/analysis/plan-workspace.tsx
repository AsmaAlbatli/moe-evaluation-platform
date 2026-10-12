"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, CircleSlash, Plus, Target, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SimpleProgress } from "@/components/common/simple-progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ExportToolbar } from "./export-toolbar";
import { DataTable, type Column } from "@/components/tables/data-table";
import type { IndicatorResult } from "@/lib/analysis/compute";
import type { PlanRow } from "@/lib/services/analysis";

const STATUS_LABEL: Record<string, string> = {
  not_started: "لم يبدأ",
  in_progress: "قيد التنفيذ",
  done: "منجز",
  blocked: "متوقف",
};

/** يحسب نسبة الإنجاز من خط الأساس والمستهدف والنسبة المحققة. */
export function computeCompletion(p: {
  baseline: string | null;
  target: number | null;
  actual: number | null;
  status: string;
}): number | null {
  if (p.status === "done") return 100;
  if (p.actual === null || p.target === null) return null;
  const baseline = Number.parseFloat(p.baseline ?? "");
  if (!Number.isFinite(baseline) || p.target <= baseline) return null;
  const ratio = ((p.actual - baseline) / (p.target - baseline)) * 100;
  return Math.max(0, Math.min(100, Math.round(ratio)));
}

export interface PlanWorkspaceProps {
  analysisId: string;
  plans: PlanRow[];
  indicators: IndicatorResult[];
}

type Row = PlanRow & { completion: number | null };

/** قسم خطة التحسين: اختيار الأولويات، تحويلها إلى بنود، ومتابعة نسب الإنجاز. */
export function PlanWorkspace({ analysisId, plans, indicators }: PlanWorkspaceProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);

  const rows = useMemo(
    () => plans.map((p) => ({ ...p, completion: computeCompletion(p) })),
    [plans],
  );

  const summary = useMemo(() => {
    const total = rows.length;
    const done = rows.filter((r) => r.status === "done").length;
    const inProgress = rows.filter((r) => r.status === "in_progress").length;
    const blocked = rows.filter((r) => r.status === "blocked").length;
    const withCompletion = rows.filter((r) => r.completion !== null);
    const avg = withCompletion.length
      ? Math.round(withCompletion.reduce((a, r) => a + (r.completion ?? 0), 0) / withCompletion.length)
      : null;
    return { total, done, inProgress, blocked, avg };
  }, [rows]);

  async function patch(planId: string, body: Record<string, unknown>) {
    setBusyId(planId);
    try {
      const res = await fetch(`/api/analyses/${analysisId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", planId, patch: body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "تعذّر حفظ التعديل.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر حفظ التعديل.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(planId: string) {
    setBusyId(planId);
    try {
      const res = await fetch(`/api/analyses/${analysisId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", planId }),
      });
      if (!res.ok) throw new Error("تعذّر حذف البند.");
      toast.success("تم حذف بند الخطة.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر حذف البند.");
    } finally {
      setBusyId(null);
    }
  }

  async function addFromCode(code: string) {
    setBusyId(code);
    try {
      const res = await fetch(`/api/analyses/${analysisId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createFromIndicator", code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "تعذّر إضافة المؤشر.");
      toast.success(`تمت إضافة ${code} إلى الخطة.`);
      setSelectedCodes((prev) => prev.filter((c) => c !== code));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر إضافة المؤشر.");
    } finally {
      setBusyId(null);
    }
  }

  const plannedCodes = new Set(plans.map((p) => p.indicatorCode).filter(Boolean));
  const availableIndicators = indicators.filter(
    (i) => i.percent !== null || i.level !== null,
  );

  const columns: Column<Row>[] = [
    {
      key: "indicator",
      header: "المؤشر / البند",
      sortValue: (r) => r.indicatorCode ?? "",
      searchValue: (r) => `${r.indicatorCode ?? ""} ${r.title} ${r.owner}`,
      render: (r) => (
        <div className="min-w-[16rem]">
          <p className="num text-xs font-bold text-brand">{r.indicatorCode ?? "بند مستقل"}</p>
          <p className="text-xs text-slate-700">{r.title}</p>
        </div>
      ),
    },
    {
      key: "actions",
      header: "الإجراءات",
      hideOnMobile: true,
      render: (r) => (
        <ul className="list-inside list-disc max-w-[22rem] text-[11px] leading-snug text-slate-600">
          {r.actions.slice(0, 3).map((a, i) => (
            <li key={i}>{a}</li>
          ))}
          {r.actions.length > 3 && <li className="text-slate-400">وغيرها…</li>}
        </ul>
      ),
    },
    {
      key: "owner",
      header: "المسؤول والمدة",
      render: (r) => (
        <div className="min-w-[10rem] space-y-1">
          <Input
            value={r.owner}
            placeholder="غير محدد"
            aria-label={`مسؤول البند ${r.indicatorCode ?? ""}`}
            onChange={(e) => void patch(r.id, { owner: e.target.value })}
            className="h-8 text-xs"
          />
          <div className="flex gap-1">
            <Input
              type="date"
              value={r.startDate ?? ""}
              aria-label={`تاريخ البداية ${r.indicatorCode ?? ""}`}
              onChange={(e) => void patch(r.id, { startDate: e.target.value || null })}
              className="h-7 text-[11px]"
            />
            <Input
              type="date"
              value={r.endDate ?? ""}
              aria-label={`تاريخ النهاية ${r.indicatorCode ?? ""}`}
              onChange={(e) => void patch(r.id, { endDate: e.target.value || null })}
              className="h-7 text-[11px]"
            />
          </div>
        </div>
      ),
    },
    {
      key: "numbers",
      header: "خط الأساس ← المستهدف ← المحقق",
      render: (r) => (
        <div className="min-w-[13rem] space-y-1">
          <div className="flex items-center gap-1 text-[11px]">
            <span className="w-[4.5rem] text-slate-500">خط الأساس</span>
            <Input
              value={r.baseline ?? ""}
              placeholder="غير متوفر"
              aria-label={`خط الأساس ${r.indicatorCode ?? ""}`}
              onChange={(e) => void patch(r.id, { baseline: e.target.value || null })}
              className="h-7 text-[11px]"
            />
          </div>
          <div className="flex items-center gap-1 text-[11px]">
            <span className="w-[4.5rem] text-slate-500">المستهدف</span>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={r.target ?? ""}
              placeholder="يُعتمد من المدرسة"
              aria-label={`المستهدف ${r.indicatorCode ?? ""}`}
              onChange={(e) =>
                void patch(r.id, { target: e.target.value === "" ? null : Number(e.target.value) })
              }
              className="h-7 text-[11px]"
            />
          </div>
          <div className="flex items-center gap-1 text-[11px]">
            <span className="w-[4.5rem] text-slate-500">المحقق</span>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={r.actual ?? ""}
              placeholder="لا يُملأ إلا بالقياس الفعلي"
              aria-label={`النسبة المحققة ${r.indicatorCode ?? ""}`}
              onChange={(e) =>
                void patch(r.id, { actual: e.target.value === "" ? null : Number(e.target.value) })
              }
              className="h-7 text-[11px]"
            />
          </div>
        </div>
      ),
    },
    {
      key: "completion",
      header: "نسبة الإنجاز",
      sortValue: (r) => r.completion ?? null,
      render: (r) => (
        <div className="min-w-[8rem]">
          <p className="num text-sm font-bold text-navy">
            {r.completion === null ? "—" : `${r.completion}%`}
          </p>
          <SimpleProgress value={r.completion ?? 0} className="h-1.5" />
          <p className="mt-0.5 text-[10px] text-slate-400">
            {r.completion === null ? "تحتاج خط أساس ومستهدف معتمدين" : "محسوبة من خط الأساس"}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      render: (r) => (
        <div className="min-w-[9rem] space-y-1">
          <Select value={r.status} onValueChange={(v) => void patch(r.id, { status: v })}>
            <SelectTrigger className="h-8 text-xs" aria-label={`حالة البند ${r.indicatorCode ?? ""}`}>
              <span className="truncate">{STATUS_LABEL[r.status] ?? r.status}</span>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABEL).map(([k, label]) => (
                <SelectItem key={k} value={k}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            defaultValue={r.progressNote}
            placeholder="المنجزات والشواهد"
            aria-label={`ملاحظات الإنجاز ${r.indicatorCode ?? ""}`}
            onBlur={(e) => {
              if (e.target.value !== r.progressNote) void patch(r.id, { progressNote: e.target.value });
            }}
            rows={2}
            className="min-h-[44px] text-[11px]"
          />
        </div>
      ),
    },
    {
      key: "actions-col",
      header: "",
      render: (r) => (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="حذف البند"
          onClick={() => void remove(r.id)}
          disabled={busyId === r.id}
        >
          <Trash2 className="size-4 text-red-600" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* ملخص الخطة */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "إجمالي البنود", value: summary.total, icon: Target },
          { label: "منجز", value: summary.done, icon: CheckCircle2 },
          { label: "قيد التنفيذ", value: summary.inProgress, icon: CalendarClock },
          { label: "متوقف", value: summary.blocked, icon: CircleSlash },
          { label: "متوسط نسبة الإنجاز", value: summary.avg === null ? "—" : `${summary.avg}%`, icon: UserCog },
        ].map((c) => (
          <div key={c.label} className="panel flex items-center gap-3 p-3">
            <span className="rounded-md bg-brand-soft p-2 text-brand">
              <c.icon className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-[11px] text-slate-500">{c.label}</p>
              <p className="num text-lg font-bold text-navy">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      <Alert>
        <Target className="size-4" />
        <AlertTitle>قواعد المتابعة</AlertTitle>
        <AlertDescription className="text-xs">
          <ul className="list-inside list-disc space-y-0.5">
            <li>النسبة «المحقق» تُملأ بالقياس الفعلي فقط، ولا تُشتق آليًا.</li>
            <li>نسبة الإنجاز تُحسب من خط الأساس إلى المستهدف المعتمد، ولا تُحسب إن كان أحدهما غير متوفر.</li>
            <li>المستهدف لا يُفترض ولا يُضبط تلقائيًا؛ يُعتمد من المدرسة ويمكن تعديله في أي وقت.</li>
            <li>كل تعديل على البند يُسجَّل في سجل التعديلات مع التاريخ.</li>
          </ul>
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setAddOpen(true)} disabled={plannedCodes.size >= indicators.length}>
          <Plus className="size-4" aria-hidden />
          إضافة بنود من المؤشرات
        </Button>
        <ExportToolbar analysisId={analysisId} />
      </div>

      <Card>
        <CardHeader className="bg-gradient-to-l from-brand-soft to-white">
          <CardTitle className="text-navy">بنود خطة التحسين</CardTitle>
          <CardDescription>
            عدّل الأهداف والإجراءات والمسؤوليات والتواريخ، وسجّل المنجزات والشواهد لمتابعة نسب الإنجاز.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.id}
            searchPlaceholder="ابحث في البنود والمسؤولين…"
            emptyMessage="لا توجد بنود في الخطة بعد. ابدأ بإضافة المؤشرات ذات الأولوية."
            filters={[
              {
                key: "status",
                label: "الحالة",
                options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
                test: (r, v) => r.status === v,
              },
            ]}
          />
        </CardContent>
      </Card>

      {/* اختيار المؤشرات ذات الأولوية */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>اختيار المؤشرات ذات الأولوية</DialogTitle>
            <DialogDescription>
              اختر المؤشرات التي تريد تحويلها إلى بنود تنفيذية. تُنشأ الخطة من التوصية الحالية
              للمؤشر، ويمكن تعديل كل حقولها بعد ذلك.
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-1.5">
            {availableIndicators.map((ind) => {
              const already = plannedCodes.has(ind.code);
              return (
                <li
                  key={ind.code}
                  className="flex items-center justify-between gap-3 rounded border border-border p-2"
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      disabled={already}
                      checked={selectedCodes.includes(ind.code)}
                      onChange={(e) =>
                        setSelectedCodes((prev) =>
                          e.target.checked ? [...prev, ind.code] : prev.filter((c) => c !== ind.code),
                        )
                      }
                      className="size-4 shrink-0 accent-[#1769AA]"
                    />
                    <span className="min-w-0">
                      <span className="num text-xs font-bold text-brand">{ind.code}</span>
                      <span className="block truncate text-xs text-slate-700">{ind.text}</span>
                    </span>
                  </label>
                  <span className="shrink-0 text-[11px] text-slate-500">
                    {ind.percent === null ? "غير متوفر" : `${ind.percent}%`}
                  </span>
                  {already && <span className="shrink-0 text-[10px] text-green-600">مضاف بالفعل</span>}
                </li>
              );
            })}
          </ul>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              إغلاق
            </Button>
            <Button
              disabled={selectedCodes.length === 0}
              onClick={async () => {
                for (const code of selectedCodes) await addFromCode(code);
                setSelectedCodes([]);
                setAddOpen(false);
              }}
            >
              إضافة {selectedCodes.length > 0 ? `(${selectedCodes.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { STATUS_LABEL };