import Link from "next/link";
import Image from "next/image";
import { Landmark, ShieldCheck } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { signFileToken } from "@/lib/storage";
import { NavLinks } from "./nav-links";

/**
 * رأس المنصة: يعرض الترويسة الرسمية كما طُلبت.
 * الشعار يظهر فقط عند رفع شعار معتمد من المسؤول؛
 * لا تتضمّن المنصة أي شعار غير معتمد.
 */
export async function SiteHeader() {
  const settings = await getSettings();
  const logoUrl = settings.logoStorageKey
    ? `/api/brand/logo?token=${encodeURIComponent(signFileToken(settings.logoStorageKey))}`
    : null;

  return (
    <header className="moe-header no-print">
      <div className="mx-auto w-full max-w-[1400px] px-4">
        <div className="flex flex-col items-center gap-3 py-4 text-center lg:flex-row lg:gap-6 lg:py-5 lg:text-right">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt="شعار وزارة التعليم"
              width={150}
              height={54}
              className="h-12 w-auto shrink-0 rounded bg-white/95 p-1 object-contain"
              unoptimized
              priority
            />
          ) : (
            <div
              className="flex h-12 w-[150px] shrink-0 items-center justify-center gap-2 rounded bg-white/10 text-white/80"
              title="لم يُرفع شعار الوزارة بعد — يمكن للمسؤول رفعه من صفحة الإعدادات"
            >
              <Landmark className="size-6" aria-hidden />
              <span className="text-[10px] leading-tight">الشعار<br />غير مرفوع</span>
            </div>
          )}

          <div className="flex-1">
            <p className="text-base font-bold tracking-tight sm:text-lg">
              وزارة التعليم — المملكة العربية السعودية
            </p>
            <p className="mt-0.5 text-sm font-semibold text-sky-100 sm:text-base">
              منصة تحليل نتائج التقويم المدرسي وبناء خطط التحسين
            </p>
            <p className="mt-0.5 text-xs text-sky-200/90 sm:text-sm">{settings.schoolsScope}</p>
          </div>

          <p className="shrink-0 text-xs text-sky-100/90 lg:text-left">
            <span className="block font-semibold text-white">إعداد وتصميم</span>
            <span>{settings.preparedBy}</span>
          </p>
        </div>
      </div>

      <div className="moe-header__rule h-[3px] w-full" />

      <NavLinks
        items={[
          { href: "/", label: "الرئيسية" },
          { href: "/external", label: "التقويم الخارجي" },
          { href: "/self", label: "التقويم الذاتي" },
          { href: "/analyses", label: "سجل التحليلات" },
          { href: "/settings", label: "الإعدادات" },
        ]}
      />

      <div className="border-t border-white/10 bg-navy/95">
        <div className="mx-auto flex w-full max-w-[1400px] items-center gap-2 px-4 py-1.5 text-[11px] text-sky-200/80">
          <ShieldCheck className="size-3.5" aria-hidden />
          <span>
            لا تُستبدل بيانات التقرير ببيانات افتراضية، ولا يُعامل المؤشر المفقود كصفر، ولا تُحسب نسبة عامة دون منهجية احتساب معروفة.
          </span>
        </div>
      </div>
    </header>
  );
}

export { Link };