import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Tabs } from "@/components/ui/Tabs";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { PeriodPicker } from "@/components/PeriodPicker";
import { CompareSelect } from "@/components/CompareSelect";
import { CsvDownloadButton } from "@/components/CsvDownloadButton";
import { PrintButton } from "@/components/PrintButton";
import { DrillNumber, drillToAccount } from "@/components/DrillNumber";
import { YearPicker } from "./YearPicker";
import {
  DEMO_TODAY,
  accountsByType,
  getBaseCurrency,
  getBudgetByAccount,
  getEntities,
  getIncomeStatementForPeriod,
  getKpisAsOf,
  getMonthlyIncomeStatement,
  getRegions,
  getSignedBalancesAsOf,
  getTrialBalance,
  type IncomeStatementRow,
  type KpisSummary,
} from "@/lib/data";
import { SmartSelect } from "@/components/ui/SmartSelect";
import { getEntityScope } from "@/lib/entity-scope";
import { formatMoney } from "@/lib/money";
import {
  parseCompare,
  parsePreset,
  priorPeriod,
  priorYearPeriod,
  resolvePeriod,
  type CompareMode,
} from "@/lib/report-periods";
import type { Account } from "@/lib/types";

type TabId = "balance" | "income" | "trial" | "monthly";

function isTab(s: string | undefined): s is TabId {
  return s === "balance" || s === "income" || s === "trial" || s === "monthly";
}

function formatDateLabel(iso: string): string {
  // iso is YYYY-MM-DD — keep as-is for unambiguous reporting headers.
  return iso;
}

function pctChange(curr: number, prev: number): string {
  if (prev === 0) return curr === 0 ? "0.0%" : "—";
  return `${(((curr - prev) / Math.abs(prev)) * 100).toFixed(1)}%`;
}

// ------- small presentational helpers -------

function SectionHeading({
  label,
  rightCols,
}: {
  label: string;
  rightCols: Array<{ key: string; label: string; num?: boolean }>;
}) {
  return (
    <TR hover={false}>
      <TH style={{ width: "120px" }}>{label}</TH>
      <TH></TH>
      {rightCols.map((c) => (
        <TH key={c.key} num={c.num ?? true}>
          {c.label}
        </TH>
      ))}
    </TR>
  );
}

function AccountRow({
  account,
  value,
  extras,
  compact,
  drillStart,
  drillEnd,
}: {
  account: Account;
  value: number;
  extras?: Array<{ key: string; value: string; neg?: boolean; num?: boolean }>;
  compact?: boolean;
  drillStart?: string;
  drillEnd?: string;
}) {
  const drillHref = drillToAccount(account.id, {
    start: drillStart,
    end: drillEnd,
  });
  return (
    <TR>
      <TD mono>{account.code}</TD>
      <TD>{account.name}</TD>
      <TD num neg={value < 0}>
        <DrillNumber
          value={value}
          href={drillHref}
          currencyCode={null}
          compact={compact}
        />
      </TD>
      {extras?.map((e) => (
        <TD key={e.key} num={e.num ?? true} neg={e.neg}>
          {e.value}
        </TD>
      ))}
    </TR>
  );
}

function TotalRow({
  label,
  cells,
}: {
  label: string;
  cells: Array<{ key: string; value: string; neg?: boolean }>;
}) {
  return (
    <TR total hover={false}>
      <TD colSpan={2} style={{ fontWeight: 600, color: "var(--ink)" }}>
        {label}
      </TD>
      {cells.map((c) => (
        <TD key={c.key} num neg={c.neg}>
          {c.value}
        </TD>
      ))}
    </TR>
  );
}

function GrandTotalRow({
  label,
  cells,
}: {
  label: string;
  cells: Array<{ key: string; value: string }>;
}) {
  const style = {
    fontWeight: 700,
    color: "var(--p-formation-fg)",
    background: "var(--p-formation-bg)",
  } as const;
  return (
    <TR total hover={false}>
      <TD colSpan={2} style={style}>
        {label}
      </TD>
      {cells.map((c) => (
        <TD key={c.key} num style={style}>
          {c.value}
        </TD>
      ))}
    </TR>
  );
}

