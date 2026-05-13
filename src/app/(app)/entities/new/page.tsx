import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import {
  getBaseCurrency,
  getCurrencies,
  getCustomers,
  getEntities,
} from "@/lib/data";
import { NewEntityForm } from "./NewEntityForm";

function nextEntityCode(existing: string[]): string {
  const max = existing
    .map((c) => {
      const m = c.match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .reduce((a, b) => Math.max(a, b), 0);
  return `ENT-${String(max + 1).padStart(3, "0")}`;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const params = await searchParams;
  const [customers, entities, currencies, base] = await Promise.all([
    getCustomers(),
    getEntities(),
    getCurrencies(),
    getBaseCurrency(),
  ]);
  const nextCode = nextEntityCode(entities.map((e) => e.code));

  return (
    <>
      <Breadcrumbs items={[{ label: "Entities", href: "/entities" }, { label: "New" }]} />
      <PageHeader title="New entity" />
      <NewEntityForm
        customers={customers}
        currencies={currencies}
        nextCode={nextCode}
        defaultClientId={params.client}
        defaultCurrency={base?.code ?? "USD"}
      />
    </>
  );
}
