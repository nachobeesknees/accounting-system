import { PageHeader } from "@/components/ui/PageHeader";
import {
  getAccounts,
  getCustomers,
  getDimensionsWithValues,
  getBills,
  getVendors,
  getPriceLists,
  getPriceListEntries,
  getTimeEntries,
  getUsers,
} from "@/lib/data";
import { getEntityScope } from "@/lib/entity-scope";
import { parseAmount } from "@/lib/money";
import {
  ensureAccountingPeriods,
  getAccountingPeriods,
} from "@/lib/periods";
import {
  NewInvoiceForm,
  type ChargebackRow,
  type PriceListEntryRow,
  type UnbilledTimeEntryRow,
} from "./NewInvoiceForm";

const SERVICE_REVENUE_ACCOUNT_ID = "a-4000";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function computeRebillAmount(bill: {
  total: string;
  chargebackType?: string | null;
  markupPct?: string | null;
  rebillAmount?: string | null;
}): number {
  const total = parseFloat(bill.total);
  switch (bill.chargebackType) {
    case "cost":
      return total;
    case "markup": {
      const pct = bill.markupPct ? parseFloat(bill.markupPct) : 0;
      return Math.round(total * (1 + pct) * 100) / 100;
    }
    case "fixed":
      return bill.rebillAmount ? parseFloat(bill.rebillAmount) : 0;
    default:
      return 0;
  }
}

function methodLabel(t: string | null | undefined, markupPct?: string | null): string {
  switch (t) {
    case "cost":
      return "Cost";
    case "markup": {
      const pct = markupPct ? parseFloat(markupPct) : 0;
      return `Markup ${(pct * 100).toFixed(pct % 0.01 === 0 ? 0 : 2)}%`;
    }
    case "fixed":
      return "Fixed";
    default:
      return "—";
  }
}

export default async function Page() {
  await ensureAccountingPeriods(new Date().getUTCFullYear());
  const [
    customers,
    accounts,
    dimensionsWithValues,
    accountingPeriods,
    bills,
    vendors,
    priceLists,
    firmEntityId,
    timeEntries,
    users,
  ] = await Promise.all([
    getCustomers(),
    getAccounts(),
    getDimensionsWithValues(),
    getAccountingPeriods(),
    getBills(),
    getVendors(),
    getPriceLists(),
    getEntityScope(),
    getTimeEntries(),
    getUsers(),
  ]);
  const revenueAccounts = accounts
    .filter((a) => a.accountType === "revenue" && a.isActive)
    .sort((a, b) => a.code.localeCompare(b.code));

  // Build chargebacks grouped by customer id.
  const vendorNameById = new Map(vendors.map((v) => [v.id, v.name] as const));
  const chargebacksByCustomer: Record<string, ChargebackRow[]> = {};
  for (const b of bills) {
    if (!b.chargebackClientId) continue;
    if (b.chargebackInvoiceId) continue;
    if (!b.chargebackType || b.chargebackType === "included") continue;
    const rebill = computeRebillAmount(b);
    if (rebill <= 0) continue;
    const vendorName = vendorNameById.get(b.vendorId) ?? "Unknown vendor";
    const row: ChargebackRow = {
      billId: b.id,
      billNumber: b.billNumber,
      vendorName,
      total: parseFloat(b.total),
      rebillAmount: rebill,
      method: b.chargebackType as "cost" | "markup" | "fixed",
      methodLabel: methodLabel(b.chargebackType, b.markupPct),
      description: `Reimbursable — ${b.billNumber} — ${vendorName}`,
    };
    const arr = chargebacksByCustomer[b.chargebackClientId] ?? [];
    arr.push(row);
    chargebacksByCustomer[b.chargebackClientId] = arr;
  }

  // Current price list entries — prefer the one scoped to the active firm
  // entity (office) so a user invoicing from "Office NY" sees NY pricing,
  // not whichever office happened to sort first. Falls back to any current
  // list if no scope is set or the scoped office has no list.
  const inScope = firmEntityId
    ? priceLists.filter((pl) => pl.officeId === firmEntityId)
    : priceLists;
  const currentPriceList =
    inScope.find((pl) => pl.isCurrent && pl.isActive) ??
    inScope.find((pl) => pl.isCurrent) ??
    inScope[0] ??
    priceLists.find((pl) => pl.isCurrent && pl.isActive) ??
    priceLists.find((pl) => pl.isCurrent) ??
    priceLists[0];
  const rawEntries = currentPriceList
    ? await getPriceListEntries(currentPriceList.id)
    : [];
  const priceListEntries: PriceListEntryRow[] = rawEntries.map((e) => ({
    id: e.id,
    label: e.label,
    code: e.itemKey,
    unitPrice: parseFloat(e.unitPrice),
    includedQuantity: e.includedQuantity ? parseFloat(e.includedQuantity) : null,
  }));

  // Unbilled time entries grouped by customer. Filter: clientId set,
  // invoiceId null, billable=true. The user can pull these into the
  // invoice as line items via the widget.
  const userById = new Map(users.map((u) => [u.id, u] as const));
  const unbilledTimeByCustomer: Record<string, UnbilledTimeEntryRow[]> = {};
  for (const t of timeEntries) {
    if (!t.clientId) continue;
    if (t.invoiceId) continue;
    if (!t.isBillable) continue;
    const hours = parseAmount(t.durationHours);
    if (hours <= 0) continue;
    const rate = t.rateAtLog ? parseAmount(t.rateAtLog) : 0;
    const user = userById.get(t.userId);
    const row: UnbilledTimeEntryRow = {
      id: t.id,
      entryDate: t.entryDate,
      userId: t.userId,
      userName: user?.fullName ?? "Unknown",
      description: t.description,
      hours,
      rate,
      amount: hours * rate,
    };
    const arr = unbilledTimeByCustomer[t.clientId] ?? [];
    arr.push(row);
    unbilledTimeByCustomer[t.clientId] = arr;
  }
  // Sort each customer's entries by date ascending so the oldest unbilled
  // work bubbles to the top.
  for (const cid of Object.keys(unbilledTimeByCustomer)) {
    unbilledTimeByCustomer[cid].sort((a, b) =>
      a.entryDate.localeCompare(b.entryDate),
    );
  }

  return (
    <>
      <PageHeader title="New invoice" meta="Invoices / New" />
      <NewInvoiceForm
        customers={customers}
        revenueAccounts={revenueAccounts}
        today={todayISO()}
        dueDefault={plusDaysISO(30)}
        dimensionsWithValues={dimensionsWithValues}
        accountingPeriods={accountingPeriods}
        chargebacksByCustomer={chargebacksByCustomer}
        priceListEntries={priceListEntries}
        unbilledTimeByCustomer={unbilledTimeByCustomer}
        defaultServiceRevenueAccountId={SERVICE_REVENUE_ACCOUNT_ID}
      />
    </>
  );
}