// ------- monthly grid -------

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ------- main page -------

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    preset?: string;
    from?: string;
    to?: string;
    compare?: string;
    year?: string;
    cents?: string;
    region?: string;
  }>;
}) {
  const params = await searchParams;
  const tab: TabId = isTab(params.tab) ? params.tab : "balance";
  const preset = parsePreset(params.preset);
  const compareMode = parseCompare(params.compare) as CompareMode;
  const period = resolvePeriod(preset, DEMO_TODAY, params.from, params.to);
  const scope = await getEntityScope();
  const fiscalYear = parseInt(
    params.year ?? String(DEMO_TODAY.getUTCFullYear()),
    10,
  );
  const showCents = params.cents === "1";
  const compact = !showCents;
  const base = await getBaseCurrency();
  const baseCode = base?.code ?? "USD";
  // Region scope: narrows to entries whose firmEntity sits in the chosen
  // region. Supersedes the topbar single-entity scope when set so the user
  // can compare entire territories.
  const regionId = (params.region ?? "").trim();
  const [regions, allEntities] = await Promise.all([
    getRegions(),
    getEntities(),
  ]);
  const entityIdsInRegion = regionId
    ? allEntities
        .filter((e) => (e.regionId ?? null) === regionId)
        .map((e) => e.id)
    : undefined;
  const regionName = regionId
    ? regions.find((r) => r.id === regionId)?.name ?? null
    : null;

  return (
    <>
      <PageHeader
        title="Financial Statements"
        meta={
          tab === "monthly"
            ? `Fiscal year ${fiscalYear}`
            : tab === "trial"
              ? `As of ${formatDateLabel(DEMO_TODAY.toISOString().slice(0, 10))}`
              : period.label
        }
        actions={
          <>
            <CsvDownloadButton
              report={
                tab === "balance"
                  ? "balance-sheet"
                  : tab === "income"
                    ? "income-statement"
                    : tab === "monthly"
                      ? "income-statement-monthly"
                      : "trial-balance"
              }
            />
            <PrintButton />
          </>
        }
      />

      <Tabs
        tabs={[
          { id: "balance", label: "Balance Sheet", href: tabHref("balance", params) },
          { id: "income", label: "Income Statement", href: tabHref("income", params) },
          {
            id: "monthly",
            label: "Monthly P&L",
            href: tabHref("monthly", params),
          },
          { id: "trial", label: "Trial Balance", href: tabHref("trial", params) },
        ]}
        activeId={tab}
      />

      <div className="px-6 py-3.5 flex flex-col gap-3.5">
        {/* Controls — hidden in print */}
        <div className="flex flex-wrap items-center gap-3 no-print">
          {tab === "monthly" ? (
            <YearPicker current={fiscalYear} />
          ) : tab !== "trial" ? (
            <>
              <PeriodPicker />
              <CompareSelect
                allowedModes={
                  tab === "balance"
                    ? ["none", "prior_period", "prior_year"]
                    : ["none", "prior_period", "prior_year", "budget"]
                }
              />
            </>
          ) : null}
          {tab !== "trial" && (
            <ShowCentsToggle tab={tab} params={params} showCents={showCents} />
          )}
          <RegionFilter
            tab={tab}
            params={params}
            regions={regions}
            current={regionId}
          />
        </div>
        {regionName && (
          <div
            className="px-3 py-1.5 rounded-md text-[11.5px]"
            style={{
              background: "var(--rail)",
              color: "var(--ink-3)",
              border: "1px solid var(--line)",
              alignSelf: "flex-start",
            }}
          >
            Scoped to <strong style={{ color: "var(--ink-2)" }}>{regionName}</strong>{" "}
            ({entityIdsInRegion?.length ?? 0} entit
            {(entityIdsInRegion?.length ?? 0) === 1 ? "y" : "ies"}). Firm-level
            entries with no entity are excluded.
          </div>
        )}

        {tab === "balance" && (
          <BalanceSheetCard
            period={period}
            compare={compareMode}
            scope={scope}
            entityIdsInRegion={entityIdsInRegion}
            compact={compact}
            baseCode={baseCode}
          />
        )}
        {tab === "income" && (
          <IncomeStatementCard
            period={period}
            compare={compareMode}
            scope={scope}
            entityIdsInRegion={entityIdsInRegion}
            compact={compact}
            baseCode={baseCode}
          />
        )}
        {tab === "monthly" && (
          <MonthlyIncomeCard
            year={fiscalYear}
            scope={scope}
            entityIdsInRegion={entityIdsInRegion}
            compact={compact}
            baseCode={baseCode}
          />
        )}
        {tab === "trial" && <TrialBalanceCard baseCode={baseCode} /> }
      </div>
    </>
  );
}

