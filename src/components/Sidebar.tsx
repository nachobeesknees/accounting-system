"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Item = { href: string; label: string; count?: number };
type Section = { heading: string; items: Item[] };

const SECTIONS: Section[] = [
  {
    heading: "Main",
    items: [
      { href: "/", label: "Dashboard" },
      { href: "/accounts", label: "Chart of Accounts" },
      { href: "/journal", label: "Journal Entries" },
      { href: "/ledger", label: "General Ledger" },
    ],
  },
  {
    heading: "Receivables",
    items: [
      { href: "/invoices", label: "Invoices" },
      { href: "/customers", label: "Customers" },
      { href: "/entities", label: "Entities" },
      { href: "/aua", label: "Assets / AUA" },
      { href: "/fees", label: "Fees" },
    ],
  },
  {
    heading: "Payables",
    items: [
      { href: "/bills", label: "Bills" },
      { href: "/vendors", label: "Vendors" },
    ],
  },
  {
    heading: "Banking",
    items: [
      { href: "/bank", label: "Bank Accounts" },
      { href: "/reconciliation", label: "Reconciliation" },
    ],
  },
  {
    heading: "Reporting",
    items: [
      { href: "/reports", label: "Financial Statements" },
    ],
  },
  {
    heading: "Admin",
    items: [
      { href: "/periods", label: "Fiscal Periods" },
      { href: "/settings", label: "Settings" },
    ],
  },
];

function navItemStyle(active: boolean) {
  return {
    background: active ? "var(--raised)" : "transparent",
    boxShadow: active ? "inset 0 0 0 1px var(--line-2)" : "none",
    color: active ? "var(--ink)" : "var(--ink-2)",
    fontWeight: active ? 500 : 400,
  } as const;
}

export function Sidebar({ counts }: { counts?: Record<string, number> }) {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <aside
      className="sidebar overflow-y-auto"
      style={{
        background: "var(--rail)",
        borderRight: "1px solid var(--line)",
        padding: "8px 6px",
      }}
    >
      {SECTIONS.map((sec) => (
        <div key={sec.heading} className="mt-2.5 first:mt-0">
          <div
            className="px-2.5 pt-1.5 pb-1 text-[10.5px] uppercase font-semibold"
            style={{ color: "var(--ink-4)", letterSpacing: "0.08em" }}
          >
            {sec.heading}
          </div>
          {sec.items.map((it) => {
            const active = isActive(it.href);
            const count = counts?.[it.href];
            return (
              <Link
                key={it.href}
                href={it.href}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-md text-[13px] my-px"
                style={navItemStyle(active)}
              >
                <span>{it.label}</span>
                {count != null && count > 0 && (
                  <span
                    className="text-[11px]"
                    style={{
                      color: "var(--ink-4)",
                      fontFamily: "var(--font-mono)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
