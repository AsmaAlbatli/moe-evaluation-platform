import type { Metadata, Viewport } from "next";
import { Cairo, Tajawal } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "منصة تحليل نتائج التقويم المدرسي وبناء خطط التحسين",
    template: "%s — منصة تحليل نتائج التقويم المدرسي",
  },
  description:
    "منصة وزارة التعليم لتحليل نتائج التقويم المدرسي الخارجي والذاتي وبناء خطط التحسين، مع مراجعة النتائج قبل اعتمادها.",
};

export const viewport: Viewport = {
  themeColor: "#102A43",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${tajawal.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50">
        <TooltipProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          <Toaster position="top-center" richColors dir="rtl" />
        </TooltipProvider>
      </body>
    </html>
  );
}