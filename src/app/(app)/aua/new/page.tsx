import { PageHeader } from "@/components/ui/PageHeader";
import {
  getAccounts,
  getBankAccounts,
  getCustomers,
  getEntities,
} from "@/lib/data";
import { NewAssetForm } from "./NewAssetForm";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const params = await searchParams;
  const [entities, customers, bankAccounts, glAccounts] = await Promise.all([
    getEntities(),
    getCustomers(),
    getBankAccounts(),
    getAccounts(),
  ]);
  return (
    <>
      <PageHeader title="New asset" meta="Assets / New" />
      <NewAssetForm
        entities={entities}
        customers={customers}
        bankAccounts={bankAccounts}
        glAccounts={glAccounts}
        defaultEntityId={params.entity}
      />
    </>
  );
}
