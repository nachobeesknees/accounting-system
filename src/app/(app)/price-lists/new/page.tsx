import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { getOffices } from "@/lib/data";
import { NewPriceListForm } from "./NewPriceListForm";

export default async function Page() {
  const offices = await getOffices();
  return (
    <>
      <Breadcrumbs items={[{ label: "Price Lists", href: "/price-lists" }, { label: "New" }]} />
      <PageHeader title="New price list" />
      <NewPriceListForm offices={offices} />
    </>
  );
}
