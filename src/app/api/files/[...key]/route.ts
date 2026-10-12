import { NextResponse } from "next/server";
import { getObject, mimeFromKey, verifyFileToken } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * تقديم الملف المرفوع عبر مسار محمي.
 *
 * الملفات ليست في مجلد public، ولا تُخدم برابط مباشر. يتطلب كل طلب
 * رمز وصول موقّعًا صالحًا لمدة محدودة، فلا يمكن استكشاف مفاتيح التخزين.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/files/[...key]">,
) {
  const { key: parts } = await ctx.params;
  const key = (Array.isArray(parts) ? parts.join("/") : String(parts ?? "")).replace(/%2F/gi, "/");

  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";

  if (!key || !verifyFileToken(token)) {
    return NextResponse.json(
      { error: "رابط الملف غير صالح أو منتهي الصلاحية. أعد فتح الصفحة لتحديث الرابط." },
      { status: 403 },
    );
  }

  try {
    const object = await getObject(key);
    if (!object) return NextResponse.json({ error: "الملف غير موجود." }, { status: 404 });

    const mime = object.mimeType ?? mimeFromKey(key);
    const downloadName = key.split("/").pop() ?? "ملف";

    return new NextResponse(Buffer.from(object.data), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(object.data.byteLength),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذّر تحميل الملف.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}