"use client";

import { Download, FileSpreadsheet, Printer, Save } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * أزرار الحفظ والطباعة والتصدير.
 * - حفظ: يرسل التعديلات الحالية للخادم.
 * - طباعة: نافذة طباعة A4 من الصفحة الحالية.
 * - تصدير PDF: يفتح تقرير HTML عربي مهيأ للطباعة/الحفظ كـ PDF.
 * - تصدير Excel: ينزّل مصنّفًا متعدد الأوراق.
 */
export function ExportToolbar({
  analysisId,
  onSave,
  saving = false,
  dirty = false,
  className,
}: {
  analysisId: string;
  onSave?: () => void | Promise<void>;
  saving?: boolean;
  dirty?: boolean;
  className?: string;
}) {
  function handlePrint() {
    window.print();
  }

  function handlePdf() {
    const url = `/api/analyses/${analysisId}/export/report?print=1`;
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) {
      toast.error("تعذّر فتح نافذة التقرير. اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.");
      return;
    }
    toast.info("اختر «حفظ كـ PDF» من نافذة الطباعة للحصول على ملف PDF عربي.");
  }

  function handleExcel() {
    // تنزيل مباشر عبر رابط: لا نمرّ عبر موجّه Next حتى لا نكسر تنزيل الملف
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/api/analyses/${analysisId}/export/excel`;
    toast.success("يجري تنزيل ملف Excel متعدد الأوراق.");
  }

  return (
    <div className={cn("no-print flex flex-wrap items-center gap-2", className)}>
      {onSave && (
        <Button type="button" onClick={() => void onSave()} disabled={saving || !dirty} variant={dirty ? "default" : "outline"}>
          <Save className="size-4" aria-hidden />
          {saving ? "جارٍ الحفظ…" : dirty ? "حفظ التعديلات" : "محفوظ"}
        </Button>
      )}

      <Button type="button" variant="outline" onClick={handlePrint}>
        <Printer className="size-4" aria-hidden />
        طباعة A4
      </Button>

      <Button type="button" variant="outline" onClick={handlePdf}>
        <Download className="size-4" aria-hidden />
        تصدير PDF
      </Button>

      <Button type="button" variant="outline" onClick={handleExcel}>
        <FileSpreadsheet className="size-4" aria-hidden />
        تصدير Excel
      </Button>

      <a
        href={`/api/analyses/${analysisId}/export/report?download=1`}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
        title="تنزيل نسخة من التقرير المعتمد بصيغة HTML للطباعة"
      >
        تنزيل نسخة من التقرير
      </a>
    </div>
  );
}