import { NextResponse } from "next/server";
import { z } from "zod";
import { getSettings, saveSettingsPatch } from "@/lib/settings";
import { validateThresholds, DEFAULT_LEVEL_THRESHOLDS } from "@/lib/domain/levels";
import { DEFAULT_RULES } from "@/lib/recommendations/rules";
import { buildStorageKey, putObject, deleteObject } from "@/lib/storage";
import { prisma, describeDbError } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSettings(true);
  return NextResponse.json({
    ok: true,
    thresholds: settings.thresholds,
    rules: settings.rules,
    defaults: { thresholds: DEFAULT_LEVEL_THRESHOLDS, rules: DEFAULT_RULES },
    logo: settings.logoStorageKey
      ? { uploaded: true, originalName: settings.logoOriginalName }
      : { uploaded: false, originalName: null },
    validation: validateThresholds(settings.thresholds),
  });
}

const ThresholdsSchema = z.object({
  enabled: z.boolean(),
  referenceName: z.string().max(300),
  referenceEdition: z.string().max(200),
  referenceUrl: z.string().max(500),
  notes: z.string().max(1000),
  min: z.object({
    tahyea: z.number().min(0).max(100).nullable(),
    intilaq: z.number().min(0).max(100).nullable(),
    taqaddum: z.number().min(0).max(100).nullable(),
    tamayyuz: z.number().min(0).max(100).nullable(),
  }),
});

const RulesSchema = z.object({
  suggestedGainByLevel: z.object({
    tahyea: z.number().min(0).max(60),
    intilaq: z.number().min(0).max(60),
    taqaddum: z.number().min(0).max(60),
    tamayyuz: z.number().min(0).max(60),
  }),
  maxSuggestedTarget: z.number().min(50).max(100),
  useReportAdvice: z.boolean(),
  proposeMeasurementWhenMissing: z.boolean(),
  defaultDuration: z.string().max(120),
});

/**
 * حفظ الإعدادات الإدارية: حدود المستويات مع مرجعها وإصداره، وقواعد التوصيات.
 * لا تُقبل حدود غير صالحة، ولا تُحفظ حدود مفعّلة دون مرجع معتمد وإصداره.
 */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      thresholds?: unknown;
      rules?: unknown;
      preparedBy?: string;
      schoolsScope?: string;
    };

    const patch: Parameters<typeof saveSettingsPatch>[0] = {};

    if (body.thresholds !== undefined) {
      const parsed = ThresholdsSchema.safeParse(body.thresholds);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "صيغة حدود المستويات غير صالحة.", details: parsed.error.issues.map((i) => i.message) },
          { status: 400 },
        );
      }
      const validation = validateThresholds(parsed.data);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.reason }, { status: 400 });
      }
      patch.thresholds = parsed.data;
    }

    if (body.rules !== undefined) {
      const parsed = RulesSchema.safeParse(body.rules);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "صيغة قواعد التوصيات غير صالحة.", details: parsed.error.issues.map((i) => i.message) },
          { status: 400 },
        );
      }
      patch.rules = parsed.data;
    }

    if (typeof body.preparedBy === "string" && body.preparedBy.trim()) {
      patch.preparedBy = body.preparedBy.trim().slice(0, 200);
    }
    if (typeof body.schoolsScope === "string" && body.schoolsScope.trim()) {
      patch.schoolsScope = body.schoolsScope.trim().slice(0, 200);
    }

    const saved = await saveSettingsPatch(patch);
    await prisma.setting.upsert({
      where: { key: "settings.lastUpdated" },
      update: { value: new Date().toISOString() },
      create: { key: "settings.lastUpdated", value: new Date().toISOString() },
    });

    return NextResponse.json({ ok: true, thresholds: saved.thresholds, rules: saved.rules });
  } catch (error) {
    return NextResponse.json({ error: describeDbError(error) }, { status: 500 });
  }
}

/**
 * رفع شعار الوزارة الرسمي.
 * المنصة لا تتضمّن أي شعار غير معتمد؛ يظهر البديل فقط بعد رفع الملف من المسؤول.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("logo");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "لم يُرفع أي ملف." }, { status: 400 });
    }
    const allowed = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json(
        { error: "صيغة الشعار غير مدعومة. الصيغ المسموحة: PNG أو JPG أو SVG أو WebP." },
        { status: 400 },
      );
    }
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "حجم الشعار يتجاوز 2 ميجابايت." }, { status: 400 });
    }

    const settings = await getSettings();
    const previous = settings.logoStorageKey;

    const key = buildStorageKey(file.name, "brand");
    const stored = await putObject(key, Buffer.from(await file.arrayBuffer()), file.type);

    await saveSettingsPatch({ logoStorageKey: stored.key, logoOriginalName: file.name });
    if (previous && previous !== stored.key) {
      await deleteObject(previous).catch(() => undefined);
    }

    return NextResponse.json({ ok: true, storageKey: stored.key, originalName: file.name });
  } catch (error) {
    return NextResponse.json({ error: describeDbError(error) }, { status: 500 });
  }
}

/** حذف الشعار المرفوع (يعود المنصة إلى البديل النصي). */
export async function DELETE() {
  try {
    const settings = await getSettings();
    if (settings.logoStorageKey) await deleteObject(settings.logoStorageKey).catch(() => undefined);
    await saveSettingsPatch({ logoStorageKey: null, logoOriginalName: null });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: describeDbError(error) }, { status: 500 });
  }
}