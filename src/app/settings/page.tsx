import type { Metadata } from "next";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";

export const metadata: Metadata = {
  title: "الإعدادات",
  description: "ضبط حدود مستويات الأداء وقواعد التوصيات وشعار الوزارة.",
};

export const dynamic = "force-dynamic";

/** الإعدادات الإدارية. */
export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-navy sm:text-2xl">الإعدادات الإدارية</h1>
        <p className="mt-1 text-sm text-slate-600">
          ضبط حدود مستويات الأداء مع توثيق المرجع وإصداره، وقواعد توليد التوصيات، وشعار الوزارة.
        </p>
      </div>

      <SettingsWorkspace />
    </div>
  );
}