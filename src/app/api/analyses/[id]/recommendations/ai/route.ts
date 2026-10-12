import { NextResponse } from "next/server";
import { describeDbError } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { loadFullAnalysis } from "@/lib/services/analysis";
import { buildRecommendation } from "@/lib/recommendations/rules";
import { INDICATOR_BY_CODE } from "@/lib/domain/catalog";
import {
  generateAiRecommendations,
  getAiAvailability,
  type AiResult,
} from "@/lib/ai/client";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const BodySchema = z.object({
  codes: z.array(z.string().regex(/^[1-4]-[1-5]-[1-9]-[1-9]$/)).min(1).max(50),
});

/**
 * توليد مقترحات ذكاء اصطناعي لمؤشرات محددة.
 * يعمل على واجهة متوافقة مع OpenAI والمفتاح محفوظ في الخادم.
 * عند تعذّر الخدمة تُعاد توصيات القواعد مع سبب واضح، دون ادعاء تحليل ذكي.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/analyses/[id]/recommendations/ai">,
) {
  const { id } = await ctx.params;
  try {
    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "طلب غير صالح: يجب إرسال رموز مؤشرات صحيحة." }, { status: 400 });
    }
    const { codes } = parsed.data;

    const availability = getAiAvailability();
    const full = await loadFullAnalysis(id);
    if (!full) return NextResponse.json({ error: "التحليل غير موجود." }, { status: 404 });

    const results = new Map<string, AiResult>();

    if (availability.enabled) {
      const items = codes
        .map((code) => {
          const indicator = full.indicators.find((i) => i.code === code);
          if (!indicator) return null;
          const def = INDICATOR_BY_CODE.get(code);
          return {
            indicator,
            domainName: indicator.domainName,
            criterionName: indicator.criterionName,
            reportAdvice: full.reportAdvice[code] ?? def?.reportAdvice,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      const aiResults = await generateAiRecommendations(items);
      for (const [code, result] of aiResults) results.set(code, result);
    }

    //Regardless: نعيد دائمًا توصيات القواعد، وAI كطبقة اختيارية فوقها.
    const settings = await getSettings();
    const out: Record<
      string,
      { rules: ReturnType<typeof buildRecommendation>; ai: AiResult | null }
    > = {};

    for (const code of codes) {
      const indicator = full.indicators.find((i) => i.code === code);
      if (!indicator) continue;
      out[code] = {
        rules: buildRecommendation(indicator, {
          thresholds: settings.thresholds,
          rules: settings.rules,
          reportAdvice: full.reportAdvice,
        }),
        ai: results.get(code) ?? null,
      };
    }

    const aiFailures = [...results.entries()].filter(([, r]) => !r.ok).map(([, r]) => r);

    return NextResponse.json({
      ok: true,
      ai: availability,
      items: out,
      aiFailures: aiFailures.map((r) => ({ reason: (r as { reason: string }).reason })),
      notice: availability.enabled
        ? "الاقتراحات النصية من الذكاء الاصطناعي مُقترَحة، وتبقى الأرقام من محرّك القواعد."
        : `لم يُستخدم الذكاء الاصطناعي (${availability.reason}) المعروض توصيات قائمة على قواعد فقط.`,
    });
  } catch (error) {
    return NextResponse.json({ error: describeDbError(error) }, { status: 500 });
  }
}