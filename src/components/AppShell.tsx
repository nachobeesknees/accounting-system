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
  getRegions,
  getVendorsNeedingApproval,
} from "@/lib/data";
import { parseAmount } from "@/lib/money";
import { cookies } from "next/headers";
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
  // Read the raw cookie value so the picker can display "region:rgn-us"
  // verbatim — getEntityScope() collapses regions to null for back-compat.
  const cookieScope = (await cookies()).get("tw_entity_scope")?.value ?? null;
  const currentScope =
    !cookieScope || cookieScope === "all" ? null : cookieScope;
  const [
    entries,
    invoices,
    bills,
    awaiting,
    pendingVendors,
    firmEntities,
    regions,
  ] = await Promise.all([
    getJournalEntries(),
    getInvoices(),
    getBills(),
    getInvoicesAwaitingApproval(user.userId, user.role, user.isSuperuser),
    getVendorsNeedingApproval(),
    getFirmEntities(),
    getRegions(),
  ]);
  const jeCount = entries.length;
  const outstandingInvoiceCount = invoices.filter(
    (i) => parseAmount(i.balanceDue) > 0,
  ).length;
  const billCount = bills.filter((b) => parseAmount(b.balanceDue) > 0).length;
  const approvalsCount = awaiting.length;
  const pendingVendorCount = pendingVendors.length;

  const counts = {
    "/journal": jeCount,
    "/invoices": approvalsCount > 0 ? approvalsCount : outstandingInvoiceCount,
    "/bills": billCount,
    "/vendors/pending": pendingVendorCount,
  };
  const urgentItems = {
    "/invoices": approvalsCount > 0,
    "/vendors/pending": pendingVendorCount > 0,
  };

  // The topbar picker shows OUR firm's corporate entities — what we
  // bill clients from. Switching narrows every report and JE list to
  // that firm's books. Regions are also listed at the top of the picker
  // (one per region that has ≥1 office attached).
  const firmOptions = firmEntities.map((f) => ({
    id: f.id,
    code: f.code,
    name: f.name,
    regionId: f.regionId ?? null,
  }));
  // Only include regions with ≥1 office. Order follows the regions table's
  // displayOrder (already applied by getRegions()).
  const officeCountByRegion = new Map<string, number>();
  for (const o of firmEntities) {
    if (!o.regionId) continue;
    officeCountByRegion.set(
      o.regionId,
      (officeCountByRegion.get(o.regionId) ?? 0) + 1,
    );
  }
  const regionOptions = regions
    .filter((r) => (officeCountByRegion.get(r.id) ?? 0) > 0)
    .map((r) => ({ id: r.id, name: r.name }));

  return (
    <div className="app-shell">
      <div style={{ gridArea: "top" }}>
        <Topbar
          user={user}
          breadcrumb={breadcrumb}
          entities={firmOptions}
          regions={regionOptions}
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
