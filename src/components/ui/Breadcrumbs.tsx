import Link from "next/link";
import type { ReactNode } from "react";

export type Crumb = {
  label: ReactNode;
  href?: string;
};

/**
 * Compact breadcrumb trail rendered above PageHeader on detail pages.
 * The last crumb is always rendered as plain text — it is "you are here".
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="Breadcrumb"
      className="px-6 pt-3"
      style={{ color: "var(--ink-3)", fontSize: 11.5 }}
    >
      <ol className="flex items-center gap-1 flex-wrap" style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {items.map((c, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1">
              {c.href && !isLast ? (
                <Link
                  href={c.href}
                  style={{ color: "var(--ink-3)", textDecoration: "none" }}
                  className="hover:underline"
                >
                  {c.label}
                </Link>
              ) : (
                <span style={{ color: isLast ? "var(--ink-2)" : "var(--ink-3)" }}>
                  {c.label}
                </span>
              )}
              {!isLast && <span style={{ color: "var(--ink-5)" }}>/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
