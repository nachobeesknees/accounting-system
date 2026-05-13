import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { ButtonLink } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import { getAccounts, getVendors } from "@/lib/data";

import { NewBillForm } from "./NewBillForm";

export default async function Page() {
  const [vendorsAll, accountsAll] = await Promise.all([
    getVendors(),
    getAccounts(),
  ]);
  const vendors = vendorsAll
    .filter((v) => v.isActive)
    .sort((a, b) => a.code.localeCompare(b.code));
  const expenseAccounts = accountsAll
    .filter((a) => a.accountType === "expense" && a.isActive)
    .sort((a, b) => a.code.localeCompare(b.code));

  const today = new Date().toISOString().slice(0, 10);
  const due = new Date();
  due.setUTCDate(due.getUTCDate() + 30);
  const defaultDueDate = due.toISOString().slice(0, 10);

  if (vendors.length === 0) {
    return (
      <>
        <Breadcrumbs items={[{ label: "Bills", href: "/bills" }, { label: "New" }]} />
        <PageHeader
          title="New bill"
          actions={
            <ButtonLink href="/bills" variant="secondary">
              Cancel
            </ButtonLink>
          }
        />
        <div className="px-6 my-3.5">
          <Empty
            title="No vendors"
            body="Add a vendor before creating a bill."
            cta={
              <ButtonLink href="/vendors/new" variant="primary">
                + New vendor
              </ButtonLink>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Breadcrumbs items={[{ label: "Bills", href: "/bills" }, { label: "New" }]} />
      <PageHeader
        title="New bill"
        actions={
          <ButtonLink href="/bills" variant="secondary">
            Cancel
          </ButtonLink>
        }
      />
      <NewBillForm
        vendors={vendors}
        expenseAccounts={expenseAccounts}
        today={today}
        defaultDueDate={defaultDueDate}
      />
    </>
  );
}
