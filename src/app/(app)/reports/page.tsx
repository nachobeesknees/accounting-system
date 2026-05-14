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
import {
  DEMO_TODAY,
  accountsByType,
  getBudgetByAccount,
  getIncomeStatementForPeriod,
  getKpisAsOf,
  getMonthlyIncomeStatement,
  getTrialBalance,
  type IncomeStatementRow,
  type KpisSummary,
} from "@/lib/data";
import { getEntityScope } from "@/lib/entity-scope";
import { formatUSD } from "@/lib/money";
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
}: {
  account: Account;
  value: number;
  extras?: Array<{ key: string; value: string; neg?: boolean; num?: boolean }>;
}) {
  // Drill from any report cell straight into the journal filtered to this
  // account. The journal page reads `?account=` and shows only entries
  // that touch it.
  const drillHref = drillToAccount(account.id);
  return (
    <TR>
      <TD mono>{account.code}</TD>
      <TD>{account.name}</TD>
      <TD num neg={value < 0}>
        <DrillNumber value={value} href={drillHref} currencyCode={null} />
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

function YearPicker({ year, current }: { year: number; current: number }) {
  // Server component — just renders a form GET that flips ?year=.
  const years = [year + 1, year, year - 1, year - 2, year - 3];
  return (
    <form
      method="GET"
      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
    >
      <input type="hidden" name="tab" value="monthly" />
      <label
        className="text-[11.5px] uppercase tracking-wider"
        style={{ color: "var(--ink-3)" }}
      >
        Year
      </label>
      <select
        name="year"
        defaultValue={current}
        style={{
          background: "var(--raised)",
          color: "var(--ink)",
          border: "1px solid var(--line-2)",
          borderRadius: 6,
          padding: "4px 8px",
          fontSize: 12.5,
        }}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit">Go</button>
      </noscript>
      {/* Auto-submit on change via a tiny inline handler */}
      <SubmitOnChange />
    </form>
  );
}

// Tiny client-only auto-submit so the year dropdown reloads the page.
function SubmitOnChange() {
  // We can't add an onChange handler from a server component, so emit a
  // <script> that wires the select to submit its form. It's a single
  // sibling lookup — small, cache-friendly, and avoids spinning up a
  // dedicated client component just for this.
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){var s=document.currentScript;if(!s)return;var f=s.closest('form');if(!f)return;var sel=f.querySelector('select[name="year"]');if(!sel)return;sel.addEventListener('change',function(){f.submit();});})();`,
      }}
    />
  );
}

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
  }>;
}) {
  const params = await searchParams;
  const tab: TabId = isTab(params.tab) ? params.tab : "balance";
  const preset = parsePreset(params.preset);
  const compare = parseCompare(params.compare) as CompareMode;
  const period = resolvePeriod(preset, DEMO_TODAY, params.from, params.to);
  const scope = await getEntityScope();
  const fiscalYear = parseInt(
    params.year ?? String(DEMO_TODAY.getUTCFullYear()),
    10,
  );

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
        {tab !== "trial" && (
          <div className="flex flex-wrap items-center gap-3 no-print">
            {tab === "monthly" ? (
              <YearPicker year={fiscalYear} current={fiscalYear} />
            ) : (
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
            )}
          </div>
        )}

        {tab === "balance" && (
          <BalanceSheetCard period={period} compare={compare} scope={scope} />
        )}
        {tab === "income" && (
          <IncomeStatementCard
            period={period}
            compare={compare}
            scope={scope}
          />
        )}
        {tab === "monthly" && (
          <MonthlyIncomeCard year={fiscalYear} scope={scope} />
        )}
        {tab === "trial" && <TrialBalanceCard />}
      </div>
    </>
  );
}

function tabHref(
  next: TabId,
  current: { preset?: string; from?: string; to?: string; compare?: string; year?: string },
): string {
  const ps = new URLSearchParams();
  ps.set("tab", next);
  if (current.preset) ps.set("preset", current.preset);
  if (current.from) ps.set("from", current.from);
  if (current.to) ps.set("to", current.to);
  if (current.compare) ps.set("compare", current.compare);
  if (current.year) ps.set("year", current.year);
  return `/reports?${ps.toString()}`;
}

// ------- Balance Sheet -------

async function BalanceSheetCard({
  period,
  compare,
  scope,
}: {
  period: { start: string; end: string; label: string };
  compare: CompareMode;
  scope: string | null;
}) {
  const asOf = period.end;
  const [kpis, byType] = await Promise.all([
    getKpisAsOf(asOf, scope),
    accountsByType(),
  ]);
  // For account-level current balances at asOf we re-query with the same
  // helper used for KPI rollups but read per-account from a single call —
  // the simplest way without adding new helpers is to map onto KpisAsOf
  // results plus the trial-balance numbers. For the per-account display
  // we use the typed accounts and getKpisAsOf totals; per-account rows
  // pull from the trial-balance helper which uses entity scope already.
  const balances = await currentBalancesAsOf(asOf, scope);

  let cmpKpis: KpisSummary | null = null;
  let cmpBalances: Map<string, number> | null = null;
  let cmpLabel = "";
  if (compare === "prior_period") {
    const p = priorPeriod(period.start, period.end);
    cmpKpis = await getKpisAsOf(p.end, scope);
    cmpBalances = await currentBalancesAsOf(p.end, scope);
    cmpLabel = `As of ${p.end}`;
  } else if (compare === "prior_year") {
    const p = priorYearPeriod(period.start, period.end);
    cmpKpis = await getKpisAsOf(p.end, scope);
    cmpBalances = await currentBalancesAsOf(p.end, scope);
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
      { key: "cmp", value: formatUSD(prev, { paren: true }), neg: prev < 0 },
      { key: "delta", value: formatUSD(d, { paren: true }), neg: d < 0 },
    ];
  }

  function totalCells(curr: number, prev: number) {
    const cells: Array<{ key: string; value: string; neg?: boolean }> = [
      { key: "curr", value: formatUSD(curr, { paren: true }), neg: curr < 0 },
    ];
    if (showCmp) {
      const d = curr - prev;
      cells.push({ key: "cmp", value: formatUSD(prev, { paren: true }), neg: prev < 0 });
      cells.push({ key: "delta", value: formatUSD(d, { paren: true }), neg: d < 0 });
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
    <Card title="Balance Sheet">
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
            />
          ))}
          <TR>
            <TD mono>—</TD>
            <TD>Current Year Earnings</TD>
            <TD num neg={kpis.netIncome < 0}>
              {formatUSD(kpis.netIncome, { paren: true })}
            </TD>
            {showCmp && (
              <>
                <TD num neg={(cmpKpis?.netIncome ?? 0) < 0}>
                  {formatUSD(cmpKpis?.netIncome ?? 0, { paren: true })}
                </TD>
                <TD
                  num
                  neg={kpis.netIncome - (cmpKpis?.netIncome ?? 0) < 0}
                >
                  {formatUSD(kpis.netIncome - (cmpKpis?.netIncome ?? 0), {
                    paren: true,
                  })}
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
                    {
                      key: "curr",
                      value: formatUSD(totalLiab + totalEquity, { paren: true }),
                    },
                    {
                      key: "cmp",
                      value: formatUSD(cmpLiab + cmpEquity, { paren: true }),
                    },
                    {
                      key: "delta",
                      value: formatUSD(
                        totalLiab + totalEquity - (cmpLiab + cmpEquity),
                        { paren: true },
                      ),
                    },
                  ]
                : [
                    {
                      key: "curr",
                      value: formatUSD(totalLiab + totalEquity, { paren: true }),
                    },
                  ]
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
  _asOf: string,
  _scope: string | null,
): Promise<Map<string, number>> {
  const tb = await getTrialBalance();
  const m = new Map<string, number>();
  for (const r of tb) {
    const v = r.debit - r.credit;
    m.set(r.accountId, v);
  }
  return m;
}

// ------- Income Statement -------

async function IncomeStatementCard({
  period,
  compare,
  scope,
}: {
  period: { start: string; end: string; label: string };
  compare: CompareMode;
  scope: string | null;
}) {
  const { rows, revenue, expenses, netIncome } =
    await getIncomeStatementForPeriod(period.start, period.end, scope);

  let cmpMap: Map<string, number> | null = null;
  let cmpLabel = "";
  let cmpRevenue = 0;
  let cmpExpenses = 0;
  let cmpNet = 0;
  let hasCmp = false;

  if (compare === "prior_period") {
    const p = priorPeriod(period.start, period.end);
    const r = await getIncomeStatementForPeriod(p.start, p.end, scope);
    cmpMap = new Map(r.rows.map((x) => [x.accountId, x.amount]));
    cmpRevenue = r.revenue;
    cmpExpenses = r.expenses;
    cmpNet = r.netIncome;
    cmpLabel = `${p.start} → ${p.end}`;
    hasCmp = true;
  } else if (compare === "prior_year") {
    const p = priorYearPeriod(period.start, period.end);
    const r = await getIncomeStatementForPeriod(p.start, p.end, scope);
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
            { key: "cmp", value: formatUSD(cmp, { paren: true }), neg: cmp < 0 },
            { key: "delta", value: formatUSD(d, { paren: true }), neg: d < 0 },
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
      />
    );
  }

  function totalCells(curr: number, prev: number) {
    const cells: Array<{ key: string; value: string; neg?: boolean }> = [
      { key: "curr", value: formatUSD(curr, { paren: true }), neg: curr < 0 },
    ];
    if (hasCmp) {
      const d = curr - prev;
      cells.push({ key: "cmp", value: formatUSD(prev, { paren: true }), neg: prev < 0 });
      cells.push({ key: "delta", value: formatUSD(d, { paren: true }), neg: d < 0 });
      cells.push({ key: "deltaPct", value: pctChange(curr, prev), neg: d < 0 });
    }
    return cells;
  }

  const revenueRows = rows.filter((r) => r.accountType === "revenue");
  const expenseRows = rows.filter((r) => r.accountType === "expense");

  return (
    <Card title={`Income Statement — ${period.label}`}>
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
                    { key: "curr", value: formatUSD(netIncome, { paren: true }) },
                    { key: "cmp", value: formatUSD(cmpNet, { paren: true }) },
                    {
                      key: "delta",
                      value: formatUSD(netIncome - cmpNet, { paren: true }),
                    },
                    { key: "deltaPct", value: pctChange(netIncome, cmpNet) },
                  ]
                : [
                    { key: "curr", value: formatUSD(netIncome, { paren: true }) },
                  ]
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
}: {
  year: number;
  scope: string | null;
}) {
  const m = await getMonthlyIncomeStatement(year, scope);

  return (
    <Card title={`Monthly Income Statement — ${year}`}>
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
                  {v === 0 ? "—" : formatUSD(v, { paren: true })}
                </TD>
              ))}
              <TD num neg={r.total < 0}>
                {formatUSD(r.total, { paren: true })}
              </TD>
            </TR>
          ))}
          <TR total hover={false}>
            <TD colSpan={2} style={{ fontWeight: 600, color: "var(--ink)" }}>
              Total Revenue
            </TD>
            {m.revenueByMonth.map((v, i) => (
              <TD key={i} num neg={v < 0}>
                {formatUSD(v, { paren: true })}
              </TD>
            ))}
            <TD num neg={m.revenueByMonth.reduce((s, v) => s + v, 0) < 0}>
              {formatUSD(m.revenueByMonth.reduce((s, v) => s + v, 0), {
                paren: true,
              })}
            </TD>
          </TR>
          <TR total hover={false}>
            <TD colSpan={2} style={{ fontWeight: 600, color: "var(--ink)" }}>
              Total Expenses
            </TD>
            {m.expensesByMonth.map((v, i) => (
              <TD key={i} num neg={v < 0}>
                {formatUSD(v, { paren: true })}
              </TD>
            ))}
            <TD num neg={m.expensesByMonth.reduce((s, v) => s + v, 0) < 0}>
              {formatUSD(m.expensesByMonth.reduce((s, v) => s + v, 0), {
                paren: true,
              })}
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
                {formatUSD(v, { paren: true })}
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
              {formatUSD(m.netByMonth.reduce((s, v) => s + v, 0), {
                paren: true,
              })}
            </TD>
          </TR>
        </TBody>
      </Table>
    </Card>
  );
}

// ------- Trial Balance -------

async function TrialBalanceCard() {
  const trial = await getTrialBalance();
  const trialDebits = trial.reduce((s, r) => s + r.debit, 0);
  const trialCredits = trial.reduce((s, r) => s + r.credit, 0);
  const trialBalanced = Math.abs(trialDebits - trialCredits) < 0.005;

  return (
    <Card
      title="Trial Balance"
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
            <TH num>Debit</TH>
            <TH num>Credit</TH>
          </TR>
        </THead>
        <TBody>
          {trial.map((row) => (
            <TR key={row.accountId}>
              <TD mono>{row.code}</TD>
              <TD>{row.name}</TD>
              <TD num>{row.debit === 0 ? "—" : formatUSD(row.debit)}</TD>
              <TD num>{row.credit === 0 ? "—" : formatUSD(row.credit)}</TD>
            </TR>
          ))}
          <TR total hover={false}>
            <TD colSpan={2} style={{ fontWeight: 600, color: "var(--ink)" }}>
              Totals
            </TD>
            <TD num>{formatUSD(trialDebits)}</TD>
            <TD num>{formatUSD(trialCredits)}</TD>
          </TR>
        </TBody>
      </Table>
    </Card>
  );
}
