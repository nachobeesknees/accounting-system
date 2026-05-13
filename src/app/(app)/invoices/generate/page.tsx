import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import {
  getCustomers,
  getEntities,
  getEntityFees,
  getPriceLists,
  getPriceListEntries,
} from "@/lib/data";
import type {
  Customer,
  Entity,
  EntityFee,
  PriceListEntry,
} from "@/lib/types";
import { GenerateInvoiceForm, type AddonOption } from "./GenerateInvoiceForm";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const params = await searchParams;
  const preselectedCustomer = params.customer ?? "";

  const [customers, entities, entityFees, priceLists] = await Promise.all([
    getCustomers(),
    getEntities(),
    getEntityFees(),
    getPriceLists(),
  ]);

  const currentPriceList =
    priceLists.find((pl) => pl.isCurrent) ?? priceLists[0];

  const priceListEntries: PriceListEntry[] = currentPriceList
    ? await getPriceListEntries(currentPriceList.id)
    : [];

  const addonOptions: AddonOption[] = priceListEntries
    .filter((e) => e.itemType === "service")
    .map((e) => ({
      key: e.itemKey,
      label: e.label,
      unitPrice: e.unitPrice,
    }));

  // entities grouped by customer (client) id
  const customerEntities = new Map<string, Entity[]>();
  for (const ent of entities) {
    const list = customerEntities.get(ent.clientId) ?? [];
    list.push(ent);
    customerEntities.set(ent.clientId, list);
  }

  // fees indexed by entityId
  const feesByEntity = new Map<string, EntityFee[]>();
  for (const f of entityFees) {
    const list = feesByEntity.get(f.entityId) ?? [];
    list.push(f);
    feesByEntity.set(f.entityId, list);
  }

  const sortedCustomers = customers
    .slice()
    .sort((a: Customer, b: Customer) => a.name.localeCompare(b.name));

  // Serialize the two maps into plain objects so they can cross the
  // server → client boundary cleanly.
  const customerEntitiesObj: Record<string, Entity[]> = {};
  for (const [k, v] of customerEntities.entries()) {
    customerEntitiesObj[k] = v
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code));
  }
  const feesByEntityObj: Record<string, EntityFee[]> = {};
  for (const [k, v] of feesByEntity.entries()) {
    feesByEntityObj[k] = v;
  }

  return (
    <>
      <PageHeader
        title="Generate invoice from annual fees"
        meta="Pull a client's entity fees for the year, optionally add common service charges, then send for approval."
        actions={
          <ButtonLink href="/invoices" variant="secondary">
            Cancel
          </ButtonLink>
        }
      />
      <GenerateInvoiceForm
        customers={sortedCustomers}
        customerEntities={customerEntitiesObj}
        feesByEntity={feesByEntityObj}
        addonOptions={addonOptions}
        preselectedCustomer={preselectedCustomer}
        today={todayISO()}
        dueDefault={plusDaysISO(30)}
        defaultBillingYear={2026}
      />
    </>
  );
}
