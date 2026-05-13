import { PageHeader } from "@/components/ui/PageHeader";
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
      <PageHeader title="Assign fee" meta="Fees / Assignments / New" />
      <NewAssignmentForm
        entities={entities}
        customers={customers}
        schedules={schedules}
        defaultEntityId={params.entity}
      />
    </>
  );
}
