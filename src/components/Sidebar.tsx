"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; count?: number };
type Section = { heading: string; items: Item[] };

// Sections the security module hides from low-trust roles. Anything in
// SETTINGS_HEADINGS is gated behind `read.settings`. The list view of
// users + audit log lives under /settings so it's covered automatically.
const SETTINGS_HEADINGS = new Set<string>(["Admin"]);

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
    ],
  },
  {
    heading: "Payables",
    items: [
      { href: "/bills", label: "Bills" },
      { href: "/bills/pay-run", label: "Select bills to pay" },
      { href: "/vendors", label: "Vendors" },
      { href: "/vendors/pending", label: "Vendor approvals" },
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
      { href: "/reports/intercompany", label: "Intercompany" },
      { href: "/aua", label: "AUA Report" },
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
      { href: "/settings/periods", label: "Accounting Periods" },
      { href: "/settings/dimensions", label: "Dimensions" },
      { href: "/settings/users", label: "🔒 Users" },
      { href: "/settings/audit-log", label: "🔒 Audit Log" },
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
  user,
  canSeeSettings,
}: {
  counts?: Record<string, number>;
  urgentItems?: Record<string, boolean>;
  user?: { fullName: string; email: string; role: string };
  /** Result of `hasPermission(session, "read.settings")`. Hides Admin section. */
  canSeeSettings?: boolean;
}) {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const sections = SECTIONS.filter(
    (s) => canSeeSettings !== false || !SETTINGS_HEADINGS.has(s.heading),
  );

  return (
    <aside
      className="sidebar overflow-y-auto flex flex-col"
      style={{
        background: "var(--rail)",
        borderRight: "1px solid var(--line)",
        padding: "8px 6px",
      }}
    >
      <div className="flex-1 min-h-0">
      {sections.map((sec) => (
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
      </div>

      {user && (
        <div
          className="mt-2 pt-2.5 px-2.5"
          style={{ borderTop: "1px solid var(--line)" }}
        >
          <div style={{ fontSize: 12, color: "var(--ink)", fontWeight: 500 }}>
            {user.fullName}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--ink-4)",
              marginTop: 2,
              wordBreak: "break-all",
            }}
          >
            {user.email}
          </div>
          <div
            className="mt-1"
            style={{
              fontSize: 10.5,
              color: "var(--ink-3)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {user.role}
          </div>
          <form action="/api/logout" method="post" className="mt-2">
            <button
              type="submit"
              className="w-full text-left px-2 py-1 rounded-md text-[12px]"
              style={{
                background: "var(--paper)",
                border: "1px solid var(--line-2)",
                color: "var(--ink-2)",
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}
