import { LEVEL_META, type PerformanceLevel } from "@/lib/domain/levels";
import { cn } from "@/lib/utils";

/** شارة مستوى الأداء بالألوان المعتمدة: أحمر ← برتقالي ← أزرق ← أخضر. */
export function LevelBadge({
  level,
  levelSource,
  size = "sm",
  className,
}: {
  level: PerformanceLevel | null;
  levelSource?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  if (!level) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border border-dashed border-slate-300 bg-slate-50 font-semibold text-slate-400",
          size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
          className,
        )}
        title={
          levelSource === "thresholds"
            ? "لم يرد المستوى في التقرير، ولم تعتمد الإدارة حدودًا رقمية لاشتقاقه"
            : "لم يرد المستوى في التقرير ولم تُعتمد حدود رقمية"
        }
      >
        المستوى غير متوفر
      </span>
    );
  }

  const meta = LEVEL_META[level];
  const title =
    levelSource === "thresholds"
      ? "مستوى مشتق من حدود رقمية معتمدة في الإعدادات (لم يرد في التقرير)"
      : "المستوى كما ورد في التقرير";

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        className,
      )}
      style={{ backgroundColor: meta.soft, color: meta.color, borderColor: meta.color }}
    >
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ backgroundColor: meta.color }}
      />
      {meta.label}
    </span>
  );
}

/** يعرض النسبة الفعلية أو «غير متوفر» — لا يعرض صفرًا لمؤشر غير موجود. */
export function PercentValue({
  value,
  source,
  className,
}: {
  value: number | null;
  source?: "extracted" | "manual" | "absent";
  className?: string;
}) {
  if (value === null) {
    return (
      <span className="not-available" title="لم ترد نسبة لهذا المؤشر في الملف، ولم تُدخل من المدرسة">
        غير متوفر
      </span>
    );
  }
  const formatted = `${value}%`;
  const label = source === "manual" ? " (إدخال يدوي)" : source === "extracted" ? " (من التقرير)" : "";
  return (
    <span className={cn("num font-semibold text-navy", className)} title={label.trim() || undefined}>
      {formatted}
    </span>
  );
}

/** تمييز مصدر البيانات: مستخرج من التقرير أم يدوي أم غير متوفر. */
export function SourceChip({ label }: { label: string }) {
  const manual = label.includes("يدوي");
  const none = label.includes("غير متوفر");
  return (
    <span
      className={cn(
        "inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium",
        manual
          ? "border-amber-300 bg-amber-50 text-amber-700"
          : none
            ? "border-slate-200 bg-slate-50 text-slate-400"
            : "border-sky-200 bg-sky-50 text-sky-700",
      )}
    >
      {label}
    </span>
  );
}