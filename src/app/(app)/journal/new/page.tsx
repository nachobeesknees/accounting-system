import { PageHeader } from "@/components/ui/PageHeader";
import {
  getAccounts,
  getBaseCurrency,
  getCurrencies,
  getDimensionsWithValues,
  getFirmEntities,
  getLatestFxRateForCurrency,
  getPeriods,
} from "@/lib/data";
import {
  ensureAccountingPeriods,
  getAccountingPeriods,
} from "@/lib/periods";
import { NewEntryForm } from "./NewEntryForm";

export default async function Page() {
  await ensureAccountingPeriods(new Date().getUTCFullYear());
  const [
    accountsAll,
    periods,
    firmEntities,
    dimensionsWithValues,
    accountingPeriods,
    base,
    currencies,
  ] = await Promise.all([
    getAccounts(),
    getPeriods(),
    getFirmEntities(),
    getDimensionsWithValues(),
    getAccountingPeriods(),
    getBaseCurrency(),
    getCurrencies(),
  ]);
  const accounts = accountsAll.filter((a) => a.isActive);
  const today = new Date().toISOString().slice(0, 10);
  const baseCode = base?.code ?? "USD";
  // Pre-fetch the latest FX rate for every active non-base currency, so the
  // optional "FX rate" disclosure on the JE form can default to the latest
  // stored rate when the user picks a non-base currency.
  const activeCcyCodes = currencies
    .filter((c) => c.isActive && c.code !== baseCode)
    .map((c) => c.code);
  const latestFxRates: Record<string, number> = {};
  for (const code of activeCcyCodes) {
    const r = await getLatestFxRateForCurrency(code);
    if (r != null) latestFxRates[code] = r;
  }

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
        baseCode={baseCode}
        currencyCodes={[baseCode, ...activeCcyCodes]}
        latestFxRates={latestFxRates}
      />
    </>
  );
}