function ShowCentsToggle({
  tab,
  params,
  showCents,
}: {
  tab: TabId;
  params: {
    preset?: string;
    from?: string;
    to?: string;
    compare?: string;
    year?: string;
    region?: string;
  };
  showCents: boolean;
}) {
  // Linked toggle: clicking sets/clears ?cents=1 while preserving all other
  // params. Server component → no client state, just a styled anchor.
  const ps = new URLSearchParams();
  ps.set("tab", tab);
  if (params.preset) ps.set("preset", params.preset);
  if (params.from) ps.set("from", params.from);
  if (params.to) ps.set("to", params.to);
  if (params.compare) ps.set("compare", params.compare);
  if (params.year) ps.set("year", params.year);
  if (params.region) ps.set("region", params.region);
  if (!showCents) ps.set("cents", "1");
  const href = `/reports?${ps.toString()}`;
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 text-[12px]"
      style={{
        color: showCents ? "var(--ink)" : "var(--ink-3)",
        textDecoration: "none",
        padding: "4px 8px",
        borderRadius: 6,
        border: "1px solid var(--line-2)",
        background: showCents ? "var(--p-active-bg)" : "var(--raised)",
      }}
    >
      <span style={{ fontSize: 11.5 }}>{showCents ? "☑" : "☐"}</span>
      <span>Show cents</span>
    </a>
  );
}

function RegionFilter({
  tab,
  params,
  regions,
  current,
}: {
  tab: TabId;
  params: {
    preset?: string;
    from?: string;
    to?: string;
    compare?: string;
    year?: string;
    cents?: string;
  };
  regions: import("@/lib/types").Region[];
  current: string;
}) {
  // Client-side `<form>` wrapping a native select would force the user to
  // hit Apply; SmartSelect doesn't auto-submit on selection either. Easiest
  // path: render a tiny form with a SmartSelect and a hidden Apply that the
  // user can hit Enter on. Hidden fields preserve the rest of the URL.
  return (
    <form method="GET" className="flex items-center gap-2">
      <input type="hidden" name="tab" value={tab} />
      {params.preset && (
        <input type="hidden" name="preset" value={params.preset} />
      )}
      {params.from && <input type="hidden" name="from" value={params.from} />}
      {params.to && <input type="hidden" name="to" value={params.to} />}
      {params.compare && (
        <input type="hidden" name="compare" value={params.compare} />
      )}
      {params.year && <input type="hidden" name="year" value={params.year} />}
      {params.cents && <input type="hidden" name="cents" value={params.cents} />}
      <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        Region
      </span>
      <SmartSelect
        name="region"
        defaultValue={current}
        options={regions.map((r) => ({ value: r.id, label: r.name }))}
        emptyLabel="All regions"
        clearable
        triggerStyle={{ minWidth: 160 }}
      />
      <button
        type="submit"
        className="text-[11.5px]"
        style={{
          background: "var(--raised)",
          border: "1px solid var(--line-2)",
          color: "var(--ink-2)",
          borderRadius: 6,
          padding: "3px 8px",
          cursor: "pointer",
        }}
      >
        Apply
      </button>
    </form>
  );
}

