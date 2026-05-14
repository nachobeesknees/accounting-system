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
      { href: "/contacts", label: "Contacts" },
      { href: "/accounts", label: "Chart of Accounts" },
      { href: "/journal", label: "Journal Entries" },
      { href: "/ledger", label: "General Ledger" },
    ],
  },
  {
    heading: "Receivables",
    items: [
      { href: "/invoices", label: "Invoices" },
      { href: "/customers", label: "Clients" },
      { href: "/entities", label: "Entities" },
      { href: "/aua", label: "Assets / AUA" },
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
    heading: "Time",
    items: [
      { href: "/time", label: "Time Entries" },
      { href: "/time/report", label: "Utilization" },
      { href: "/time/rates", label: "Rates" },
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
      { href: "/reports/ap-aging", label: "AP Aging" },
      { href: "/reports/ar-aging", label: "AR Aging" },
      { href: "/reports/cash-forecast", label: "12-Week Cash Forecast" },
      { href: "/cash-forecast", label: "Cash Forecast" },
      { href: "/consolidation", label: "Consolidation" },
    ],
  },
  {
    heading: "Admin",
    items: [
      { href: "/offices", label: "Offices" },
      { href: "/regions", label: "Regions" },
      { href: "/price-lists", label: "Price Lists" },
      { href: "/currencies", label: "Currencies / FX" },
      { href: "/periods", label: "Fiscal Periods" },
      { href: "/settings", label: "Settings" },
      { href: "/settings/dimensions", label: "Dimensions" },
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

export function Sidebar({
  counts,
  urgentItems,
}: {
  counts?: Record<string, number>;
  urgentItems?: Record<string, boolean>;
}) {
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
            const urgent = !!urgentItems?.[it.href];
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
                    style={
                      urgent
                        ? {
                            background: "var(--p-pending-bg)",
                            color: "var(--p-pending-fg)",
                            padding: "0 6px",
                            borderRadius: "999px",
                            fontWeight: 600,
                            fontFamily: "var(--font-mono)",
                            fontVariantNumeric: "tabular-nums",
                          }
                        : {
                            color: "var(--ink-4)",
                            fontFamily: "var(--font-mono)",
                            fontVariantNumeric: "tabular-nums",
                          }
                    }
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
