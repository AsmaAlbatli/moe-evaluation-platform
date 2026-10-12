import { cn } from "@/lib/utils";

/**
 * شريط تقدّم بسيط ومحدد.
 *
 * استُخدم بدل مكوّن Progress الجاهز لأن المكوّن الجاهز يضبط سمات
 * `data-progressing` أثناء الحركة، فيختلف ناتج الخادم عن ناتج المتصفح
 * ويسبّب خطأ في الترطيب (hydration). هذا المكوّن يخرج ناتجًا واحدًا
 * متطابقًا من الخادم والمتصفح.
 */
export function SimpleProgress({
  value,
  className,
  barClassName,
  label,
}: {
  /** النسبة من 0 إلى 100 */
  value: number;
  className?: string;
  barClassName?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-slate-200", className)}
    >
      <div
        className={cn("h-full rounded-full bg-brand transition-[width] duration-300", barClassName)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}