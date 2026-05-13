import { PageHeader } from "@/components/ui/PageHeader";
import { getOffices } from "@/lib/data";
import { NewPriceListForm } from "./NewPriceListForm";

export default async function Page() {
  const offices = await getOffices();
  return (
    <>
      <PageHeader title="New price list" meta="Price Lists / New" />
      <NewPriceListForm offices={offices} />
    </>
  );
}
