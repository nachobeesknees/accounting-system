import { PageHeader } from "@/components/ui/PageHeader";
import { getAccounts, getCustomers } from "@/lib/data";
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
  const [customers, accounts] = await Promise.all([
    getCustomers(),
    getAccounts(),
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
      />
    </>
  );
}
