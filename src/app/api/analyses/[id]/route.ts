import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, describeDbError } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { loadFullAnalysis } from "@/lib/services/analysis";
import { buildRecommendation } from "@/lib/recommendations/rules";
import { recordRevision } from "@/lib/services/mutations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IndicatorPatchSchema = z.object({
  percent: z.number().min(0).max(100).nullable(),
  level: z.enum(["tahyea", "intilaq", "taqaddum", "tamayyuz"]).nullable(),
  notes: z.string().max(2000),
  reviewed: z.boolean(),
});

const SchoolSchema = z
  .object({
    name: z.string().max(200).nullable(),
    ministryNo: z.string().max(60).nullable(),
    stage: z.string().max(120).nullable(),
    academicYear: z.string().max(60).nullable(),
    educationOffice: z.string().max(200).nullable(),
    schoolType: z.string().max(120).nullable(),
    gender: z.string().max(60).nullable(),
    principalName: z.string().max(200).nullable(),
    studentsCount: z.number().int().min(0).max(100000).nullable(),
    teachersCount: z.number().int().min(0).max(5000).nullable(),
  })
  .partial();

const BodySchema = z.object({
  school: SchoolSchema.optional(),
  overallPercent: z.number().min(0).max(100).nullable().optional(),
  status: z.enum(["in_review", "approved"]).optional(),
  indicators: z
    .record(z.string().regex(/^[1-4]-[1-5]-[1-9]-[1-9]$/), IndicatorPatchSchema)
    .optional(),
  acceptance: z
    .record(z.string().regex(/^[1-4]-[1-5]-[1-9]-[1-9]$/), IndicatorPatchSchema)
    .optional(),
});

/**
 * حفظ نتائج المراجعة:
 *  - تصحيحات المؤشرات والنسب والمستويات وملاحظات المراجعة
 *  - بيانات المدرسة والنسبة العامة
 *  - اعتماد التوصيات المعدّلة
 * كل تعديل يُسجَّل في سجل التعديلات.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/analyses/[id]">) {
  const { id } = await ctx.params;
  try {
    const body = BodySchema.parse(await request.json());
    const settings = await getSettings();

    /* ---------- 1) تصحيحات المؤشرات ---------- */
    if (body.indicators) {
      for (const [code, patch] of Object.entries(body.indicators)) {
        const existing = await prisma.indicatorResult.findFirst({ where: { analysisId: id, code } });
        if (!existing) continue;

        const nextPercent = patch.percent;
        const nextLevel = patch.level;
        const percentChanged = existing.percent !== nextPercent;

        await prisma.indicatorResult.update({
          where: { id: existing.id },
          data: {
            percent: nextPercent,
            // «إدخال يدوي» فقط عند تغيّر النسبة فعليًا؛ اعتماد المراجعة
            // (reviewed) وحده لا يحوّل قيمة مستخرجة من التقرير إلى قيمة يدوية.
            percentSource: percentChanged
              ? nextPercent === null
                ? "absent"
                : "manual"
              : existing.percentSource,
            level: nextLevel,
            levelSource: nextLevel ? "reported" : "none",
            notes: patch.notes,
            reviewed: patch.reviewed,
            presentInFile: existing.presentInFile || nextPercent !== null,
          },
        });

        const changes: string[] = [];
        if (percentChanged) {
          changes.push(`النسبة: ${existing.percent ?? "غير متوفر"} ← ${nextPercent ?? "غير متوفر"}`);
        }
        if (existing.level !== nextLevel) {
          changes.push(`المستوى: ${existing.level ?? "غير متوفر"} ← ${nextLevel ?? "غير متوفر"}`);
        }
        if (existing.notes !== patch.notes) changes.push("ملاحظات المراجعة");

        if (changes.length > 0) {
          await recordRevision(id, "indicator", existing.id, "percent", changes.join(" | "), settings.preparedBy);
        }
      }
    }

    /* ---------- 2) بيانات المدرسة والنسبة العامة ---------- */
    const analysis = await prisma.analysis.findUnique({ where: { id }, include: { school: true } });
    if (!analysis) return NextResponse.json({ error: "التحليل غير موجود." }, { status: 404 });

    if (body.school && Object.keys(body.school).length > 0) {
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(body.school)) {
        if (v === undefined) continue;
        data[k] = v;
      }
      await prisma.school.update({ where: { id: analysis.schoolId }, data });
      await recordRevision(
        id,
        "school",
        analysis.schoolId,
        "school",
        `تعديل بيانات المدرسة: ${Object.keys(data).join("، ")}`,
        settings.preparedBy,
      );
    }

    if (body.overallPercent !== undefined && body.overallPercent !== analysis.overallPercent) {
      await prisma.analysis.update({
        where: { id },
        data: {
          overallPercent: body.overallPercent,
          overallSource: body.overallPercent === null ? "absent" : "manual",
        },
      });
      await recordRevision(
        id,
        "analysis",
        id,
        "overallPercent",
        `النسبة العامة: ${analysis.overallPercent ?? "غير متوفرة"} ← ${body.overallPercent ?? "غير متوفرة"} (إدخال يدوي)`,
        settings.preparedBy,
      );
    }

    /* ---------- 3) اعتماد التوصيات المعدّلة ---------- */
    if (body.acceptance) {
      for (const [code, patch] of Object.entries(body.acceptance)) {
        const existing = await prisma.indicatorResult.findFirst({ where: { analysisId: id, code } });
        if (!existing) continue;
        const indicator = (await loadFullAnalysis(id))?.indicators.find((i) => i.code === code);
        if (!indicator) continue;

        const merged = { ...indicator, percent: patch.percent, level: patch.level, notes: patch.notes, reviewed: patch.reviewed };
        const recommendation = buildRecommendation(merged, {
          thresholds: settings.thresholds,
          rules: settings.rules,
        });

        await prisma.indicatorResult.update({
          where: { id: existing.id },
          data: {
            recommendationJson: JSON.stringify(recommendation),
            recommendationOrigin: recommendation.origin,
            recommendationApproved: true,
          },
        });
      }
    }

    /* ---------- 4) حالة التحليل ---------- */
    if (body.status && body.status !== analysis.status) {
      await prisma.analysis.update({ where: { id }, data: { status: body.status } });
      await recordRevision(
        id,
        "analysis",
        id,
        "status",
        `الحالة: ${analysis.status} ← ${body.status}`,
        settings.preparedBy,
      );
    }

    const fresh = await loadFullAnalysis(id);
    return NextResponse.json({ ok: true, coverage: fresh?.coverage ?? null });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "بيانات غير صالحة.", details: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: describeDbError(error) }, { status: 500 });
  }
}

/** يعيد التحليل كاملًا (للاستخدام بعد التعديل في العميل). */
export async function GET(_request: Request, ctx: RouteContext<"/api/analyses/[id]">) {
  const { id } = await ctx.params;
  const full = await loadFullAnalysis(id);
  if (!full) return NextResponse.json({ error: "التحليل غير موجود." }, { status: 404 });
  return NextResponse.json({
    ok: true,
    summary: {
      id: full.record.id,
      title: full.record.title,
      kind: full.record.kind,
      status: full.record.status,
      updatedAt: full.record.updatedAt,
    },
    coverage: full.coverage,
    domains: full.domains.map((d) => ({
      id: d.id,
      name: d.name,
      display: d.aggregate.display,
      kind: d.aggregate.kind,
      level: d.level,
      counts: d.counts,
    })),
    priorities: full.priorities.map((p) => ({ code: p.indicator.code, rank: p.rank, reason: p.reason })),
  });
}