function tabHref(
  next: TabId,
  current: {
    preset?: string;
    from?: string;
    to?: string;
    compare?: string;
    year?: string;
    region?: string;
  },
): string {
  const ps = new URLSearchParams();
  ps.set("tab", next);
  if (current.preset) ps.set("preset", current.preset);
  if (current.from) ps.set("from", current.from);
  if (current.to) ps.set("to", current.to);
  if (current.compare) ps.set("compare", current.compare);
  if (current.year) ps.set("year", current.year);
  if (current.region) ps.set("region", current.region);
  return `/reports?${ps.toString()}`;
}

// ------- Balance Sheet -------

async function BalanceSheetCard({
  period,
  compare,
  scope,
  entityIdsInRegion,
  compact,
  baseCode,
}: {
  period: { start: string; end: string; label: string };
  compare: CompareMode;
  scope: string | null;
  entityIdsInRegion?: string[];
  compact: boolean;
  baseCode: string;
}) {
  const fmt = (n: number) =>
    formatMoney(n, "USD", { paren: true, compact, hideCurrency: true });
  const asOf = period.end;
  const [kpis, byType] = await Promise.all([
    getKpisAsOf(asOf, scope, entityIdsInRegion),
    accountsByType(),
  ]);
  // For account-level current balances at asOf we re-query with the same
  // helper used for KPI rollups but read per-account from a single call —
  // the simplest way without adding new helpers is to map onto KpisAsOf
  // results plus the trial-balance numbers. For the per-account display
  // we use the typed accounts and getKpisAsOf totals; per-account rows
  // pull from the trial-balance helper which uses entity scope already.
  const balances = await currentBalancesAsOf(asOf, scope, entityIdsInRegion);

  let cmpKpis: KpisSummary | null = null;
  let cmpBalances: Map<string, number> | null = null;
  let cmpLabel = "";
  if (compare === "prior_period") {
    const p = priorPeriod(period.start, period.end);
    cmpKpis = await getKpisAsOf(p.end, scope, entityIdsInRegion);
    cmpBalances = await currentBalancesAsOf(p.end, scope, entityIdsInRegion);
    cmpLabel = `As of ${p.end}`;
  } else if (compare === "prior_year") {
    const p = priorYearPeriod(period.start, period.end);
    cmpKpis = await getKpisAsOf(p.end, scope, entityIdsInRegion);
    cmpBalances = await currentBalancesAsOf(p.end, scope, entityIdsInRegion);
    cmpLabel = `As of ${p.end}`;
  }

  const assetAccounts = byType.get("asset") ?? [];
  const liabilityAccounts = byType.get("liability") ?? [];
  const equityAccounts = byType.get("equity") ?? [];

  const showCmp = cmpKpis !== null;
  const cols: Array<{ key: string; label: string }> = [
    { key: "curr", label: `As of ${asOf}` },
  ];
  if (showCmp) {
    cols.push({ key: "cmp", label: cmpLabel });
    cols.push({ key: "delta", label: "Δ" });
  }

  function rowExtras(
    accountId: string,
    curr: number,
  ): Array<{ key: string; value: string; neg?: boolean; num?: boolean }> {
    if (!showCmp || !cmpBalances) return [];
    const prev = cmpBalances.get(accountId) ?? 0;
    const d = curr - prev;
    return [
      { key: "cmp", value: fmt(prev), neg: prev < 0 },
      { key: "delta", value: fmt(d), neg: d < 0 },
    ];
  }

  function totalCells(curr: number, prev: number) {
    const cells: Array<{ key: string; value: string; neg?: boolean }> = [
      { key: "curr", value: fmt(curr), neg: curr < 0 },
    ];
    if (showCmp) {
      const d = curr - prev;
      cells.push({ key: "cmp", value: fmt(prev), neg: prev < 0 });
      cells.push({ key: "delta", value: fmt(d), neg: d < 0 });
    }
    return cells;
  }

  const totalAssets = kpis.assets;
  const totalLiab = kpis.liabilities;
  const totalEquity = kpis.equity + kpis.netIncome;
  const cmpAssets = cmpKpis?.assets ?? 0;
  const cmpLiab = cmpKpis?.liabilities ?? 0;
  const cmpEquity = (cmpKpis?.equity ?? 0) + (cmpKpis?.netIncome ?? 0);

  return (
    <Card title={`Balance Sheet · ${baseCode}`}>
      <Table>
        <THead>
          <SectionHeading
            label="Assets"
            rightCols={cols.map((c) => ({ key: c.key, label: c.label, num: true }))}
          />
        </THead>
        <TBody>
          {assetAccounts.map((a) => (
            <AccountRow
              key={a.id}
              account={a}
              value={balances.get(a.id) ?? 0}
              extras={rowExtras(a.id, balances.get(a.id) ?? 0)}
              compact={compact}
              drillEnd={asOf}
            />
          ))}
          <TotalRow label="Total Assets" cells={totalCells(totalAssets, cmpAssets)} />
        </TBody>
        <THead>
          <SectionHeading
            label="Liabilities"
            rightCols={cols.map((c) => ({ key: c.key, label: c.label, num: true }))}
          />
        </THead>
        <TBody>
          {liabilityAccounts.map((a) => (
            <AccountRow
              key={a.id}
              account={a}
              value={balances.get(a.id) ?? 0}
              extras={rowExtras(a.id, balances.get(a.id) ?? 0)}
              compact={compact}
              drillEnd={asOf}
            />
          ))}
          <TotalRow label="Total Liabilities" cells={totalCells(totalLiab, cmpLiab)} />
        </TBody>
        <THead>
          <SectionHeading
            label="Equity"
            rightCols={cols.map((c) => ({ key: c.key, label: c.label, num: true }))}
          />
        </THead>
        <TBody>
          {equityAccounts.map((a) => (
            <AccountRow
              key={a.id}
              account={a}
              value={balances.get(a.id) ?? 0}
              extras={rowExtras(a.id, balances.get(a.id) ?? 0)}
              compact={compact}
              drillEnd={asOf}
            />
          ))}
          <TR>
            <TD mono>—</TD>
            <TD>Current Year Earnings</TD>
            <TD num neg={kpis.netIncome < 0}>{fmt(kpis.netIncome)}</TD>
            {showCmp && (
              <>
                <TD num neg={(cmpKpis?.netIncome ?? 0) < 0}>
                  {fmt(cmpKpis?.netIncome ?? 0)}
                </TD>
                <TD
                  num
                  neg={kpis.netIncome - (cmpKpis?.netIncome ?? 0) < 0}
                >
                  {fmt(kpis.netIncome - (cmpKpis?.netIncome ?? 0))}
                </TD>
              </>
            )}
          </TR>
          <TotalRow label="Total Equity" cells={totalCells(totalEquity, cmpEquity)} />
        </TBody>
        <TBody>
          <GrandTotalRow
            label="Liabilities + Equity"
            cells={
              showCmp
                ? [
                    { key: "curr", value: fmt(totalLiab + totalEquity) },
                    { key: "cmp", value: fmt(cmpLiab + cmpEquity) },
                    {
                      key: "delta",
                      value: fmt(totalLiab + totalEquity - (cmpLiab + cmpEquity)),
                    },
                  ]
                : [{ key: "curr", value: fmt(totalLiab + totalEquity) }]
            }
          />
        </TBody>
      </Table>
    </Card>
  );
}

