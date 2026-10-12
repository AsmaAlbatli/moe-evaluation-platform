import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, describeDbError } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { loadFullAnalysis, planCompletionPercent } from "@/lib/services/analysis";
import { recordRevision } from "@/lib/services/mutations";
import { buildRecommendation } from "@/lib/recommendations/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  action: z.literal("createFromIndicator"),
  code: z.string().regex(/^[1-4]-[1-5]-[1-9]-[1-9]$/),
  overrides: z
    .object({
      title: z.string().max(300).optional(),
      owner: z.string().max(200).optional(),
      startDate: z.string().max(30).optional(),
      endDate: z.string().max(30).optional(),
      target: z.number().min(0).max(100).nullable().optional(),
      measure: z.string().max(600).optional(),
      tool: z.string().max(400).optional(),
      evidence: z.string().max(1000).optional(),
      followUp: z.string().max(600).optional(),
    })
    .optional(),
});

const UpdateSchema = z.object({
  action: z.literal("update"),
  planId: z.string().min(1),
  patch: z.object({
    title: z.string().max(300).optional(),
    actions: z.array(z.string().max(800)).optional(),
    owner: z.string().max(200).optional(),
    startDate: z.string().max(30).nullable().optional(),
    endDate: z.string().max(30).nullable().optional(),
    baseline: z.string().max(200).nullable().optional(),
    target: z.number().min(0).max(100).nullable().optional(),
    actual: z.number().min(0).max(100).nullable().optional(),
    measure: z.string().max(600).optional(),
    tool: z.string().max(400).optional(),
    evidence: z.string().max(1000).optional(),
    followUp: z.string().max(600).optional(),
    status: z.enum(["not_started", "in_progress", "done", "blocked"]).optional(),
    progressNote: z.string().max(1000).optional(),
  }),
});

const DeleteSchema = z.object({ action: z.literal("delete"), planId: z.string().min(1) });

const Schema = z.union([CreateSchema, UpdateSchema, DeleteSchema]);

/**
 * إدارة خطة التحسين:
 *  - تحويل توصية المؤشر إلى بند خطة تنفيذية قابل للتعديل
 *  - متابعة النسب: خط الأساس ← المستهدف المعتمد ← النسبة المحققة
 *  - تسجيل المنجزات والشواهد
 */
export async function POST(request: Request, ctx: RouteContext<"/api/analyses/[id]/plan">) {
  const { id } = await ctx.params;
  try {
    const body = Schema.parse(await request.json());
    const settings = await getSettings();

    if (body.action === "createFromIndicator") {
      const full = await loadFullAnalysis(id);
      if (!full) return NextResponse.json({ error: "التحليل غير موجود." }, { status: 404 });
      const indicator = full.indicators.find((i) => i.code === body.code);
      if (!indicator) {
        return NextResponse.json({ error: "المؤشر غير موجود في هذا التحليل." }, { status: 404 });
      }

      const rec = buildRecommendation(indicator, {
        thresholds: settings.thresholds,
        rules: settings.rules,
        reportAdvice: full.reportAdvice,
      });

      const baseline =
        indicator.percent === null
          ? null
          : `${indicator.percent}% (${indicator.source.label})`;

      const plan = await prisma.planItem.create({
        data: {
          analysisId: id,
          indicatorCode: indicator.code,
          title: body.overrides?.title ?? `${indicator.code} — ${indicator.text}`,
          actionsJson: JSON.stringify(rec.actions),
          owner: body.overrides?.owner ?? rec.owner,
          startDate: body.overrides?.startDate ?? null,
          endDate: body.overrides?.endDate ?? null,
          baseline,
          target: body.overrides?.target ?? null,
          actual: null,
          measure: body.overrides?.measure ?? rec.measure,
          tool: body.overrides?.tool ?? rec.tool,
          evidence: body.overrides?.evidence ?? rec.evidence.join("\n"),
          followUp: body.overrides?.followUp ?? rec.followUp,
          status: "not_started",
          approved: true,
        },
      });

      await recordRevision(
        id,
        "plan",
        plan.id,
        "title",
        `إضافة بند خطة للمؤشر ${indicator.code}`,
        settings.preparedBy,
      );

      return NextResponse.json({ ok: true, planId: plan.id });
    }

    if (body.action === "update") {
      const existing = await prisma.planItem.findFirst({ where: { id: body.planId, analysisId: id } });
      if (!existing) return NextResponse.json({ error: "بند الخطة غير موجود." }, { status: 404 });

      const patch = body.patch;
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue;
        data[k] = k === "actions" ? JSON.stringify(v) : v;
      }
      if (Object.keys(data).length > 0) {
        await prisma.planItem.update({ where: { id: existing.id }, data });
      }

      const notes: string[] = [];
      if (patch.target !== undefined && patch.target !== existing.target) {
        notes.push(`المستهدف: ${existing.target ?? "—"} ← ${patch.target ?? "—"}`);
      }
      if (patch.actual !== undefined && patch.actual !== existing.actual) {
        notes.push(`النسبة المحققة: ${existing.actual ?? "—"} ← ${patch.actual ?? "—"}`);
      }
      if (patch.status !== undefined && patch.status !== existing.status) {
        notes.push(`الحالة: ${existing.status} ← ${patch.status}`);
      }
      if (notes.length > 0) {
        await recordRevision(
          id,
          "plan",
          existing.id,
          "planStatus",
          notes.join(" | "),
          settings.preparedBy,
        );
      }

      const updated = await prisma.planItem.findUnique({ where: { id: existing.id } });
      const completion = updated
        ? planCompletionPercent({
            baseline: updated.baseline,
            target: updated.target,
            actual: updated.actual,
            status: updated.status,
          })
        : null;

      return NextResponse.json({ ok: true, completion });
    }

    await prisma.planItem.deleteMany({ where: { id: body.planId, analysisId: id } });
    await recordRevision(id, "plan", body.planId, "title", "حذف بند الخطة", settings.preparedBy);
    return NextResponse.json({ ok: true });
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