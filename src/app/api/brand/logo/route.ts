import { NextResponse } from "next/server";
import { getObject, verifyFileToken } from "@/lib/storage";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * مسار محمي لعرض الشعار المرفوع من لوحة المسؤول.
 * المنصة لا تتضمّن شعارًا غير معتمد؛ وإن لم يُرفع شعار، يظهر البديل النصي.
 */
export async function GET(request: Request) {
  const settings = await getSettings();
  const key = settings.logoStorageKey;
  if (!key) return new NextResponse(null, { status: 404 });

  const url = new URL(request.url);
  const provided = url.searchParams.get("token");
  if (!provided || verifyFileToken(provided) === null) {
    return NextResponse.json({ error: "رابط الشعار غير صالح أو منتهي الصلاحية." }, { status: 403 });
  }

  const object = await getObject(key).catch(() => null);
  if (!object) return new NextResponse(null, { status: 404 });

  return new NextResponse(Buffer.from(object.data), {
    headers: {
      "Content-Type": object.mimeType,
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}