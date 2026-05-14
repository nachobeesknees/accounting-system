import { PageHeader } from "@/components/ui/PageHeader";
import {
  getAccounts,
  getDimensionsWithValues,
  getFirmEntities,
  getPeriods,
} from "@/lib/data";
import { NewEntryForm } from "./NewEntryForm";

export default async function Page() {
  const [accountsAll, periods, firmEntities, dimensionsWithValues] =
    await Promise.all([
      getAccounts(),
      getPeriods(),
      getFirmEntities(),
      getDimensionsWithValues(),
    ]);
  const accounts = accountsAll.filter((a) => a.isActive);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="New Journal Entry"
        meta="Draft a balanced entry — debits must equal credits."
      />
      <NewEntryForm
        accounts={accounts}
        periods={periods}
        firmEntities={firmEntities.filter((e) => e.isActive)}
        today={today}
        dimensionsWithValues={dimensionsWithValues}
      />
    </>
  );
}
