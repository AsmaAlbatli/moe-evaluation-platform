"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** شريط التنقل الرئيسي — يبرز القسم الحالي. */
export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="التنقل الرئيسي" className="no-print">
      <div className="mx-auto w-full max-w-[1400px] px-2">
        <ul className="flex flex-wrap items-center gap-1 py-1.5">
          {items.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "inline-block rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                    active
                      ? "bg-white text-navy shadow-sm"
                      : "text-sky-100 hover:bg-white/10 hover:text-white",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}