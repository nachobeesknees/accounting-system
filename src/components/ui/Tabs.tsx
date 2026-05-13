import Link from "next/link";
import type { ReactNode } from "react";

export type Tab = { id: string; label: ReactNode; href: string; count?: number };

export function Tabs({ tabs, activeId }: { tabs: Tab[]; activeId: string }) {
  return (
    <nav
      className="flex px-6 gap-0"
      style={{ borderBottom: "1px solid var(--line)" }}
    >
      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <Link
            key={t.id}
            href={t.href}
            className="px-3 py-2 text-[12.5px]"
            style={{
              color: active ? "var(--ink)" : "var(--ink-3)",
              borderBottom: active ? "2px solid var(--ink)" : "2px solid transparent",
              marginBottom: -1,
              fontWeight: active ? 500 : 400,
              textDecoration: "none",
            }}
          >
            {t.label}
            {t.count != null && (
              <span className="ml-1.5" style={{ color: "var(--ink-4)", fontSize: 11 }}>
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
