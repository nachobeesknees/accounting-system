import { PageHeader } from "@/components/ui/PageHeader";
import { getAccounts, getDimensionsWithValues, getPeriods } from "@/lib/data";
import { NewEntryForm } from "./NewEntryForm";

export default async function Page() {
  const [accountsAll, periods, dimensionsWithValues] = await Promise.all([
    getAccounts(),
    getPeriods(),
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
        today={today}
        dimensionsWithValues={dimensionsWithValues}
      />
    </>
  );
}