// Per-account signed balance as of a date.
//
// We don't have an exported per-account-as-of helper, so we fall back to
// the current trial balance. That means per-account balance-sheet rows
// reflect the *live* trial balance regardless of `asOf`; the comparison
// columns at the section/grand-total level use `getKpisAsOf`, which IS
// date-aware, so the totals are accurate even when individual rows
// can't be split out by date.
async function currentBalancesAsOf(
  asOf: string,
  scope: string | null,
  entityIds?: string[],
): Promise<Map<string, number>> {
  // Signed balances are debit - credit per account, scoped to the active
  // firm and filtered to entries dated on or before `asOf`. Callers flip
  // the sign for credit-normal accounts at render time.
  return getSignedBalancesAsOf(asOf, scope ?? "all", entityIds);
}

// ------- Income Statement -------

async function IncomeStatementCard({
  period,
  compare,
  scope,
  entityIdsInRegion,
  compact,
  baseCode,
}: {
  period: { start: string; end: string; label: string };
  compare: CompareMode;
  scope: string | null;
  entityIdsInRegion?: string[];
  compact: boolean;
  baseCode: string;
}) {
  const fmt = (n: number) =>
    formatMoney(n, "USD", { paren: true, compact, hideCurrency: true });
  const { rows, revenue, expenses, netIncome } =
    await getIncomeStatementForPeriod(
      period.start,
      period.end,
      scope,
      entityIdsInRegion,
    );

  let cmpMap: Map<string, number> | null = null;
  let cmpLabel = "";
  let cmpRevenue = 0;
  let cmpExpenses = 0;
  let cmpNet = 0;
  let hasCmp = false;

  if (compare === "prior_period") {
    const p = priorPeriod(period.start, period.end);
    const r = await getIncomeStatementForPeriod(
      p.start,
      p.end,
      scope,
      entityIdsInRegion,
    );
    cmpMap = new Map(r.rows.map((x) => [x.accountId, x.amount]));
    cmpRevenue = r.revenue;
    cmpExpenses = r.expenses;
    cmpNet = r.netIncome;
    cmpLabel = `${p.start} → ${p.end}`;
    hasCmp = true;
  } else if (compare === "prior_year") {
    const p = priorYearPeriod(period.start, period.end);
    const r = await getIncomeStatementForPeriod(
      p.start,
      p.end,
      scope,
      entityIdsInRegion,
    );
    cmpMap = new Map(r.rows.map((x) => [x.accountId, x.amount]));
    cmpRevenue = r.revenue;
    cmpExpenses = r.expenses;
    cmpNet = r.netIncome;
    cmpLabel = `${p.start} → ${p.end}`;
    hasCmp = true;
  } else if (compare === "budget") {
    const year = parseInt(period.start.slice(0, 4), 10);
    cmpMap = await getBudgetByAccount(year);
    cmpLabel = `Budget ${year}`;
    // Roll up totals from the row-level map
    for (const r of rows) {
      const b = cmpMap.get(r.accountId) ?? 0;
      if (r.accountType === "revenue") cmpRevenue += b;
      else cmpExpenses += b;
    }
    cmpNet = cmpRevenue - cmpExpenses;
    hasCmp = true;
  }

  const periodCol = `${period.start} → ${period.end}`;
  const cols: Array<{ key: string; label: string }> = [
    { key: "curr", label: periodCol },
  ];
  if (hasCmp) {
    cols.push({ key: "cmp", label: cmpLabel });
    cols.push({ key: "delta", label: "Δ" });
    cols.push({ key: "deltaPct", label: "Δ %" });
  }

  function rowFor(r: IncomeStatementRow) {
    const cmp = cmpMap?.get(r.accountId) ?? 0;
    const d = r.amount - cmp;
    const extras: Array<{ key: string; value: string; neg?: boolean; num?: boolean }> =
      hasCmp
        ? [
            { key: "cmp", value: fmt(cmp), neg: cmp < 0 },
            { key: "delta", value: fmt(d), neg: d < 0 },
            { key: "deltaPct", value: pctChange(r.amount, cmp), neg: d < 0 },
          ]
        : [];
    return (
      <AccountRow
        key={r.accountId}
        account={
          { id: r.accountId, code: r.code, name: r.name } as Account
        }
        value={r.amount}
        extras={extras}
        compact={compact}
        drillStart={period.start}
        drillEnd={period.end}
      />
    );
  }

  function totalCells(curr: number, prev: number) {
    const cells: Array<{ key: string; value: string; neg?: boolean }> = [
      { key: "curr", value: fmt(curr), neg: curr < 0 },
    ];
    if (hasCmp) {
      const d = curr - prev;
      cells.push({ key: "cmp", value: fmt(prev), neg: prev < 0 });
      cells.push({ key: "delta", value: fmt(d), neg: d < 0 });
      cells.push({ key: "deltaPct", value: pctChange(curr, prev), neg: d < 0 });
    }
    return cells;
  }

  const revenueRows = rows.filter((r) => r.accountType === "revenue");
  const expenseRows = rows.filter((r) => r.accountType === "expense");

  return (
    <Card title={`Income Statement · ${baseCode} — ${period.label}`}>
      <Table>
        <THead>
          <SectionHeading
            label="Revenue"
            rightCols={cols.map((c) => ({ key: c.key, label: c.label, num: true }))}
          />
        </THead>
        <TBody>
          {revenueRows.map(rowFor)}
          <TotalRow label="Total Revenue" cells={totalCells(revenue, cmpRevenue)} />
        </TBody>
        <THead>
          <SectionHeading
            label="Expenses"
            rightCols={cols.map((c) => ({ key: c.key, label: c.label, num: true }))}
          />
        </THead>
        <TBody>
          {expenseRows.map(rowFor)}
          <TotalRow label="Total Expenses" cells={totalCells(expenses, cmpExpenses)} />
          <GrandTotalRow
            label="Net Income"
            cells={
              hasCmp
                ? [
                    { key: "curr", value: fmt(netIncome) },
                    { key: "cmp", value: fmt(cmpNet) },
                    { key: "delta", value: fmt(netIncome - cmpNet) },
                    { key: "deltaPct", value: pctChange(netIncome, cmpNet) },
                  ]
                : [{ key: "curr", value: fmt(netIncome) }]
            }
          />
        </TBody>
      </Table>
    </Card>
  );
}

