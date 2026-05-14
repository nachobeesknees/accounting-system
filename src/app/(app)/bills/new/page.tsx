import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import {
  getAccounts,
  getCustomers,
  getDimensionsWithValues,
  getEntities,
  getVendors,
} from "@/lib/data";

import { NewBillForm } from "./NewBillForm";

export default async function Page() {
  const [
    vendorsAll,
    accountsAll,
    customersAll,
    entitiesAll,
    dimensionsWithValues,
  ] = await Promise.all([
    getVendors(),
    getAccounts(),
    getCustomers(),
    getEntities(),
    getDimensionsWithValues(),
  ]);
  const vendors = vendorsAll
    .filter((v) => v.isActive)
    .sort((a, b) => a.code.localeCompare(b.code));
  const expenseAccounts = accountsAll
    .filter((a) => a.accountType === "expense" && a.isActive)
    .sort((a, b) => a.code.localeCompare(b.code));
  const customers = customersAll
    .filter((c) => c.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));
  const entities = entitiesAll
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code));

  const today = new Date().toISOString().slice(0, 10);
  const due = new Date();
  due.setUTCDate(due.getUTCDate() + 30);
  const defaultDueDate = due.toISOString().slice(0, 10);

  if (vendors.length === 0) {
    return (
      <>
        <PageHeader
          title="New bill"
          meta="Bills / New"
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
      <PageHeader
        title="New bill"
        meta="Bills / New"
        actions={
          <ButtonLink href="/bills" variant="secondary">
            Cancel
          </ButtonLink>
        }
      />
      <NewBillForm
        vendors={vendors}
        expenseAccounts={expenseAccounts}
        customers={customers}
        entities={entities}
        today={today}
        defaultDueDate={defaultDueDate}
        dimensionsWithValues={dimensionsWithValues}
      />
    </>
  );
}
