import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  ListChecks,
  Radar as RadarIcon,
  ScanText,
  Settings,
  ShieldCheck,
  Target,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { LEVEL_META, PERFORMANCE_LEVELS, describeThresholds } from "@/lib/domain/levels";
import { TOTAL_INDICATORS, DOMAINS } from "@/lib/domain/catalog";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "الرئيسية",
  description: "منصة وزارة التعليم لتحليل نتائج التقويم المدرسي الخارجي والذاتي وبناء خطط التحسين.",
};

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const settings = await getSettings();
  const [externalCount, selfCount, latest] = await Promise.all([
    prisma.analysis.count({ where: { kind: "external" } }),
    prisma.analysis.count({ where: { kind: "self" } }),
    prisma.analysis.findFirst({ orderBy: { updatedAt: "desc" }, include: { school: true } }),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6">
      {/* بطاقة تعريفية */}
      <section className="panel overflow-hidden">
        <div className="bg-gradient-to-l from-navy to-[#17456f] px-5 py-6 text-white">
          <h1 className="text-xl font-bold sm:text-2xl">
            منصة تحليل نتائج التقويم المدرسي وبناء خطط التحسين
          </h1>
          <p className="mt-1 text-sm text-sky-100">
            {settings.schoolsScope} — إعداد وتصميم: {settings.preparedBy}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white/15 px-3 py-1">
              {DOMAINS.length} مجالات
            </span>
            <span className="rounded-full bg-white/15 px-3 py-1">
              {DOMAINS.reduce((s, d) => s + d.criteria.length, 0)} معايير
            </span>
            <span className="rounded-full bg-white/15 px-3 py-1">{TOTAL_INDICATORS} مؤشرًا</span>
            <span className="rounded-full bg-white/15 px-3 py-1">4 مستويات أداء</span>
          </div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: ClipboardCheck, title: "التقويم المدرسي الخارجي", count: externalCount, href: "/external", hint: "تحليل تقرير الهيئة" },
            { icon: ListChecks, title: "التقويم المدرسي الذاتي", count: selfCount, href: "/self", hint: "تحليل التقويم الذاتي" },
            { icon: Database, title: "سجل التحليلات", count: externalCount + selfCount, href: "/analyses", hint: "استرجاع وتعديل" },
            { icon: Settings, title: "الإعدادات", count: null, href: "/settings", hint: "الحدود والشعار" },
          ].map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className={cn(
                "group flex items-start gap-3 rounded-lg border border-border bg-slate-50 p-4 transition-all",
                "hover:border-brand hover:bg-brand-soft hover:shadow-sm",
              )}
            >
              <span className="rounded-md bg-white p-2 text-brand shadow-sm">
                <card.icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-navy">{card.title}</span>
                <span className="block text-xs text-slate-500">{card.hint}</span>
              </span>
              {card.count !== null && (
                <span className="num rounded-full bg-navy px-2 py-0.5 text-xs font-bold text-white">
                  {card.count}
                </span>
              )}
              <ArrowLeft className="size-4 text-slate-300 transition-colors group-hover:text-brand" aria-hidden />
            </Link>
          ))}
        </div>
      </section>

      {/* القسمان المستقلان */}
      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <SectionCard
          href="/external"
          icon={ClipboardCheck}
          title="1) تحليل تقرير التقويم المدرسي الخارجي"
          description="تقرير هيئة تقويم التعليم والتدريب: يُقرأ بالكامل، ثم تُراجع كل نتيجة وتُصحَّح قبل الاعتماد."
          points={[
            "رفع PDF و XLSX و XLS بالسحب والإفلات",
            "استخراج بيانات المدرسة والمؤشرات مع مرجع الصفحة أو الخلية",
            "تحليل المجالات الأربعة ومستويات الأداء",
            "بناء خطة تحسين قابلة للتنفيذ والمتابعة",
          ]}
          count={externalCount}
        />
        <SectionCard
          href="/self"
          icon={ListChecks}
          title="2) تحليل تقرير التقويم المدرسي الذاتي"
          description="تقرير التقويم الذاتي للمدرسة: يقارن نتائج المدرسة بمعايير التقويم الذاتي ويعالجها بالأدوات نفسها."
          points={[
            "قسم مستقل بالكامل عن القسم الخارجي",
            "نفس أدوات الاستخراج والتحليل والمراجعة",
            "تمييز واضح بين نتيجة التقرير الذاتي والخارجي",
            "تصدير وطباعة التقرير بنفس الأدوات",
          ]}
          count={selfCount}
        />
      </section>

      {/* آخر تحليل */}
      {latest && (
        <section className="panel mt-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="panel-title">آخر تحليل</h2>
              <p className="text-sm text-slate-600">
                {latest.title} — {latest.school.name ?? "اسم المدرسة غير متوفر"}
              </p>
            </div>
            <Link href={`/analyses/${latest.id}`} className={buttonVariants()}>
              فتح لوحة المعلومات
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
          </div>
        </section>
      )}

      {/* قواعد الدقة */}
      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="panel-title mb-3 flex items-center gap-2">
            <ShieldCheck className="size-5 text-brand" aria-hidden />
            قواعد الدقة المطبَّقة في المنصة
          </h2>
          <ul className="space-y-2 text-sm text-slate-700">
            {[
              "لا تُستبدل بيانات التقرير ببيانات افتراضية، وأي معلومة غير موجودة تُعرض «غير متوفرة» مع حقل إدخال يدوي.",
              "لا يُجمع متوسط النسب ولا تُحسب نسبة عامة دون معرفة الأوزان ومنهجية الاحتساب الرسمية.",
              "لا يُعتبر المؤشر المفقود صفرًا، ويظهر كـ«غير متوفر» في كل الجداول والمخططات.",
              "لا تُنسب توصية إلى هيئة تقويم التعليم والتدريب إلا إذا وردت في مرجع معتمد مرفوع.",
              "تُميَّز البيانات المستخرجة (مع مرجعها) عن التوصيات المقترحة (قابلة للتعديل).",
              "تُعرض شاشة مراجعة لكل مؤشر قبل حفظ التحليل واعتماده.",
              "المستهدفات المقترحة قابلة للتعديل، ولا يُفترض تحقيق 100%.",
            ].map((rule) => (
              <li key={rule} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-5">
          <h2 className="panel-title mb-3 flex items-center gap-2">
            <Target className="size-5 text-brand" aria-hidden />
            مستويات الأداء وضبط حدودها
          </h2>
          <p className="mb-3 text-sm text-slate-600">
            مستويات الأداء تُقرأ من التقرير كما وردت. لا تضع المنصة أي حدود رقمية افتراضية؛ إن أرادت
            المدرسة ربط النسبة بالمستوى، تُعتمد الحدود من الإعدادات مع توثيق المرجع وإصداره.
          </p>
          <ul className="grid grid-cols-2 gap-2">
            {PERFORMANCE_LEVELS.map((l) => (
              <li
                key={l}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold"
                style={{
                  backgroundColor: LEVEL_META[l].soft,
                  borderColor: LEVEL_META[l].color,
                  color: LEVEL_META[l].color,
                }}
              >
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: LEVEL_META[l].color }} />
                {LEVEL_META[l].label}
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded border border-border bg-slate-50 p-3 text-xs text-slate-600">
            {describeThresholds(settings.thresholds)}
          </p>
          <Link href="/settings" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}>
            ضبط الحدود والمرجع
          </Link>
        </div>
      </section>

      {/* المزايا */}
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { icon: FileSpreadsheet, title: "قراءة PDF و Excel", text: "قراءة نصية للـ PDF عبر pdfjs، وقراءة XLSX و XLS عبر SheetJS مع مرجع الخلية." },
          { icon: ScanText, title: "تحليل بصري اختياري", text: "قراءة الملفات الممسوحة ضوئيًا داخل المتصفح، مع تنبيه عند ضعف جودة الاستخراج." },
          { icon: RadarIcon, title: "مخططات تفاعلية", text: "أعمدة ودائرة وراداري وخريطة حرارية تتحدث فور تعديل النتائج المعتمدة." },
          { icon: Building2, title: "بطاقات بيانات المدرسة", text: "استخراج البيانات المتاحة مع عرض «غير متوفرة» وإدخال يدوي لما ينقص." },
          { icon: Target, title: "توصيات قابلة للقياس", text: "إجراءات ومسؤول ومدة وشواهد وأداة قياس مرتبطة مباشرة بنتيجة المؤشر ودليله." },
          { icon: Database, title: "حفظ واسترجاع", text: "كل تحليل محفوظ في قاعدة البيانات مع سجل كامل بالتعديلات وتاريخ التحليل." },
        ].map((f) => (
          <div key={f.title} className="panel p-4">
            <f.icon className="size-5 text-brand" aria-hidden />
            <h3 className="mt-2 font-bold text-navy">{f.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">{f.text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

function SectionCard({
  href,
  icon: Icon,
  title,
  description,
  points,
  count,
}: {
  href: string;
  icon: typeof ClipboardCheck;
  title: string;
  description: string;
  points: string[];
  count: number;
}) {
  return (
    <Link
      href={href}
      className="panel group flex flex-col p-5 transition-all hover:border-brand hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-lg bg-brand-soft p-2.5 text-brand">
          <Icon className="size-6" aria-hidden />
        </span>
        <span className="num rounded-full bg-navy px-2.5 py-1 text-xs font-bold text-white">
          {count} تحليل
        </span>
      </div>
      <h2 className="mt-3 font-bold text-navy">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      <ul className="mt-3 flex-1 space-y-1.5 text-xs text-slate-600">
        {points.map((p) => (
          <li key={p} className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">
        رفع ملف وتحليله
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
      </span>
    </Link>
  );
}