"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Image as ImageIcon, RotateCcw, Save, ShieldAlert, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  LEVEL_META,
  PERFORMANCE_LEVELS,
  describeThresholds,
  validateThresholds,
  type LevelThresholds,
} from "@/lib/domain/levels";
import type { RulesSettings } from "@/lib/recommendations/rules";
import { describeAiAvailability } from "@/lib/ai-status-client";

interface SettingsPayload {
  thresholds: LevelThresholds;
  rules: RulesSettings;
  logo: { uploaded: boolean; originalName: string | null };
  validation: { valid: boolean; reason: string };
}

/**
 * لوحة الإعدادات الإدارية:
 * حدود مستويات الأداء مع توثيق المرجع وإصداره، وقواعد التوصيات، وشعار الوزارة.
 */
export function SettingsWorkspace() {
  const router = useRouter();
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [thresholds, setThresholds] = useState<LevelThresholds | null>(null);
  const [rules, setRules] = useState<RulesSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiNote, setAiNote] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const json = (await res.json()) as SettingsPayload;
      setData(json);
      setThresholds(json.thresholds);
      setRules(json.rules);
      void describeAiAvailability().then(setAiNote);
    })();
  }, []);

  const validation = thresholds ? validateThresholds(thresholds) : { valid: true, reason: "" };

  async function save() {
    if (!thresholds || !rules) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thresholds, rules }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "تعذّر حفظ الإعدادات.");
      toast.success("تم حفظ الإعدادات. ستتحدث الخريطة الحرارية والمخططات في كل التحليلات.");
      setData((prev) => (prev ? { ...prev, thresholds, rules, validation } : prev));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر حفظ الإعدادات.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("logo", file);
      const res = await fetch("/api/settings", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "تعذّر رفع الشعار.");
      toast.success("تم رفع الشعار الرسمي وسيظهر في ترويسة المنصة والتقرير.");
      setData((prev) => (prev ? { ...prev, logo: { uploaded: true, originalName: json.originalName } } : prev));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر رفع الشعار.");
    } finally {
      setUploading(false);
    }
  }

  async function removeLogo() {
    setUploading(true);
    try {
      const res = await fetch("/api/settings", { method: "DELETE" });
      if (!res.ok) throw new Error("تعذّر حذف الشعار.");
      toast.success("تم حذف الشعار. ستظهر الترويسة النصية.");
      setData((prev) => (prev ? { ...prev, logo: { uploaded: false, originalName: null } } : prev));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر حذف الشعار.");
    } finally {
      setUploading(false);
    }
  }

  if (!thresholds || !rules || !data) {
    return <p className="text-sm text-slate-500">جارٍ تحميل الإعدادات…</p>;
  }

  return (
    <div className="space-y-5">
      {/* حدود مستويات الأداء */}
      <Card>
        <CardHeader className="bg-gradient-to-l from-brand-soft to-white">
          <CardTitle className="text-navy">حدود مستويات الأداء</CardTitle>
          <CardDescription>
            المنصة لا تضع أي حدود رقمية افتراضية. تُعرض مستويات المؤشرات كما وردت في التقرير ما لم
            تعتمد هنا حدودًا موثّقة بمرجع معتمد وإصداره.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="th-enabled" className="font-semibold">
                تفعيل اشتقاق المستوى من النسبة الرقمية
              </Label>
              <p className="text-xs text-slate-500">
                عند التعطيل يُعرض مستوى المؤشر كما ورد في التقرير فقط، وتبقى النسب مفيدة للمقارنة.
              </p>
            </div>
            <Switch
              id="th-enabled"
              checked={thresholds.enabled}
              onCheckedChange={(v) => setThresholds({ ...thresholds, enabled: v })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <Label htmlFor="th-ref">اسم المرجع المعتمد *</Label>
              <Input
                id="th-ref"
                value={thresholds.referenceName}
                placeholder="مثال: دليل التقويم المدرسي المعتمد"
                onChange={(e) => setThresholds({ ...thresholds, referenceName: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="th-edition">إصدار المرجع *</Label>
              <Input
                id="th-edition"
                value={thresholds.referenceEdition}
                placeholder="مثال: الإصدار الثالث"
                onChange={(e) => setThresholds({ ...thresholds, referenceEdition: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="th-url">رابط المرجع</Label>
              <Input
                id="th-url"
                value={thresholds.referenceUrl}
                placeholder="https://…"
                onChange={(e) => setThresholds({ ...thresholds, referenceUrl: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PERFORMANCE_LEVELS.map((l) => (
              <div key={l} className="rounded-lg border p-3" style={{ borderColor: LEVEL_META[l].color }}>
                <Label htmlFor={`th-${l}`} className="flex items-center gap-1.5 text-xs font-bold" style={{ color: LEVEL_META[l].color }}>
                  <span className="size-2.5 rounded-sm" style={{ backgroundColor: LEVEL_META[l].color }} />
                  {LEVEL_META[l].label}
                </Label>
                <Input
                  id={`th-${l}`}
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={thresholds.min[l] ?? ""}
                  placeholder="غير محدد"
                  disabled={!thresholds.enabled}
                  onChange={(e) =>
                    setThresholds({
                      ...thresholds,
                      min: {
                        ...thresholds.min,
                        [l]: e.target.value === "" ? null : Number(e.target.value),
                      },
                    })
                  }
                  className="mt-1"
                />
              </div>
            ))}
          </div>

          <div>
            <Label htmlFor="th-notes">ملاحظات</Label>
            <Textarea
              id="th-notes"
              value={thresholds.notes}
              rows={2}
              placeholder="مثلًا: تم الاعتماد بناءً على نسخة المرجع المعتمدة من الإدارة."
              onChange={(e) => setThresholds({ ...thresholds, notes: e.target.value })}
              className="mt-1"
            />
          </div>

          {thresholds.enabled && !validation.valid && (
            <Alert variant="destructive">
              <TriangleAlert className="size-4" />
              <AlertTitle>الحدود غير صالحة ولن تُحفظ</AlertTitle>
              <AlertDescription>{validation.reason}</AlertDescription>
            </Alert>
          )}

          <div className="rounded border border-border bg-slate-50 p-3 text-xs text-slate-600">
            <span className="font-bold text-navy">الوصف الحالي: </span>
            {describeThresholds(thresholds)}
          </div>
        </CardContent>
      </Card>

      {/* قواعد التوصيات */}
      <Card>
        <CardHeader className="bg-gradient-to-l from-brand-soft to-white">
          <CardTitle className="text-navy">قواعد التوصيات</CardTitle>
          <CardDescription>
            تُستخدم عند غياب حدود رقمية معتمدة. القيم مقترحة تشغيلية قابلة للتعديل، وليست حدودًا رسمية.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PERFORMANCE_LEVELS.map((l) => (
              <div key={l}>
                <Label htmlFor={`gain-${l}`} className="text-xs">
                  الزيادة المقترحة من «{LEVEL_META[l].label}» (نقاط مئوية)
                </Label>
                <Input
                  id={`gain-${l}`}
                  type="number"
                  min={0}
                  max={60}
                  value={rules.suggestedGainByLevel[l]}
                  onChange={(e) =>
                    setRules({
                      ...rules,
                      suggestedGainByLevel: { ...rules.suggestedGainByLevel, [l]: Number(e.target.value) },
                    })
                  }
                  className="mt-1"
                />
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="max-target">الحد الأعلى للمستهدف المقترح</Label>
              <Input
                id="max-target"
                type="number"
                min={50}
                max={100}
                value={rules.maxSuggestedTarget}
                onChange={(e) => setRules({ ...rules, maxSuggestedTarget: Number(e.target.value) })}
                className="mt-1"
              />
              <p className="mt-1 text-[10px] text-slate-500">يمنع اقتراح تجاوز 100% أو اقتراح هدف غير واقعي.</p>
            </div>
            <div>
              <Label htmlFor="duration">مدة التنفيذ الافتراضية</Label>
              <Input
                id="duration"
                value={rules.defaultDuration}
                onChange={(e) => setRules({ ...rules, defaultDuration: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={rules.useReportAdvice}
                  onCheckedChange={(v) => setRules({ ...rules, useReportAdvice: v })}
                />
                إدراج «مقترح التحسين» الوارد في التقرير
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={rules.proposeMeasurementWhenMissing}
                  onCheckedChange={(v) => setRules({ ...rules, proposeMeasurementWhenMissing: v })}
                />
                اقتراح توصية قياس للمؤشرات بلا نسبة
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* الشعار */}
      <Card>
        <CardHeader className="bg-gradient-to-l from-brand-soft to-white">
          <CardTitle className="text-navy">شعار وزارة التعليم</CardTitle>
          <CardDescription>
            المنصة لا تتضمّن أي شعار غير معتمد. يظهر البديل النصي حتى يرفع المسؤول الشعار الرسمي.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.logo.uploaded ? (
            <div className="flex flex-wrap items-center gap-3 rounded border border-green-300 bg-green-50 p-3">
              <ImageIcon className="size-5 text-green-700" aria-hidden />
              <span className="text-sm text-green-900">
                الشعار المرفوع: <span className="font-bold">{data.logo.originalName}</span>
              </span>
              <Button variant="outline" size="sm" onClick={() => void removeLogo()} disabled={uploading}>
                حذف الشعار
              </Button>
            </div>
          ) : (
            <Alert>
              <ShieldAlert className="size-4" />
              <AlertTitle>لم يُرفع شعار بعد</AlertTitle>
              <AlertDescription className="text-xs">
                تُعرض حاليًا ترويسة نصية فقط. ارفع الشعار الرسمي المعتمد بصيغة PNG أو JPG أو SVG.
              </AlertDescription>
            </Alert>
          )}

          <div>
            <Label htmlFor="logo-file" className="text-xs">
              رفع الشعار الرسمي (PNG / JPG / SVG / WebP — حتى 2 ميجابايت)
            </Label>
            <input
              id="logo-file"
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadLogo(file);
              }}
              className="mt-1 block w-full text-xs file:mr-3 file:rounded file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-white"
            />
          </div>
        </CardContent>
      </Card>

      {/* الذكاء الاصطناعي */}
      <Card>
        <CardHeader>
          <CardTitle className="text-navy">الذكاء الاصطناعي (اختياري)</CardTitle>
          <CardDescription>
            يُضبط من متغيرات البيئة على الخادم، ولا يُرسل المفتاح إلى المتصفح إطلاقًا.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">{aiNote}</p>
          <p className="mt-2 text-xs text-slate-500">
            عند غياب الخدمة تستمر المنصة في الاستخراج والحسابات والتصورات، وتعرض توصيات قائمة على قواعد
            دون أن تدّعي تحليلًا ذكيًا غير منفَّذ.
          </p>
        </CardContent>
      </Card>

      {/* شريط الحفظ */}
      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white/95 p-3 shadow-lg backdrop-blur">
        <span className="text-xs text-slate-600">
          {validation.valid ? "الإعدادات صالحة للحفظ." : validation.reason}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setThresholds(data.thresholds);
              setRules(data.rules);
              toast.info("تمت استعادة القيم المحفوظة.");
            }}
          >
            <RotateCcw className="size-4" aria-hidden />
            استعادة
          </Button>
          <Button onClick={() => void save()} disabled={saving || !validation.valid}>
            <Save className="size-4" aria-hidden />
            {saving ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
          </Button>
        </div>
      </div>
    </div>
  );
}