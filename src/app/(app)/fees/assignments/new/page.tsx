import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { getCustomers, getEntities, getFeeSchedules } from "@/lib/data";
import { NewAssignmentForm } from "./NewAssignmentForm";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const params = await searchParams;
  const [entities, customers, schedules] = await Promise.all([
    getEntities(),
    getCustomers(),
    getFeeSchedules(),
  ]);
  return (
    <>
      <Breadcrumbs items={[{ label: "Fees", href: "/fees" }, { label: "Assign" }]} />
      <PageHeader title="Assign fee" />
      <NewAssignmentForm
        entities={entities}
        customers={customers}
        schedules={schedules}
        defaultEntityId={params.entity}
      />
    </>
  );
}
