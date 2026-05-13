import { PageHeader } from "@/components/ui/PageHeader";
import { getAccounts, getPeriods } from "@/lib/data";
import { NewEntryForm } from "./NewEntryForm";

export default function Page() {
  const accounts = getAccounts().filter((a) => a.isActive);
  const periods = getPeriods();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="New Journal Entry"
        meta="Draft a balanced entry — debits must equal credits."
      />
      <NewEntryForm accounts={accounts} periods={periods} today={today} />
    </>
  );
}
