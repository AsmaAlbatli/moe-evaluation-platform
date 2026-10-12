"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDownUp, ArrowDown, ArrowUp, Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { PERFORMANCE_LEVELS, LEVEL_LABEL } from "@/lib/domain/levels";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  /** قيمة قابلة للفرز والنص */
  sortValue?: (row: T) => string | number | null;
  /** قيمة قابلة للبحث النصي */
  searchValue?: (row: T) => string;
  render: (row: T) => ReactNode;
  className?: string;
  /** عرض على الشاشات الصغيرة */
  hideOnMobile?: boolean;
}

export interface FilterDef<T> {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  test: (row: T, value: string) => boolean;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  filters?: FilterDef<T>[];
  searchPlaceholder?: string;
  /** مفتاح فريد لكل صف */
  rowKey: (row: T) => string;
  emptyMessage?: string;
  initialSort?: { key: string; direction: "asc" | "desc" };
  /** يعرض عدد الصفوف أعلى الجدول */
  showCount?: boolean;
  /** نص إضافي أسفل الجدول */
  footer?: ReactNode;
  className?: string;
  /** يسمح بالتحديد (للمؤشرات ذات الأولوية) */
  selectable?: {
    isSelected: (row: T) => boolean;
    onToggle: (row: T) => void;
    label: (row: T) => string;
  };
}

/**
 * جدول بيانات قابل للبحث والفرز والتصفية — يُستخدم في كل جداول المنصة.
 */
export function DataTable<T>({
  data,
  columns,
  filters = [],
  searchPlaceholder = "ابحث…",
  rowKey,
  emptyMessage = "لا توجد بيانات لعرضها.",
  initialSort,
  showCount = true,
  footer,
  className,
  selectable,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(
    initialSort ?? null,
  );
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

  const rows = useMemo(() => {
    let out = [...data];

    if (query.trim()) {
      const q = normalize(query);
      out = out.filter((row) =>
        columns.some((col) => normalize(col.searchValue?.(row) ?? "")?.includes(q)),
      );
    }

    for (const [key, value] of Object.entries(activeFilters)) {
      if (!value || value === "all") continue;
      const def = filters.find((f) => f.key === key);
      if (def) out = out.filter((row) => def.test(row, value));
    }

    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        const get = col.sortValue ?? ((row: T) => (col.searchValue?.(row) ?? ""));
        out.sort((a, b) => {
          const va = get(a);
          const vb = get(b);
          // القيم الفارغة دائمًا في النهاية (لا تُعامل كصفر)
          if (va === null || va === "") return 1;
          if (vb === null || vb === "") return -1;
          const cmp =
            typeof va === "number" && typeof vb === "number"
              ? va - vb
              : String(va).localeCompare(String(vb), "ar");
          return sort.direction === "asc" ? cmp : -cmp;
        });
      }
    }

    return out;
  }, [data, query, activeFilters, sort, columns, filters]);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (prev?.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  }

  const hasFilters = Object.values(activeFilters).some((v) => v && v !== "all");

  return (
    <div className={cn("space-y-3", className)}>
      {/* شريط الأدوات */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="pr-8"
            aria-label="بحث في الجدول"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="مسح البحث"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {filters.map((f) => {
          const current = activeFilters[f.key] ?? "all";
          const currentLabel =
            current === "all"
              ? `كل ${f.label}`
              : (f.options.find((o) => o.value === current)?.label ?? f.label);
          return (
            <Select
              key={f.key}
              value={current}
              onValueChange={(v) => setActiveFilters((prev) => ({ ...prev, [f.key]: v ?? "all" }))}
            >
              <SelectTrigger className="w-[180px]" aria-label={f.label}>
                <span className="flex items-center gap-1.5">
                  <SlidersHorizontal className="size-3.5 text-slate-400" />
                  {/* نعرض النص صراحةً: مكوّن SelectValue في Base UI يعتمد على
                      سياق المتصفح فيظهر فروق الترطيب بين الخادم والمتصفح */}
                  <span className="truncate">{currentLabel}</span>
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل {f.label}</SelectItem>
                {f.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        })}

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => setActiveFilters({})}>
            مسح التصفية
          </Button>
        )}

        {showCount && (
          <span className="text-xs text-slate-500">
            {rows.length} من {data.length} صف
          </span>
        )}
      </div>

      {/* الجدول */}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {selectable && <th style={{ width: 38 }} aria-label="تحديد" />}
              {columns.map((col) => {
                const isSorted = sort?.key === col.key;
                return (
                  <th key={col.key} className={col.hideOnMobile ? "hidden md:table-cell" : undefined}>
                    {col.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className="sortable flex items-center gap-1"
                        aria-label={`فرز حسب ${col.header}`}
                      >
                        {col.header}
                        {isSorted ? (
                          sort.direction === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          )
                        ) : (
                          <ArrowDownUp className="size-3 opacity-50" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="py-8 text-center text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const selected = selectable?.isSelected(row) ?? false;
              return (
                <tr key={rowKey(row)} className={selected ? "bg-brand-soft/60" : undefined}>
                  {selectable && (
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => selectable.onToggle(row)}
                        aria-label={`تحديد ${selectable.label(row)}`}
                        className="size-4 accent-[#1769AA]"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className={col.className}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {footer}
    </div>
  );
}

function normalize(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
}

/** خيارات تصفية جاهزة حسب مستوى الأداء. */
export function levelFilterOptions(): { value: string; label: string }[] {
  return [
    ...PERFORMANCE_LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] })),
    { value: "none", label: "مستوى غير متوفر" },
  ];
}