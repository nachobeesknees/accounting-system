"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Prev / Next pagination bar, mirroring the /settings/audit-log reference
 * implementation. Preserves every existing search param and only rewrites
 * `page`. Renders nothing when there's a single page.
 */
export function Pagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage <= 1) return null;

  const hrefForPage = (p: number) => {
    const next = new URLSearchParams(params.toString());
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    const qs = next.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
  };

  const btn: React.CSSProperties = {
    padding: "6px 10px",
    background: "var(--paper)",
    border: "1px solid var(--line-2)",
    borderRadius: 4,
    textDecoration: "none",
    color: "var(--ink-2)",
  };

  return (
    <div
      className="flex items-center justify-between text-[12px]"
      style={{ color: "var(--ink-3)" }}
    >
      <div>
        Showing {(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of{" "}
        {total}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {page > 1 && (
          <Link href={hrefForPage(page - 1)} style={btn}>
            ← Previous
          </Link>
        )}
        {page < lastPage && (
          <Link href={hrefForPage(page + 1)} style={btn}>
            Next →
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * Paginate an already-filtered array in memory and report the total. Used
 * by list pages that do rich in-app filtering (so aggregate totals stay
 * correct over the full filtered set while only a page is rendered).
 */
export function paginate<T>(
  rows: T[],
  page: number,
  pageSize: number,
): { pageRows: T[]; total: number; page: number; lastPage: number } {
  const total = rows.length;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), lastPage);
  const start = (safePage - 1) * pageSize;
  return {
    pageRows: rows.slice(start, start + pageSize),
    total,
    page: safePage,
    lastPage,
  };
}
