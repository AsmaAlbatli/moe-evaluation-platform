import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Tailwind CSS v4 عبر مُحمِّل Turbopack المدمج في Next.js 16.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // هذه الحزم تُبني خارج حزمة التطبيق (CJS / وحدات ثنائية).
  serverExternalPackages: ["@prisma/client", "exceljs", "xlsx", "pdfjs-dist"],
  // الملفات المرفوعة تصل عبر معالجات المسارات (Route Handlers).
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;