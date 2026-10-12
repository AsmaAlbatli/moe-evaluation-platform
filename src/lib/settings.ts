import "server-only";

import { prisma } from "./db";
import {
  DEFAULT_LEVEL_THRESHOLDS,
  type LevelThresholds,
} from "@/lib/domain/levels";
import { DEFAULT_RULES, type RulesSettings } from "@/lib/recommendations/rules";

/**
 * إعدادات المنصة المخزّنة في قاعدة البيانات.
 * تُقرأ مرة واحدة لكل طلب وتُخزَّن مؤقتًا في الذاكرة لمدة قصيرة.
 */

export interface PlatformSettings {
  thresholds: LevelThresholds;
  rules: RulesSettings;
  /** شعار الوزارة المرفوع من لوحة المسؤول (مفتاح التخزين) */
  logoStorageKey: string | null;
  logoOriginalName: string | null;
  /** اسم الجهة التي تُذكَر في ترويسة التقرير */
  preparedBy: string;
  schoolsScope: string;
}

const SETTING_KEYS = {
  thresholds: "levels.thresholds",
  rules: "recommendation.rules",
  logo: "brand.logo",
  preparedBy: "report.preparedBy",
  schoolsScope: "report.schoolsScope",
} as const;

export const DEFAULT_SETTINGS: PlatformSettings = {
  thresholds: DEFAULT_LEVEL_THRESHOLDS,
  rules: DEFAULT_RULES,
  logoStorageKey: null,
  logoOriginalName: null,
  preparedBy: "المشرفة أسماء الباتلي",
  schoolsScope: "مدارس النطاق الثالث",
};

type CacheEntry = { value: PlatformSettings; at: number };
const CACHE_TTL_MS = 5_000;
let cache: CacheEntry | null = null;

function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function getSettings(force = false): Promise<PlatformSettings> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }
  let rows: { key: string; value: string }[];
  try {
    rows = await prisma.setting.findMany();
  } catch {
    // لا تسقط المنصة كاملة إذا تعذّر الوصول إلى قاعدة البيانات:
    // نستخدم الإعدادات الافتراضية الآمنة بدل رمي خطأ يُسقط البناء.
    return {
      ...DEFAULT_SETTINGS,
      thresholds: { ...DEFAULT_LEVEL_THRESHOLDS },
      rules: DEFAULT_RULES,
    };
  }
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const thresholds: LevelThresholds = {
    ...DEFAULT_LEVEL_THRESHOLDS,
    ...safeParse<Partial<LevelThresholds>>(map.get(SETTING_KEYS.thresholds), {}),
    min: {
      ...DEFAULT_LEVEL_THRESHOLDS.min,
      ...safeParse<Partial<LevelThresholds["min"]>>(map.get(`${SETTING_KEYS.thresholds}:min`), {}),
    },
  };

  const rules: RulesSettings = {
    ...DEFAULT_RULES,
    ...safeParse<Partial<RulesSettings>>(map.get(SETTING_KEYS.rules), {}),
    suggestedGainByLevel: {
      ...DEFAULT_RULES.suggestedGainByLevel,
      ...safeParse<Partial<RulesSettings["suggestedGainByLevel"]>>(
        map.get(`${SETTING_KEYS.rules}:gains`),
        {},
      ),
    },
  };

  let logo: { key: string; name: string } | null = null;
  const logoRaw = map.get(SETTING_KEYS.logo);
  if (logoRaw) logo = safeParse<{ key: string; name: string } | null>(logoRaw, null);

  const value: PlatformSettings = {
    thresholds,
    rules,
    logoStorageKey: logo?.key ?? null,
    logoOriginalName: logo?.name ?? null,
    preparedBy: map.get(SETTING_KEYS.preparedBy) || DEFAULT_SETTINGS.preparedBy,
    schoolsScope: map.get(SETTING_KEYS.schoolsScope) || DEFAULT_SETTINGS.schoolsScope,
  };

  cache = { value, at: Date.now() };
  return value;
}

export async function saveSettingsPatch(patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
  const writes: { key: string; value: string }[] = [];

  if (patch.thresholds) {
    writes.push({ key: SETTING_KEYS.thresholds, value: JSON.stringify(patch.thresholds) });
    writes.push({ key: `${SETTING_KEYS.thresholds}:min`, value: JSON.stringify(patch.thresholds.min) });
  }
  if (patch.rules) {
    writes.push({ key: SETTING_KEYS.rules, value: JSON.stringify(patch.rules) });
    writes.push({
      key: `${SETTING_KEYS.rules}:gains`,
      value: JSON.stringify(patch.rules.suggestedGainByLevel),
    });
  }
  if (patch.logoStorageKey !== undefined) {
    writes.push({
      key: SETTING_KEYS.logo,
      value: JSON.stringify(
        patch.logoStorageKey ? { key: patch.logoStorageKey, name: patch.logoOriginalName ?? "" } : null,
      ),
    });
  }
  if (patch.preparedBy !== undefined) {
    writes.push({ key: SETTING_KEYS.preparedBy, value: patch.preparedBy });
  }
  if (patch.schoolsScope !== undefined) {
    writes.push({ key: SETTING_KEYS.schoolsScope, value: patch.schoolsScope });
  }

  for (const w of writes) {
    await prisma.setting.upsert({ where: { key: w.key }, update: { value: w.value }, create: w });
  }

  cache = null;
  return getSettings(true);
}

export function invalidateSettingsCache(): void {
  cache = null;
}