import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { getBills, getInvoices, getJournalEntries } from "@/lib/data";
import { parseAmount } from "@/lib/money";
import type { SessionUser } from "@/lib/types";

export function AppShell({
  user,
  breadcrumb,
  children,
}: {
  user: SessionUser;
  breadcrumb?: string;
  children: ReactNode;
}) {
  const jeCount = getJournalEntries().length;
  const invoiceCount = getInvoices().filter((i) => parseAmount(i.balanceDue) > 0).length;
  const billCount = getBills().filter((b) => parseAmount(b.balanceDue) > 0).length;

  const counts = {
    "/journal": jeCount,
    "/invoices": invoiceCount,
    "/bills": billCount,
  };

  return (
    <div
      className="app-shell"
      style={{
        display: "grid",
        height: "100dvh",
        gridTemplateRows: "42px 1fr",
        gridTemplateColumns: "220px 1fr",
        gridTemplateAreas: '"top top" "side main"',
      }}
    >
      <div style={{ gridArea: "top" }}>
        <Topbar user={user} breadcrumb={breadcrumb} />
      </div>
      <div style={{ gridArea: "side" }}>
        <Sidebar counts={counts} />
      </div>
      <main
        style={{ gridArea: "main", overflow: "auto", background: "var(--paper)" }}
      >
        {children}
      </main>
    </div>
  );
}
