import { notFound } from "next/navigation";

import { ButtonLink } from "@/components/ui/Button";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill, statusVariant } from "@/components/ui/Pill";
import {
  getAccounts,
  getBankAccounts,
  getRecurringPaymentById,
  getVendors,
} from "@/lib/data";

import { EditRecurringForm } from "./EditRecurringForm";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const [payment, accountsAll, vendorsAll, bankAccountsAll] = await Promise.all(
    [
      getRecurringPaymentById(id),
      getAccounts("all"),
      getVendors(),
      getBankAccounts(),
    ],
  );

  if (!payment) notFound();

  const expenseAccounts = accountsAll
    .filter((a) => a.accountType === "expense")
    .sort((a, b) => a.code.localeCompare(b.code));
  const vendors = vendorsAll
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const bankAccounts = bankAccountsAll
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Cash Forecast", href: "/cash-forecast" },
          { label: "Recurring", href: "/cash-forecast/recurring" },
          { label: payment.name },
        ]}
      />
      <PageHeader
        title={payment.name}
        meta="Recurring payment"
        actions={
          <>
            <ButtonLink href="/cash-forecast/recurring" variant="secondary">
              ← All recurring
            </ButtonLink>
            <Pill variant={statusVariant(payment.isActive ? "active" : "inactive")}>
              {payment.isActive ? "Active" : "Inactive"}
            </Pill>
          </>
        }
      />

      <div className="px-6 py-3.5 pb-8 flex flex-col gap-3.5">
        {sp.updated && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            Recurring payment updated.
          </div>
        )}
        {sp.error && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            {sp.error}
          </div>
        )}

        <EditRecurringForm
          payment={payment}
          expenseAccounts={expenseAccounts}
          vendors={vendors}
          bankAccounts={bankAccounts}
        />
      </div>
    </>
  );
}
