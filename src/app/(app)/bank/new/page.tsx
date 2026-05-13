import { PageHeader } from "@/components/ui/PageHeader";
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
      <PageHeader title="New bank account" meta="Bank / New" />
      <NewBankAccountForm
        glAccounts={glAccounts}
        entities={entities}
        customers={customers}
      />
    </>
  );
}
