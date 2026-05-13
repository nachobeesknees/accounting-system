import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  getCustomers,
  getEmployeeRates,
  getEntities,
  getEntityFees,
  getUsers,
} from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import type { EntityFee } from "@/lib/types";
import { NewTimeForm } from "./NewTimeForm";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [users, rates, customers, entities, fees] = await Promise.all([
    getUsers(),
    getEmployeeRates(),
    getCustomers(),
    getEntities(),
    getEntityFees(),
  ]);

  const feesByEntityId: Record<string, EntityFee[]> = {};
  for (const fee of fees) {
    if (!feesByEntityId[fee.entityId]) feesByEntityId[fee.entityId] = [];
    feesByEntityId[fee.entityId]!.push(fee);
  }

  return (
    <>
      <PageHeader title="Log time" meta="Time / New" />
      <NewTimeForm
        users={users}
        rates={rates}
        customers={customers}
        entities={entities}
        feesByEntityId={feesByEntityId}
        currentUserId={user.userId}
      />
    </>
  );
}
