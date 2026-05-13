import Link from "next/link";
import type { ReactNode } from "react";

export type Crumb = {
  label: ReactNode;
  href?: string;
};

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (!items.length) return null;
  return (
    <nav
      aria-label="Breadcrumb"
      className="px-6 pt-3 text-[12px] flex items-center gap-1.5 flex-wrap"
      style={{ color: "var(--ink-3)" }}
    >
      {items.map((c, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {c.href && !isLast ? (
              <Link
                href={c.href}
                style={{ color: "var(--ink-3)", textDecoration: "none" }}
                className="hover:underline"
              >
                {c.label}
              </Link>
            ) : (
              <span
                aria-current={isLast ? "page" : undefined}
                style={{
                  color: isLast ? "var(--ink)" : "var(--ink-3)",
                  fontWeight: isLast ? 500 : 400,
                }}
              >
                {c.label}
              </span>
            )}
            {!isLast && (
              <span style={{ color: "var(--ink-5)" }} aria-hidden>
                /
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
