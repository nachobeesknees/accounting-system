import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { IconFile } from "@/components/ui/Icon";
import {
  DEMO_TODAY,
  getBankAccounts,
  getBills,
  getCustomers,
  getEntities,
  getFirmEntities,
  getKpis,
  getRegions,
  getVendors,
} from "@/lib/data";
import { resolveEntityScope } from "@/lib/entity-scope";
import { parseAmount } from "@/lib/money";
import type { Bill, Customer, Entity, Office, Region } from "@/lib/types";

import { PayRunForm, type PayRunBillRow, type PayRunRegionGroup } from "./PayRunForm";

const UNGROUPED_REGION_ID = "__none__";

/**
 * AP Pay Run.
 *
 * Lets the user check off approved/partial bills to pay, with a live
 * cash-after-payment indicator. Bills are grouped by region (derived from
 * the bill's client entity, or — failing that — its customer). When the
 * topbar scope is a region or single office, bills outside that scope are
 * filtered out.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; paid?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ?? "";
  const paid = params.paid ?? "";

  const [
    allBills,
    allVendors,
    allCustomers,
    allEntities,
    allRegions,
    firmEntities,
    bankAccounts,
    kpis,
    scope,
  ] = await Promise.all([
    getBills(),
    getVendors(),
    getCustomers(),
    getEntities(),
    getRegions(),
    getFirmEntities(),
    getBankAccounts(),
    getKpis(),
    resolveEntityScope(),
  ]);

  const vendorsById = new Map(allVendors.map((v) => [v.id, v] as const));
  const customersById = new Map<string, Customer>(
    allCustomers.map((c) => [c.id, c] as const),
  );
  const entitiesById = new Map<string, Entity>(
    allEntities.map((e) => [e.id, e] as const),
  );
  const regionsById = new Map<string, Region>(
    allRegions.map((r) => [r.id, r] as const),
  );
  const firmById = new Map<string, Office>(
    firmEntities.map((f) => [f.id, f] as const),
  );

  // Resolve which region (and which firm) the bill belongs to. Bills don't
  // carry firm_entity_id directly — they ride on a JE — so we derive
  // geography from the on-behalf-of entity (preferred) or the customer.
  function regionForBill(b: Bill): string | null {
    const ent = b.entityId ? entitiesById.get(b.entityId) : null;
    if (ent?.regionId) return ent.regionId;
    const cust = b.clientId ? customersById.get(b.clientId) : null;
    if (cust?.regionId) return cust.regionId;
    return null;
  }

  function firmForBill(b: Bill): Office | null {
    // Prefer the client entity's region's first firm office; otherwise
    // any office in the resolved region. Falls back to null.
    const regionId = regionForBill(b);
    if (!regionId) return null;
    const candidate = firmEntities.find((f) => f.regionId === regionId);
    return candidate ?? null;
  }

  // Compute "Cash on hand" from bank accounts. We sum native balances only
  // for accounts in the base currency (USD) — non-USD accounts are not
  // mixed into this tile (avoids fake precision without an FX engine).
  const cashCurrency = "USD";
  let cashOnHand = 0;
  for (const ba of bankAccounts) {
    if (ba.currencyCode !== cashCurrency) continue;
    cashOnHand += parseAmount(ba.currentBalance);
  }
  // Fall back to GL cash (account 1000) when no bank accounts are loaded.
  if (cashOnHand === 0 && bankAccounts.length === 0) {
    cashOnHand = kpis.cash;
  }

  // Topbar scope filter — narrow bills by the office set when scoped.
  const scopedRegionIds = new Set<string>();
  if (scope.kind === "region") {
    scopedRegionIds.add(scope.regionId);
  } else if (scope.kind === "office") {
    const ofc = firmById.get(scope.officeId);
    if (ofc?.regionId) scopedRegionIds.add(ofc.regionId);
  }

  let cashLabel = "All bank accounts (USD)";
  if (scope.kind === "region") {
    const r = regionsById.get(scope.regionId);
    cashLabel = `Scoped to ${r?.name ?? "region"}`;
  } else if (scope.kind === "office") {
    const ofc = firmById.get(scope.officeId);
    cashLabel = `Scoped to ${ofc?.name ?? "office"}`;
  }

  // Filter to payable bills (open balance, approved or partial).
  const payable = allBills.filter((b) => {
    const status = b.status;
    if (status !== "approved" && status !== "partial" && status !== "overdue") {
      return false;
    }
    if (parseAmount(b.balanceDue) <= 0) return false;
    if (scopedRegionIds.size > 0) {
      const r = regionForBill(b);
      if (!r || !scopedRegionIds.has(r)) return false;
    }
    return true;
  });

  // Group by region.
  type RegionBucket = { region: Region | null; bills: PayRunBillRow[] };
  const buckets = new Map<string, RegionBucket>();

  const today = DEMO_TODAY;
  for (const b of payable) {
    const regionId = regionForBill(b);
    const region = regionId ? regionsById.get(regionId) ?? null : null;
    const key = regionId ?? UNGROUPED_REGION_ID;
    if (!buckets.has(key)) {
      buckets.set(key, { region, bills: [] });
    }
    const vendor = vendorsById.get(b.vendorId);
    const firm = firmForBill(b);
    const due = new Date(`${b.dueDate}T00:00:00Z`);
    const ms = today.getTime() - due.getTime();
    const daysPastDue = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
    buckets.get(key)!.bills.push({
      id: b.id,
      billNumber: b.billNumber,
      vendorName: vendor?.name ?? "—",
      billDate: b.billDate,
      dueDate: b.dueDate,
      status: b.status,
      balanceDue: b.balanceDue,
      total: b.total,
      currencyCode: b.currencyCode,
      daysPastDue,
      firmCode: firm?.code ?? null,
      firmName: firm?.name ?? null,
    });
  }

  // Sort within each region: overdue first (desc days), then by due date asc.
  for (const bucket of buckets.values()) {
    bucket.bills.sort((a, b) => {
      if (a.daysPastDue !== b.daysPastDue) return b.daysPastDue - a.daysPastDue;
      return a.dueDate.localeCompare(b.dueDate);
    });
  }

  // Order region groups by region.displayOrder, then name; ungrouped last.
  const orderedRegionIds = allRegions
    .map((r) => r.id)
    .filter((id) => buckets.has(id));
  if (buckets.has(UNGROUPED_REGION_ID)) {
    orderedRegionIds.push(UNGROUPED_REGION_ID);
  }
  const groups: PayRunRegionGroup[] = orderedRegionIds.map((id) => {
    const bucket = buckets.get(id)!;
    return {
      regionId: id,
      regionName:
        id === UNGROUPED_REGION_ID
          ? "Firm-level (no region tag)"
          : bucket.region?.name ?? "—",
      bills: bucket.bills,
    };
  });

  const totalBills = groups.reduce((s, g) => s + g.bills.length, 0);

  // Default bank account: first active USD account.
  const usdBanks = bankAccounts.filter(
    (b) => b.isActive && b.currencyCode === cashCurrency,
  );
  const defaultBankAccountId = usdBanks[0]?.id ?? null;

  const demoTodayIso = DEMO_TODAY.toISOString().slice(0, 10);

  // Scope banner text.
  let scopeBanner: string | null = null;
  if (scope.kind === "region") {
    const r = regionsById.get(scope.regionId);
    scopeBanner = `Scoped to ${r?.name ?? "region"} — only bills tied to this region show below.`;
  } else if (scope.kind === "office") {
    const ofc = firmById.get(scope.officeId);
    scopeBanner = `Scoped to ${ofc?.name ?? "office"} — only bills tied to that office's region show below.`;
  }

  return (
    <>
      <PageHeader
        title="AP Pay Run"
        meta={`${totalBills} payable bill${totalBills === 1 ? "" : "s"}`}
      />

      {scopeBanner && (
        <div
          className="px-6 py-1 text-[11.5px]"
          style={{
            background: "var(--rail)",
            color: "var(--ink-3)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          {scopeBanner}
        </div>
      )}
      {paid && (
        <div
          className="px-6 py-1.5 text-[12px]"
          style={{
            background: "var(--p-active-bg)",
            color: "var(--p-active-fg)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          Paid {paid} bill{paid === "1" ? "" : "s"}.
        </div>
      )}
      {error && (
        <div
          className="px-6 py-1.5 text-[12px]"
          style={{
            background: "var(--p-review-bg)",
            color: "var(--p-review-fg)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          {error}
        </div>
      )}

      <div className="px-6 pt-3.5">
        <PayRunFormSlot
          totalBills={totalBills}
          groups={groups}
          cashOnHand={cashOnHand}
          cashCurrency={cashCurrency}
          cashLabel={cashLabel}
          bankAccounts={usdBanks.map((b) => ({
            id: b.id,
            name: b.name,
            currencyCode: b.currencyCode,
            lastFour: b.lastFour,
          }))}
          defaultBankAccountId={defaultBankAccountId}
          defaultPaymentDate={demoTodayIso}
        />
      </div>
    </>
  );
}

function PayRunFormSlot(props: React.ComponentProps<typeof PayRunForm>) {
  if (props.totalBills === 0) {
    return (
      <Card title="Nothing to pay">
        <Empty
          icon={<IconFile size={20} />}
          title="No payable bills"
          body="Bills must be approved (or partially paid) with an open balance to appear here."
        />
      </Card>
    );
  }
  return <PayRunForm {...props} />;
}
