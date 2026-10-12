import { NextResponse } from "next/server";
import { getAiAvailability } from "@/lib/ai/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * حالة خدمة الذكاء الاصطناعي.
 * تُعرض في الواجهة لتوضيح ما إذا كانت التوصيات ستأتي من القواعد أم من الذكاء الاصطناعي،
 * دون ادعاء أي تحليل ذكي غير منفَّذ.
 */
export async function GET() {
  const ai = getAiAvailability();
  return NextResponse.json({
    ai,
    message: ai.enabled
      ? "خدمة الذكاء الاصطناعي مفعّلة. يمكن توليد مقترحات إضافية، وتبقى الأرقام من محرّك القواعد وحده."
      : `الذكاء الاصطناعي غير متاح حاليًا (${ai.reason}) المنصة تعمل بكامل وظائفها وتعرض توصيات قائمة على قواعد.`,
  });
}