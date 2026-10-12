"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bot, ListFilter, Plus, Sparkles, TriangleAlert, UserCog } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LevelBadge, PercentValue, SourceChip } from "@/components/common/level-badge";
import { DataTable, type Column } from "@/components/tables/data-table";
import { ExportToolbar } from "./export-toolbar";
import { PERFORMANCE_LEVELS, LEVEL_LABEL, type PerformanceLevel } from "@/lib/domain/levels";
import { LEVEL_SOURCE_LABEL, VALUE_SOURCE_LABEL } from "@/lib/export/bundle";
import type { IndicatorResult } from "@/lib/analysis/compute";
import type { Recommendation } from "@/lib/recommendations/rules";

export interface IndicatorsWorkspaceProps {
  analysisId: string;
  indicators: IndicatorResult[];
  recommendations: Record<string, Recommendation>;
  aiEnabled: boolean;
  aiReason: string;
}

type Row = IndicatorResult & { rec?: Recommendation };

/** تحليل المؤشرات: جدول قابل للبحث مع بطاقة توصية كاملة لكل مؤشر. */
export function IndicatorsWorkspace({
  analysisId,
  indicators,
  recommendations,
  aiEnabled,
  aiReason,
}: IndicatorsWorkspaceProps) {
  const router = useRouter();
  const params = useSearchParams();
  const initialDomain = params.get("domain");
  const initialCode = params.get("code");

  const [domainFilter, setDomainFilter] = useState<string>(initialDomain ?? "all");
  const [selectedCode, setSelectedCode] = useState<string | null>(initialCode);
  const [planDialog, setPlanDialog] = useState(false);
  const [aiPayload, setAiPayload] = useState<Record<string, string> | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const rows = useMemo<Row[]>(
    () =>
      indicators.map((i) => ({
        ...i,
        rec: recommendations[i.code],
      })),
    [indicators, recommendations],
  );

  const filtered = useMemo(
    () => (domainFilter === "all" ? rows : rows.filter((r) => String(r.domainId) === domainFilter)),
    [rows, domainFilter],
  );

  const selected = rows.find((r) => r.code === selectedCode) ?? null;

  const columns: Column<Row>[] = [
    {
      key: "code",
      header: "المؤشر",
      sortValue: (r) => r.code,
      searchValue: (r) => `${r.code} ${r.text} ${r.criterionName} ${r.domainName}`,
      render: (r) => (
        <div>
          <span className="num font-bold text-brand">{r.code}</span>
          <p className="mt-0.5 max-w-[20rem] text-xs leading-snug text-slate-700">{r.text}</p>
        </div>
      ),
    },
    {
      key: "domain",
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
      header: "النسبة",
      sortValue: (r) => r.percent,
      render: (r) => (
        <div>
          <PercentValue value={r.percent} />
          <div className="mt-0.5">
            <SourceChip label={VALUE_SOURCE_LABEL[r.percentSource]} />
          </div>
        </div>
      ),
    },
    {
      key: "level",
      header: "المستوى",
      sortValue: (r) => r.level ?? "zzz",
      render: (r) => (
        <div>
          <LevelBadge level={r.level} levelSource={r.levelSource} />
          <p className="mt-0.5 text-[10px] text-slate-400">{LEVEL_SOURCE_LABEL[r.levelSource]}</p>
        </div>
      ),
    },
    {
      key: "gap",
      header: "فجوة الأداء",
      hideOnMobile: true,
      render: (r) =>
        r.rec ? (
          <p className="max-w-[20rem] text-[11px] leading-snug text-slate-600">{r.rec.gap}</p>
        ) : (
          <span className="text-[10px] text-slate-400">—</span>
        ),
    },
    {
      key: "target",
      header: "المستهدف المقترح",
      sortValue: (r) => r.rec?.proposedTargetPercent ?? null,
      render: (r) =>
        r.rec?.proposedTargetPercent == null ? (
          <span className="not-available">غير متوفر</span>
        ) : (
          <div>
            <span className="num font-semibold text-navy">{r.rec.proposedTargetPercent}%</span>
            <p className="mt-0.5 max-w-[16rem] text-[10px] leading-snug text-slate-500">
              {r.rec.targetRationale}
            </p>
          </div>
        ),
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <Button size="sm" variant="outline" onClick={() => setSelectedCode(r.code)}>
          التفاصيل
        </Button>
      ),
    },
  ];

  async function addToPlan(code: string) {
    setPlanDialog(false);
    try {
      const res = await fetch(`/api/analyses/${analysisId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createFromIndicator", code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "تعذّر إضافة المؤشر إلى الخطة.");
      toast.success(`تمت إضافة المؤشر ${code} إلى خطة التحسين. يمكنك تعديله من صفحة الخطة.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر إضافة المؤشر إلى الخطة.");
    }
  }

  async function generateAi() {
    if (!selected) return;
    setAiLoading(true);
    setAiPayload(null);
    try {
      const res = await fetch(`/api/analyses/${analysisId}/recommendations/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes: [selected.code] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "تعذّر الاتصال بالخدمة.");
      const item = data.items?.[selected.code];
      if (item?.ai?.ok) {
        const p = item.ai.payload;
        setAiPayload({
          "نقاط القوة": (p.strengths ?? []).join(" • "),
          "فجوة الأداء": p.gap,
          "هدف التحسين": p.target,
          "الإجراءات التنفيذية": (p.actions ?? []).map((a: string, i: number) => `${i + 1}) ${a}`).join("\n"),
          "مسؤول التنفيذ": p.owner,
          "مدة التنفيذ": p.duration,
          "مؤشر قياس الأداء": p.measure,
          "أداة القياس": p.tool,
          "الشواهد المطلوبة": (p.evidence ?? []).join(" • "),
          "آلية المتابعة": p.followUp,
        });
        toast.success(`وصل مقترح نصي من ${item.ai.model}. الأرقام تبقى من محرّك القواعد.`);
      } else {
        toast.warning(item?.ai?.reason ?? data.notice ?? "لم يتوفر مقترح ذكي.");
        setAiPayload(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر الاتصال بالخدمة.");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Alert className={aiEnabled ? "border-violet-300 bg-violet-50" : "border-border bg-slate-50"}>
        {aiEnabled ? <Sparkles className="size-4" /> : <TriangleAlert className="size-4" />}
        <AlertTitle>{aiEnabled ? "خدمة الذكاء الاصطناعي مفعّلة" : "التوصيات من محرّك القواعد"}</AlertTitle>
        <AlertDescription className="text-xs">
          {aiEnabled
            ? "يمكنك توليد مقترحات نصية إضافية. تبقى الأرقام (خط الأساس والمستهدف) من محرّك القواعد وحده، ولا يعدّل النموذج أي قيمة."
            : `${aiReason} المنصة تعمل بكامل وظائفها وتعرض توصيات قائمة على قواعد قابلة للتعديل، دون ادعاء أي تحليل ذكي.`}
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <ListFilter className="size-4" aria-hidden />
          المجال:
        </div>
        <Button
          size="sm"
          variant={domainFilter === "all" ? "default" : "outline"}
          onClick={() => setDomainFilter("all")}
        >
          الكل
        </Button>
        {[1, 2, 3, 4].map((d) => (
          <Button
            key={d}
            size="sm"
            variant={domainFilter === String(d) ? "default" : "outline"}
            onClick={() => setDomainFilter(String(d))}
          >
            {rows.find((r) => r.domainId === d)?.domainName ?? `المجال ${d}`}
          </Button>
        ))}
        <ExportToolbar analysisId={analysisId} />
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        rowKey={(r) => r.code}
        searchPlaceholder="ابحث برمز المؤشر أو نصه أو المعيار…"
        initialSort={{ key: "percent", direction: "asc" }}
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
        ]}
      />

      {/* بطاقة تفاصيل المؤشر */}
      <Dialog open={Boolean(selected)} onOpenChange={(o) => !o && setSelectedCode(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" dir="rtl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="text-navy">
                  {selected.code} — {selected.text}
                </DialogTitle>
                <DialogDescription>
                  {selected.domainName} — {selected.criterionName} | المصدر: {selected.source.label}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-2">
                <PercentValue value={selected.percent} />
                <LevelBadge level={selected.level} levelSource={selected.levelSource} size="md" />
                <SourceChip label={VALUE_SOURCE_LABEL[selected.percentSource]} />
                <SourceChip label={LEVEL_SOURCE_LABEL[selected.levelSource]} />
              </div>

              {selected.rec ? <RecommendationDetails rec={selected.rec} /> : null}

              {aiPayload && (
                <Card className="border-violet-200 bg-violet-50/40">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-violet-800">
                      <Bot className="size-4" aria-hidden />
                      مقترح الذكاء الاصطناعي (نصي)
                    </CardTitle>
                    <CardDescription className="text-xs">
                      مقترح مبدئي يحتاج مراجعة المدرسة واعتماده. لم يغيّر أي رقم في التحليل.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {Object.entries(aiPayload).map(([k, v]) => (
                      <div key={k}>
                        <Label className="text-xs font-semibold text-violet-900">{k}</Label>
                        <Textarea readOnly value={v} rows={2} className="mt-0.5 text-xs" />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <DialogFooter className="flex-wrap gap-2">
                <Button variant="outline" onClick={() => void generateAi()} disabled={aiLoading}>
                  <Sparkles className="size-4" aria-hidden />
                  {aiLoading ? "جارٍ التوليد…" : "توليد مقترح ذكي"}
                </Button>
                <Button onClick={() => setPlanDialog(true)}>
                  <Plus className="size-4" aria-hidden />
                  تحويل إلى بند في خطة التحسين
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* تأكيد الإضافة إلى الخطة */}
      <Dialog open={planDialog} onOpenChange={setPlanDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تحويل المؤشر إلى بند خطة</DialogTitle>
            <DialogDescription>
              ستُنشأ خطة تنفيذية من توصية هذا المؤشر مع خط الأساس والمستهدف المقترح. كل الحقول قابلة
              للتعديل في صفحة «خطة التحسين»، ولا يُعتمد المستهدف إلا بعد موافقة المدرسة.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialog(false)}>
              إلغاء
            </Button>
            <Button onClick={() => selected && void addToPlan(selected.code)}>
              <UserCog className="size-4" aria-hidden />
              إنشاء البند
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** بطاقة تعرض كل حقول التوصية المطلوبة للمؤشر. */
export function RecommendationDetails({ rec }: { rec: Recommendation }) {
  const fields: { label: string; content: React.ReactNode }[] = [
    { label: "نقاط القوة", content: <p className="text-sm">{rec.strengths.join(" • ")}</p> },
    { label: "فجوة الأداء", content: <p className="text-sm">{rec.gap}</p> },
    {
      label: "هدف التحسين",
      content: (
        <div className="text-sm">
          <p>{rec.target}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{rec.targetRationale}</p>
        </div>
      ),
    },
    {
      label: "الإجراءات التنفيذية",
      content: (
        <ol className="list-inside list-decimal space-y-0.5 text-sm">
          {rec.actions.map((a, i) => (
            <li key={`${rec.indicatorCode}-action-${i}`}>{a}</li>
          ))}
        </ol>
      ),
    },
    { label: "مسؤول التنفيذ", content: <p className="text-sm">{rec.owner}</p> },
    { label: "مدة التنفيذ", content: <p className="text-sm">{rec.duration}</p> },
    { label: "مؤشر قياس الأداء", content: <p className="text-sm">{rec.measure}</p> },
    { label: "خط الأساس", content: <p className="text-sm">{rec.baseline}</p> },
    {
      label: "المستهدف المقترح",
      content:
        rec.proposedTargetPercent === null ? (
          <span className="not-available">غير متاح قبل تحديد خط الأساس</span>
        ) : (
          <p className="text-sm">
            <span className="num font-bold text-navy">{rec.proposedTargetPercent}%</span>{" "}
            <span className="text-[11px] text-slate-500">
              — مقترح قابل للتعديل، يُعتمد من المدرسة، ولا يُفترض تحقيق 100%
            </span>
          </p>
        ),
    },
    { label: "أداة القياس", content: <p className="text-sm">{rec.tool}</p> },
    {
      label: "الشواهد المطلوبة",
      content: (
        <ul className="list-inside list-disc text-sm">
          {rec.evidence.map((e, i) => (
            <li key={`${rec.indicatorCode}-evidence-${i}`}>{e}</li>
          ))}
        </ul>
      ),
    },
    { label: "آلية المتابعة", content: <p className="text-sm">{rec.followUp}</p> },
    { label: "حالة التنفيذ", content: <p className="text-sm">لم يبدأ</p> },
  ];

  return (
    <dl className="divide-y divide-border rounded-lg border border-border">
      {fields.map((field) => (
        <div key={field.label} className="grid gap-1 p-3 sm:grid-cols-[160px_1fr] sm:gap-3">
          <dt className="text-xs font-bold text-navy">{field.label}</dt>
          <dd className="text-slate-700">{field.content}</dd>
        </div>
      ))}
      <div className="p-3">
        <p className="text-[10px] leading-relaxed text-slate-400">{rec.disclaimer}</p>
        <p className="mt-1 text-[10px] text-slate-400">
          المصدر: {rec.evidenceRefs.map((r) => r.label).join(" — ")} | قاعدة التوليد: {rec.ruleId} |{" "}
          {rec.origin === "ai" ? "مقترح ذكاء اصطناعي" : "قائمة على قواعد"}
        </p>
      </div>
    </dl>
  );
}

export type { PerformanceLevel };