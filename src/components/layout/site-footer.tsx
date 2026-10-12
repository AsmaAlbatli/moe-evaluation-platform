/** تذييل المنصة — يوضّح مصدر البيانات وقواعد الدقة المعتمدة. */
export function SiteFooter() {
  return (
    <footer className="no-print mt-8 border-t border-border bg-white">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 text-xs text-slate-600">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="font-bold text-navy">وزارة التعليم — المملكة العربية السعودية</p>
            <p className="mt-1">
              منصة تحليل نتائج التقويم المدرسي وبناء خطط التحسين — {""}
              <span className="font-semibold">مدارس النطاق الثالث</span>
            </p>
          </div>
          <div>
            <p className="font-bold text-navy">إعداد وتصميم</p>
            <p className="mt-1">المشرفة أسماء الباتلي</p>
          </div>
          <div>
            <p className="font-bold text-navy">قواعد الدقة المطبَّقة</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>لا تُستبدل بيانات التقرير ببيانات افتراضية.</li>
              <li>لا يُعتبر المؤشر المفقود صفرًا.</li>
              <li>تُميَّز التوصيات المقترحة عن البيانات المستخرجة.</li>
            </ul>
          </div>
        </div>
        <p className="mt-4 border-t border-border pt-3 text-[11px] text-slate-400">
          جميع النتائج المستخرجة تُعرض مع مرجعها من الملف (رقم الصفحة أو الخلية). المستهدفات المقترحة
          قابلة للتعديل ولا تُعتمد إلا بعد مراجعة المدرسة.
        </p>
      </div>
    </footer>
  );
}