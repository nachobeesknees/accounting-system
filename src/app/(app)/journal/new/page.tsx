import { PageHeader } from "@/components/ui/PageHeader";
import {
  getAccounts,
  getDimensionsWithValues,
  getFirmEntities,
  getPeriods,
} from "@/lib/data";
import {
  ensureAccountingPeriods,
  getAccountingPeriods,
} from "@/lib/periods";
import { NewEntryForm } from "./NewEntryForm";

export default async function Page() {
  await ensureAccountingPeriods(new Date().getUTCFullYear());
  const [accountsAll, periods, firmEntities, dimensionsWithValues, accountingPeriods] =
    await Promise.all([
      getAccounts(),
      getPeriods(),
      getFirmEntities(),
      getDimensionsWithValues(),
      getAccountingPeriods(),
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
        accountingPeriods={accountingPeriods}
        firmEntities={firmEntities.filter((e) => e.isActive)}
        today={today}
        dimensionsWithValues={dimensionsWithValues}
      />
    </>
  );
}
