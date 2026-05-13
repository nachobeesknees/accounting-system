import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
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
      <Breadcrumbs items={[{ label: "Assets / AUA", href: "/aua" }, { label: "New" }]} />
      <PageHeader title="New asset" />
      <NewAssetForm
        entities={entities}
        customers={customers}
        defaultEntityId={params.entity}
      />
    </>
  );
}
