import "server-only";

/**
 * عميل الذكاء الاصطناعي (اختياري).
 *
 * مبادئ التصميم:
 *  - يعمل على واجهة متوافقة مع OpenAI، فيمكن استخدام OpenAI أو Azure
 *    أو OpenRouter أو أي مزود متوافق بتغيير متغيرات البيئة فقط.
 *  - المفتاح يُقرأ في الخادم ولا يُمرَّر إلى المتصفح إطلاقًا.
 *  - عند غياب الخدمة أو فشلها، تُعاد نتيجة «غير متاح» وتُعرض توصيات
 *    القواعد بدلًا منها، دون ادعاء أن تحليلًا ذكيًا قد نُفِّذ.
 *  - لا يُسمح للذكاء الاصطناعي بتوليد أي رقم؛ مخرجاته نصية فقط،
 *    والأرقام (خط الأساس والمستهدف) تأتي من محرّك القواعد وحده.
 */

import type { IndicatorResult } from "@/lib/analysis/compute";
import { LEVEL_META } from "@/lib/domain/levels";
import { formatPercent } from "@/lib/text/arabic";

export interface AiAvailability {
  enabled: boolean;
  model: string | null;
  /** سبب التعذّر عند التفعيل */
  reason: string;
}

export function getAiAvailability(): AiAvailability {
  const enabled = process.env.AI_ENABLED === "true";
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.AI_MODEL?.trim();
  if (!enabled) {
    return { enabled: false, model: null, reason: "الذكاء الاصطناعي غير مفعّل في إعدادات الخادم." };
  }
  if (!apiKey) {
    return {
      enabled: false,
      model: null,
      reason: "مفتاح الخدمة غير موجود في الخادم (OPENAI_API_KEY).",
    };
  }
  if (!model) {
    return { enabled: false, model: null, reason: "اسم النموذج غير محدد (AI_MODEL)." };
  }
  return { enabled: true, model, reason: "" };
}

/* ------------------------------------------------------------------ */
/*  عقدة المخرجات                                                     */
/* ------------------------------------------------------------------ */

export interface AiRecommendationPayload {
  strengths: string[];
  gap: string;
  target: string;
  actions: string[];
  owner: string;
  duration: string;
  measure: string;
  tool: string;
  evidence: string[];
  followUp: string;
}

export type AiResult =
  | { ok: true; payload: AiRecommendationPayload; model: string }
  | { ok: false; reason: string };

const SYSTEM_PROMPT = [
  "أنت مستشار تربوي يساعد المدارس السعودية على بناء خطط تحسين واقعية.",
  "قواعد إلزامية:",
  "1) اكتب بالعربية الفصحى المبسطة.",
  "2) لا تخترع أي أرقام أو نسب أو درجات. الأرقام المعطاة لك هي خط الأساس فقط.",
  "3) لا تنسب أي توصية إلى هيئة تقويم التعليم والتدريب إلا إذا ذُكر ذلك نصًّا في المواد المعطاة.",
  "4) اجعل الإجراءات تنفيذية وقابلة للتحقق خلال فصل دراسي واحد في بيئة مدرسة سعودية.",
  "5) لا تفترض أن النسبة صفر أو أن الهدف هو 100%.",
  "أعد الإجابة ككائن JSON فقط بالمفاتيح المطلوبة.",
].join("\n");

function buildUserPrompt(input: {
  indicator: IndicatorResult;
  domainName: string;
  criterionName: string;
  reportAdvice: string;
}): string {
  const { indicator, domainName, criterionName, reportAdvice } = input;
  const levelText = indicator.level ? LEVEL_META[indicator.level].label : "غير متوفر في التقرير";
  return [
    `المجال: ${domainName}`,
    `المعيار: ${criterionName}`,
    `رمز المؤشر: ${indicator.code}`,
    `نص المؤشر: ${indicator.text}`,
    `النسبة المسجّلة في الملف: ${indicator.percent !== null ? formatPercent(indicator.percent) : "غير متوفرة"}`,
    `مستوى الأداء كما ورد: ${levelText}`,
    reportAdvice ? `مقترح التحسين الوارد في التقرير: ${reportAdvice}` : "لا يوجد مقترح تقرير.",
    "",
    "اكتب: نقاط القوة، فجوة الأداء (وصفية)، هدف التحسين، من 3 إلى 5 إجراءات تنفيذية،",
    "مسؤول التنفيذ، مدة التنفيذ، مؤشر قياس الأداء، أداة القياس، الشواهد المطلوبة، آلية المتابعة.",
  ].join("\n");
}

function parseJsonLoose(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(cleaned.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

const REQUIRED_KEYS = [
  "strengths",
  "gap",
  "target",
  "actions",
  "owner",
  "duration",
  "measure",
  "tool",
  "evidence",
  "followUp",
] as const;

/** يتحقق من صحة المخرجات ويتجاهل أي رقم قد يولّده النموذج. */
function sanitize(raw: unknown): AiRecommendationPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const str = (v: unknown, max = 1200): string =>
    typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
  const list = (v: unknown, max = 8): string[] =>
    Array.isArray(v)
      ? v.map((x) => str(x, 600)).filter((s) => s.length > 0).slice(0, max)
      : [];

  const hasAllKeys = REQUIRED_KEYS.every((k) => k in obj);
  if (!hasAllKeys) return null;

  return {
    strengths: list(obj.strengths, 5),
    gap: str(obj.gap),
    target: str(obj.target),
    actions: list(obj.actions, 6),
    owner: str(obj.owner, 200),
    duration: str(obj.duration, 200),
    measure: str(obj.measure),
    tool: str(obj.tool, 400),
    evidence: list(obj.evidence, 8),
    followUp: str(obj.followUp, 600),
  };
}

export async function generateAiRecommendation(input: {
  indicator: IndicatorResult;
  domainName: string;
  criterionName: string;
  reportAdvice?: string;
}): Promise<AiResult> {
  const availability = getAiAvailability();
  if (!availability.enabled) return { ok: false, reason: availability.reason };

  const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const apiKey = process.env.OPENAI_API_KEY!.trim();
  const model = availability.model!;
  const timeoutSec = Number.parseInt(process.env.AI_TIMEOUT_SECONDS ?? "60", 10);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(5, timeoutSec) * 1000);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt({ ...input, reportAdvice: input.reportAdvice ?? "" }) },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        reason: `تعذّر الاتصال بخدمة الذكاء الاصطناعي (رمز ${response.status}). ${body.slice(0, 200)}`,
      };
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = sanitize(parseJsonLoose(content));
    if (!parsed) {
      return { ok: false, reason: "وصل رد غير متوقع من الخدمة، فتم تجاهله والاكتفاء بتوصيات القواعد." };
    }
    return { ok: true, payload: parsed, model };
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطأ غير معروف";
    return { ok: false, reason: `تعذّر تنفيذ الطلب: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}

/** توليد دفعي مع تحديد عدد الطلبات المتزامنة لتفادي ضغط الخدمة. */
export async function generateAiRecommendations(
  items: { indicator: IndicatorResult; domainName: string; criterionName: string; reportAdvice?: string }[],
  concurrency = 3,
): Promise<Map<string, AiResult>> {
  const out = new Map<string, AiResult>();
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      out.set(item.indicator.code, await generateAiRecommendation(item));
    }
  });
  await Promise.all(workers);
  return out;
}