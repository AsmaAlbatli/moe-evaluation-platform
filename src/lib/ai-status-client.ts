"use client";

/** وصف حالة الذكاء الاصطناعي كما يعرضها الخادم، دون كشف أي مفتاح. */
export interface AiStatusResponse {
  ai: { enabled: boolean; model: string | null; reason: string };
  message: string;
}

export async function fetchAiStatus(): Promise<AiStatusResponse | null> {
  try {
    const res = await fetch("/api/ai/status");
    if (!res.ok) return null;
    return (await res.json()) as AiStatusResponse;
  } catch {
    return null;
  }
}

export async function describeAiAvailability(): Promise<string> {
  const status = await fetchAiStatus();
  if (!status) return "تعذّر الاتصال بالخادم للتحقق من حالة الذكاء الاصطناعي.";
  return status.message;
}