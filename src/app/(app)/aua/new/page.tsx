import { PageHeader } from "@/components/ui/PageHeader";
import { getCustomers, getEntities } from "@/lib/data";
import { NewAssetForm } from "./NewAssetForm";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const params = await searchParams;
  const [entities, customers] = await Promise.all([getEntities(), getCustomers()]);
  return (
    <>
      <PageHeader title="New asset" meta="Assets / New" />
      <NewAssetForm
        entities={entities}
        customers={customers}
        defaultEntityId={params.entity}
      />
    </>
  );
}
