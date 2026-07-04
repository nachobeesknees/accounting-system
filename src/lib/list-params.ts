/**
 * Pure list-view helpers shared by server components and the client-side
 * SortableTH / Pagination widgets. These MUST live in a non-"use client"
 * module: server components call them directly during render, and a plain
 * function exported from a "use client" file cannot be invoked from the
 * server (Next.js throws "Attempted to call … from the server").
 */

/**
 * Shared sort-param parser. Validates the requested column against an
 * allowlist and returns a safe { col, dir }. `col` is null when the
 * request doesn't specify a valid sort, so the caller keeps its default
 * ordering. No raw column name ever reaches SQL.
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
