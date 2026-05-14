import type { ReactNode } from "react";
import { GlobalSearch } from "./GlobalSearch";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import {
  getBills,
  getFirmEntities,
  getInvoices,
  getInvoicesAwaitingApproval,
  getJournalEntries,
} from "@/lib/data";
import { parseAmount } from "@/lib/money";
import { getEntityScope } from "@/lib/entity-scope";
import { hasPermission } from "@/lib/permissions";
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
  const [entries, invoices, bills, awaiting, firmEntities, currentScope] =
    await Promise.all([
      getJournalEntries(),
      getInvoices(),
      getBills(),
      getInvoicesAwaitingApproval(user.userId, user.role, user.isSuperuser),
      getFirmEntities(),
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

  // The topbar picker shows OUR firm's corporate entities — what we
  // bill clients from. Switching narrows every report and JE list to
  // that firm's books.
  const firmOptions = firmEntities.map((f) => ({ id: f.id, code: f.code, name: f.name }));

  return (
    <div className="app-shell">
      <div style={{ gridArea: "top" }}>
        <Topbar
          user={user}
          breadcrumb={breadcrumb}
          entities={firmOptions}
          currentEntityId={currentScope}
        />
      </div>
      <div className="app-shell-side" style={{ gridArea: "side" }}>
        <Sidebar
          counts={counts}
          urgentItems={urgentItems}
          user={{ fullName: user.fullName, email: user.email, role: user.role }}
          canSeeSettings={hasPermission(user, "read.settings")}
        />
      </div>
      <main
        style={{ gridArea: "main", overflow: "auto", background: "var(--paper)" }}
      >
        {children}
      </main>
      <GlobalSearch />
    </div>
  );
}
