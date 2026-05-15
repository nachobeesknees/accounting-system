import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import {
  getAccounts,
  getBaseCurrency,
  getCurrencies,
  getCustomers,
  getDimensionsWithValues,
  getEntities,
  getFirmEntities,
  getLatestFxRateForCurrency,
  getVendors,
} from "@/lib/data";
import { getEntityScope } from "@/lib/entity-scope";
import {
  ensureAccountingPeriods,
  getAccountingPeriods,
} from "@/lib/periods";

import { NewBillForm } from "./NewBillForm";

export default async function Page() {
  await ensureAccountingPeriods(new Date().getUTCFullYear());
  const [
    vendorsAll,
    accountsAll,
    customersAll,
    entitiesAll,
    dimensionsWithValues,
    accountingPeriods,
    base,
    currencies,
    firmEntities,
    firmEntityId,
  ] = await Promise.all([
    getVendors(),
    getAccounts(),
    getCustomers(),
    getEntities(),
    getDimensionsWithValues(),
    getAccountingPeriods(),
    getBaseCurrency(),
    getCurrencies(),
    getFirmEntities(),
    getEntityScope(),
  ]);
  const baseCode = base?.code ?? "USD";
  // Currency that this bill will be issued in. Mirrors mutations.ts'
  // `getFirmIssuingCurrency()` — falls back through scoped firm →
  // first active firm → base.
  const scopedFirm = firmEntityId
    ? firmEntities.find((e) => e.id === firmEntityId)
    : undefined;
  const fallbackFirm =
    scopedFirm ?? firmEntities.find((e) => e.isActive) ?? firmEntities[0];
  const currentCurrencyCode = scopedFirm?.currencyCode
    ?? fallbackFirm?.currencyCode
    ?? baseCode;
  // Pre-fetch the latest FX rate for every active non-base currency.
  const activeCcyCodes = currencies
    .filter((c) => c.isActive && c.code !== baseCode)
    .map((c) => c.code);
  const latestFxRates: Record<string, number> = {};
  for (const code of activeCcyCodes) {
    const r = await getLatestFxRateForCurrency(code);
    if (r != null) latestFxRates[code] = r;
  }
  const vendors = vendorsAll
    .filter((v) => v.isActive)
    .sort((a, b) => a.code.localeCompare(b.code));
  const expenseAccounts = accountsAll
    .filter((a) => a.accountType === "expense" && a.isActive)
    .sort((a, b) => a.code.localeCompare(b.code));
  const customers = customersAll
    .filter((c) => c.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));
  const entities = entitiesAll
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code));

  const today = new Date().toISOString().slice(0, 10);
  const due = new Date();
  due.setUTCDate(due.getUTCDate() + 30);
  const defaultDueDate = due.toISOString().slice(0, 10);

  if (vendors.length === 0) {
    return (
      <>
        <PageHeader
          title="New bill"
          meta="Bills / New"
          actions={
            <ButtonLink href="/bills" variant="secondary">
              Cancel
            </ButtonLink>
          }
        />
        <div className="px-6 my-3.5">
          <Empty
            title="No vendors"
            body="Add a vendor before creating a bill."
            cta={
              <ButtonLink href="/vendors/new" variant="primary">
                + New vendor
              </ButtonLink>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="New bill"
        meta="Bills / New"
        actions={
          <ButtonLink href="/bills" variant="secondary">
            Cancel
          </ButtonLink>
        }
      />
      <NewBillForm
        vendors={vendors}
        expenseAccounts={expenseAccounts}
        customers={customers}
        entities={entities}
        today={today}
        defaultDueDate={defaultDueDate}
        dimensionsWithValues={dimensionsWithValues}
        accountingPeriods={accountingPeriods}
        baseCode={baseCode}
        currencyCode={currentCurrencyCode}
        latestFxRates={latestFxRates}
      />
    </>
  );
}
