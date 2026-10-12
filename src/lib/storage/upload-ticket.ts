/**
 * تذكرة رفع مباشرة إلى تخزين Blob.
 *
 * لماذا نحتاجها؟ حدود دوال Vercel (Serverless) تصل 4.5 ميغابايت فقط،
 * بينما تقارير التقويم المدرسي الحقيقية قد تتجاوز ذلك بكثير. الحل:
 * يرفع المتصفح الملف مباشرةً إلى Blob (بدون مرور بحجم الدالة)،
 * ثم يرسل الخادم رابط الملف فقط ليحلّله.
 */

import { assertSafeKey, getStorageDriver } from "@/lib/storage";

export interface UploadTicket {
  /** رابط موقّع يرفع إليه المتصفح الملف مباشرة */
  uploadUrl: string;
  /** المسار داخل مخزن Blob */
  pathname: string;
  /** نوع المحتوى المسموح */
  contentType: string;
  /** الحد الأقصى بالبايت */
  maxBytes: number;
}

/** أنواع المحتوى المسموح برفعها. */
const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
] as const;

/** يطابق نوع المحتوى إن كان فارغًا أو imprecise (مثل "application/octet-stream"). */
function contentTypeAllowed(declared: string | null | undefined): string | null {
  const value = (declared ?? "").trim().toLowerCase();
  if (!value || value === "application/octet-stream") return null;
  if ((ALLOWED_CONTENT_TYPES as readonly string[]).includes(value)) return value;
  // بعض المتصفحات ترسل نوعًا عامًا مع لاحقة صريحة
  const base = value.split(";")[0].trim();
  if ((ALLOWED_CONTENT_TYPES as readonly string[]).includes(base)) return base;
  return null;
}

/**
 * يصدر تذكرة رفع لملف معيّن.
 * يتحقق أولًا من الحجم ومن نوع المحتوى قبل إصدار الرابط الموقّع.
 */
export async function createUploadTicket(input: {
  pathname: string;
  contentType?: string | null;
  maxBytes: number;
}): Promise<UploadTicket> {
  if (getStorageDriver() !== "blob") {
    throw new Error("الرفع المباشر متاح فقط عند ضبط محرك التخزين على blob.");
  }

  const allowed = contentTypeAllowed(input.contentType);
  if (allowed === null && input.contentType && isRejected(input.contentType)) {
    throw new Error("نوع الملف غير مسموح. الصيغ المدعومة: PDF و XLSX و XLS و CSV.");
  }
  if (!Number.isFinite(input.maxBytes) || input.maxBytes <= 0) {
    throw new Error("حجم الملف غير صالح.");
  }

  const pathname = assertSafeKey(input.pathname);
  const blob = (await import("@vercel/blob")) as unknown as {
    issueSignedToken: (opts: {
      operations?: string[];
      pathname?: string;
      allowedContentTypes?: string[];
      maximumSizeInBytes?: number;
      validUntil?: number;
      addRandomSuffix?: boolean;
      allowOverwrite?: boolean;
    }) => Promise<{ delegationToken: string; clientSigningToken: string; validUntil: number }>;
    presignUrl: (
      token: { clientSigningToken: string; delegationToken: string },
      opts: {
        operation: "put";
        pathname: string;
        access: "public" | "private";
        allowedContentTypes?: string[];
        maximumSizeInBytes?: number;
      },
    ) => Promise<{ presignedUrl: string }>;
  };

  // نسمح بأنواع الملفات المدعومة فقط، ونضع حدّ الحجم على مستوى التذكرة
  // نفسها فيرفض Blob أي ملف أكبر حتى لو تلاعب بالعميل.
  // قيود الرفع تُمرَّر للتذكرة، أما المسار فيُقيَّد عند إصدار الرابط نفسه.
  const allowedTypes = [...ALLOWED_CONTENT_TYPES];

  const signed = await blob.issueSignedToken({
    operations: ["put"],
    allowedContentTypes: allowedTypes,
    maximumSizeInBytes: input.maxBytes,
    validUntil: Date.now() + 15 * 60 * 1000,
  });

  const { presignedUrl } = await blob.presignUrl(signed, {
    operation: "put",
    pathname,
    access: "private",
    allowedContentTypes: allowedTypes,
    maximumSizeInBytes: input.maxBytes,
  });

  return {
    uploadUrl: presignedUrl,
    pathname,
    contentType: allowed ?? "application/octet-stream",
    maxBytes: input.maxBytes,
  };
}

/** هل هذا النوع مرفوض صراحةً (معروف وغير ضمن القائمة المسموحة)؟ */
function isRejected(declared: string): boolean {
  const value = declared.trim().toLowerCase();
  const base = value.split(";")[0].trim();
  return !(
    (ALLOWED_CONTENT_TYPES as readonly string[]).includes(base) &&
    (ALLOWED_CONTENT_TYPES as readonly string[]).includes(value)
  );
}

export { ALLOWED_CONTENT_TYPES };