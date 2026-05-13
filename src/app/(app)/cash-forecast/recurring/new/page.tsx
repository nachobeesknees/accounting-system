import { ButtonLink } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAccounts, getBankAccounts, getVendors } from "@/lib/data";

import { NewRecurringForm } from "./NewRecurringForm";

export default async function Page() {
  const [accountsAll, vendorsAll, bankAccountsAll] = await Promise.all([
    getAccounts("all"),
    getVendors(),
    getBankAccounts(),
  ]);

  const expenseAccounts = accountsAll
    .filter((a) => a.accountType === "expense" && a.isActive)
    .sort((a, b) => a.code.localeCompare(b.code));
  const vendors = vendorsAll
    .filter((v) => v.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));
  const bankAccounts = bankAccountsAll
    .filter((b) => b.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));

  const due = new Date();
  due.setUTCDate(due.getUTCDate() + 30);
  const defaultDate = due.toISOString().slice(0, 10);

  if (expenseAccounts.length === 0) {
    return (
      <>
        <PageHeader
          title="New recurring payment"
          meta="Recurring payments / New"
          actions={
            <ButtonLink href="/cash-forecast/recurring" variant="secondary">
              Cancel
            </ButtonLink>
          }
        />
        <div className="px-6 my-3.5">
          <Empty
            title="No expense accounts"
            body="Add an expense account before creating a recurring payment."
            cta={
              <ButtonLink href="/accounts" variant="primary">
                Chart of accounts
              </ButtonLink>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="New recurring payment"
        meta="Recurring payments / New"
        actions={
          <ButtonLink href="/cash-forecast/recurring" variant="secondary">
            Cancel
          </ButtonLink>
        }
      />
      <NewRecurringForm
        expenseAccounts={expenseAccounts}
        vendors={vendors}
        bankAccounts={bankAccounts}
        defaultNextPaymentDate={defaultDate}
      />
    </>
  );
}
