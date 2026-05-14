import { PageHeader } from "@/components/ui/PageHeader";
import { getAccounts, getCustomers, getDimensionsWithValues } from "@/lib/data";
import {
  ensureAccountingPeriods,
  getAccountingPeriods,
} from "@/lib/periods";
import { NewInvoiceForm } from "./NewInvoiceForm";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function Page() {
  await ensureAccountingPeriods(new Date().getUTCFullYear());
  const [customers, accounts, dimensionsWithValues, accountingPeriods] =
    await Promise.all([
      getCustomers(),
      getAccounts(),
      getDimensionsWithValues(),
      getAccountingPeriods(),
    ]);
  const revenueAccounts = accounts
    .filter((a) => a.accountType === "revenue" && a.isActive)
    .sort((a, b) => a.code.localeCompare(b.code));

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
      />
    </>
  );
}