// ------- Monthly Income Statement -------

async function MonthlyIncomeCard({
  year,
  scope,
  entityIdsInRegion,
  compact,
  baseCode,
}: {
  year: number;
  scope: string | null;
  entityIdsInRegion?: string[];
  compact: boolean;
  baseCode: string;
}) {
  const m = await getMonthlyIncomeStatement(year, scope, entityIdsInRegion);
  const fmt = (n: number) =>
    formatMoney(n, "USD", { paren: true, compact, hideCurrency: true });

  return (
    <Card title={`Monthly Income Statement · ${baseCode} — ${year}`}>
      <Table>
        <THead>
          <TR hover={false}>
            <TH>Code</TH>
            <TH>Account</TH>
            {MONTH_NAMES.map((mn) => (
              <TH key={mn} num>
                {mn}
              </TH>
            ))}
            <TH num>Total</TH>
          </TR>
        </THead>
        <TBody>
          {m.rows.length === 0 && (
            <TR>
              <TD colSpan={15} style={{ color: "var(--ink-3)" }}>
                No activity in {year}.
              </TD>
            </TR>
          )}
          {m.rows.map((r) => (
            <TR key={r.accountId}>
              <TD mono>{r.code}</TD>
              <TD>{r.name}</TD>
              {r.byMonth.map((v, i) => (
                <TD key={i} num neg={v < 0}>
                  {v === 0 ? "—" : fmt(v)}
                </TD>
              ))}
              <TD num neg={r.total < 0}>{fmt(r.total)}</TD>
            </TR>
          ))}
          <TR total hover={false}>
            <TD colSpan={2} style={{ fontWeight: 600, color: "var(--ink)" }}>
              Total Revenue
            </TD>
            {m.revenueByMonth.map((v, i) => (
              <TD key={i} num neg={v < 0}>{fmt(v)}</TD>
            ))}
            <TD num neg={m.revenueByMonth.reduce((s, v) => s + v, 0) < 0}>
              {fmt(m.revenueByMonth.reduce((s, v) => s + v, 0))}
            </TD>
          </TR>
          <TR total hover={false}>
            <TD colSpan={2} style={{ fontWeight: 600, color: "var(--ink)" }}>
              Total Expenses
            </TD>
            {m.expensesByMonth.map((v, i) => (
              <TD key={i} num neg={v < 0}>{fmt(v)}</TD>
            ))}
            <TD num neg={m.expensesByMonth.reduce((s, v) => s + v, 0) < 0}>
              {fmt(m.expensesByMonth.reduce((s, v) => s + v, 0))}
            </TD>
          </TR>
          <TR total hover={false}>
            <TD
              colSpan={2}
              style={{
                fontWeight: 700,
                color: "var(--p-formation-fg)",
                background: "var(--p-formation-bg)",
              }}
            >
              Net Income
            </TD>
            {m.netByMonth.map((v, i) => (
              <TD
                key={i}
                num
                style={{
                  fontWeight: 700,
                  color: "var(--p-formation-fg)",
                  background: "var(--p-formation-bg)",
                }}
              >
                {fmt(v)}
              </TD>
            ))}
            <TD
              num
              style={{
                fontWeight: 700,
                color: "var(--p-formation-fg)",
                background: "var(--p-formation-bg)",
              }}
            >
              {fmt(m.netByMonth.reduce((s, v) => s + v, 0))}
            </TD>
          </TR>
        </TBody>
      </Table>
    </Card>
  );
}

