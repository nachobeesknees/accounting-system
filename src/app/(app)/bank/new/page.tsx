import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { getAccounts, getCustomers, getEntities } from "@/lib/data";
import { NewBankAccountForm } from "./NewBankAccountForm";

export default async function Page() {
  const [glAccounts, entities, customers] = await Promise.all([
    getAccounts(),
    getEntities(),
    getCustomers(),
  ]);
  return (
    <>
      <Breadcrumbs items={[{ label: "Bank Accounts", href: "/bank" }, { label: "New" }]} />
      <PageHeader title="New bank account" />
      <NewBankAccountForm
        glAccounts={glAccounts}
        entities={entities}
        customers={customers}
      />
    </>
  );
}
