import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import {
  getBills,
  getEntities,
  getInvoices,
  getInvoicesAwaitingApproval,
  getJournalEntries,
} from "@/lib/data";
import { parseAmount } from "@/lib/money";
import { getEntityScope } from "@/lib/entity-scope";
import type { SessionUser } from "@/lib/types";

export async function AppShell({
  user,
  breadcrumb,
  children,
}: {
  user: SessionUser;
  breadcrumb?: string;
  children: ReactNode;
}) {
  const [entries, invoices, bills, awaiting, entities, currentScope] = await Promise.all([
    getJournalEntries(),
    getInvoices(),
    getBills(),
    getInvoicesAwaitingApproval(user.userId, user.role, user.isSuperuser),
    getEntities(),
    getEntityScope(),
  ]);
  const jeCount = entries.length;
  const outstandingInvoiceCount = invoices.filter(
    (i) => parseAmount(i.balanceDue) > 0,
  ).length;
  const billCount = bills.filter((b) => parseAmount(b.balanceDue) > 0).length;
  const approvalsCount = awaiting.length;

  const counts = {
    "/journal": jeCount,
    "/invoices": approvalsCount > 0 ? approvalsCount : outstandingInvoiceCount,
    "/bills": billCount,
  };
  const urgentItems = {
    "/invoices": approvalsCount > 0,
  };

  const entityOptions = entities.map((e) => ({ id: e.id, code: e.code, name: e.name }));

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
        <Topbar
          user={user}
          breadcrumb={breadcrumb}
          entities={entityOptions}
          currentEntityId={currentScope}
        />
      </div>
      <div style={{ gridArea: "side" }}>
        <Sidebar counts={counts} urgentItems={urgentItems} />
      </div>
      <main
        style={{ gridArea: "main", overflow: "auto", background: "var(--paper)" }}
      >
        {children}
      </main>
    </div>
  );
}
