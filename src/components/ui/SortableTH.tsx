"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A clickable table header that toggles server-side sorting via `?sort=col`
 * and `?dir=asc|desc` while preserving every other search param. The page's
 * server query validates `col` against a per-page allowlist — this
 * component only writes the param, it never touches SQL.
 *
 * Clicking the active column flips the direction; clicking a new column
 * sorts it ascending. Paging resets to page 1 on any sort change.
 */
export function SortableTH({
  col,
  children,
  num = false,
  style,
}: {
  /** The allowlisted sort key this header maps to. */
  col: string;
  children: ReactNode;
  num?: boolean;
  style?: React.CSSProperties;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const activeCol = params.get("sort");
  const activeDir = params.get("dir") === "asc" ? "asc" : "desc";
  const isActive = activeCol === col;
  const nextDir = isActive && activeDir === "asc" ? "desc" : "asc";

  const next = new URLSearchParams(params.toString());
  next.set("sort", col);
  next.set("dir", nextDir);
  next.delete("page"); // any sort change lands on page 1
  const href = `${pathname}?${next.toString()}`;

  const arrow = isActive ? (activeDir === "asc" ? "▲" : "▼") : "↕";

  return (
    <th
      className={`px-3 py-1 text-left font-medium uppercase ${num ? "text-right" : ""}`}
      style={{
        fontSize: 10.5,
        letterSpacing: "0.04em",
        color: "var(--ink-3)",
        background: "var(--rail)",
        borderBottom: "1px solid var(--line)",
        position: "sticky",
        top: 0,
        zIndex: 1,
        whiteSpace: "nowrap",
        fontFamily: num ? "var(--font-mono)" : undefined,
        ...style,
      }}
    >
      <Link
        href={href}
        className="no-underline inline-flex items-center gap-1"
        style={{
          color: isActive ? "var(--ink)" : "var(--ink-3)",
          fontWeight: isActive ? 600 : 500,
          justifyContent: num ? "flex-end" : "flex-start",
        }}
        title={`Sort by ${col}`}
      >
        <span>{children}</span>
        <span
          aria-hidden
          style={{
            fontSize: 9,
            opacity: isActive ? 1 : 0.45,
          }}
        >
          {arrow}
        </span>
      </Link>
    </th>
  );
}

/**
 * Shared sort-param parser. Validates the requested column against an
 * allowlist and returns a safe { col, dir }. `col` is null when the
 * request doesn't specify a valid sort, so the caller keeps its default
 * ordering.
 */
export function parseSort<T extends string>(
  sortParam: string | undefined,
  dirParam: string | undefined,
  allowed: readonly T[],
): { col: T | null; dir: "asc" | "desc" } {
  const dir = dirParam === "asc" ? "asc" : "desc";
  const col =
    sortParam && (allowed as readonly string[]).includes(sortParam)
      ? (sortParam as T)
      : null;
  return { col, dir };
}
