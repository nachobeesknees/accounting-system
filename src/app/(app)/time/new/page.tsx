import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  getCustomers,
  getEmployeeRates,
  getEntities,
  getUsers,
} from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { NewTimeForm } from "./NewTimeForm";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [users, rates, customers, entities] = await Promise.all([
    getUsers(),
    getEmployeeRates(),
    getCustomers(),
    getEntities(),
  ]);

  return (
    <>
      <PageHeader title="Log time" meta="Time / New" />
      <NewTimeForm
        users={users}
        rates={rates}
        customers={customers}
        entities={entities}
        currentUserId={user.userId}
      />
    </>
  );
}
