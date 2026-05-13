import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { getAccounts, getPeriods } from "@/lib/data";
import { NewEntryForm } from "./NewEntryForm";

export default async function Page() {
  const [accountsAll, periods] = await Promise.all([getAccounts(), getPeriods()]);
  const accounts = accountsAll.filter((a) => a.isActive);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Journal Entries", href: "/journal" },
          { label: "New" },
        ]}
      />
      <PageHeader
        title="New Journal Entry"
        meta="Draft a balanced entry — debits must equal credits."
      />
      <NewEntryForm accounts={accounts} periods={periods} today={today} />
    </>
  );
}