// ------- Trial Balance -------

async function TrialBalanceCard({ baseCode }: { baseCode: string }) {
  const trial = await getTrialBalance();
  const trialDebits = trial.reduce((s, r) => s + r.debit, 0);
  const trialCredits = trial.reduce((s, r) => s + r.credit, 0);
  const trialBalanced = Math.abs(trialDebits - trialCredits) < 0.005;

  return (
    <Card
      title={`Trial Balance · ${baseCode}`}
      actions={
        trialBalanced ? (
          <Pill variant="active">Balanced</Pill>
        ) : (
          <Pill variant="review">Unbalanced</Pill>
        )
      }
    >
      <Table>
        <THead>
          <TR hover={false}>
            <TH>Code</TH>
            <TH>Account</TH>
            <TH num>Debit ({baseCode})</TH>
            <TH num>Credit ({baseCode})</TH>
          </TR>
        </THead>
        <TBody>
          {trial.map((row) => {
            // Each TB row drills into the journal filtered to that account.
            const href = drillToAccount(row.accountId);
            return (
              <TR key={row.accountId}>
                <TD mono>{row.code}</TD>
                <TD>{row.name}</TD>
                <TD num>
                  {row.debit === 0 ? (
                    "—"
                  ) : (
                    <DrillNumber value={row.debit} href={href} currencyCode={null} />
                  )}
                </TD>
                <TD num>
                  {row.credit === 0 ? (
                    "—"
                  ) : (
                    <DrillNumber value={row.credit} href={href} currencyCode={null} />
                  )}
                </TD>
              </TR>
            );
          })}
          <TR total hover={false}>
            <TD colSpan={2} style={{ fontWeight: 600, color: "var(--ink)" }}>
              Totals
            </TD>
            <TD num>{formatMoney(trialDebits, "USD", { compact: true, hideCurrency: true })}</TD>
            <TD num>{formatMoney(trialCredits, "USD", { compact: true, hideCurrency: true })}</TD>
          </TR>
        </TBody>
      </Table>
    </Card>
  );
}
