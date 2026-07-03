import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getAccounts, getBudgets } from "@/lib/data";
import { formatAmount, parseAmount } from "@/lib/money";
import { saveBudgetsAction } from "./actions";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; saved?: string; error?: string }>;
}) {
  const params = await searchParams;
  const currentYear = new Date().getUTCFullYear();
  const yearRaw = parseInt(params.year ?? String(currentYear), 10);
  const fiscalYear = Number.isInteger(yearRaw) ? yearRaw : currentYear;

  const [accounts, budgets] = await Promise.all([
    getAccounts(),
    getBudgets(fiscalYear),
  ]);

  // P&L accounts only — the budget compare on Financial Statements reads
  // revenue and expense budgets.
  const plAccounts = accounts.filter(
    (a) =>
      a.isActive && (a.accountType === "revenue" || a.accountType === "expense"),
  );

  // cell value lookup: accountId → month → amount string
  const byAccount = new Map<string, Map<number, string>>();
  for (const b of budgets) {
    if (b.month == null) continue; // annual rows aren't grid-managed
    const inner = byAccount.get(b.accountId) ?? new Map<number, string>();
    inner.set(b.month, b.amount);
    byAccount.set(b.accountId, inner);
  }

  const monthTotals = (accts: typeof plAccounts) =>
    MONTHS.map((_, i) =>
      accts.reduce(
        (s, a) => s + parseAmount(byAccount.get(a.id)?.get(i + 1) ?? "0"),
        0,
      ),
    );

  const revenueAccounts = plAccounts.filter((a) => a.accountType === "revenue");
  const expenseAccounts = plAccounts.filter((a) => a.accountType === "expense");
  const revTotals = monthTotals(revenueAccounts);
  const expTotals = monthTotals(expenseAccounts);

  const cellStyle: React.CSSProperties = {
    background: "var(--paper)",
    border: "1px solid var(--line-2)",
    color: "var(--ink)",
    fontFamily: "var(--font-mono)",
    fontVariantNumeric: "tabular-nums",
  };

  const groupHeader = (label: string) => (
    <tr>
      <td
        colSpan={14}
        className="px-3 pt-3 pb-1 text-[10.5px] uppercase font-medium"
        style={{ color: "var(--ink-3)", letterSpacing: "0.04em" }}
      >
        {label}
      </td>
    </tr>
  );

  const totalRow = (label: string, totals: number[]) => (
    <tr style={{ borderTop: "1px solid var(--line)" }}>
      <td className="px-3 py-1.5 text-[12px] font-medium" style={{ color: "var(--ink-2)" }}>
        {label}
      </td>
      {totals.map((t, i) => (
        <td
          key={i}
          className="px-1 py-1.5 text-right text-[11.5px]"
          style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}
        >
          {t === 0 ? "—" : formatAmount(t, { compact: true })}
        </td>
      ))}
      <td
        className="px-3 py-1.5 text-right text-[11.5px] font-medium"
        style={{ color: "var(--ink-2)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}
      >
        {formatAmount(totals.reduce((s, t) => s + t, 0), { compact: true })}
      </td>
    </tr>
  );

  const accountRows = (accts: typeof plAccounts) =>
    accts.map((a) => {
      const cells = byAccount.get(a.id);
      const rowTotal = MONTHS.reduce(
        (s, _, i) => s + parseAmount(cells?.get(i + 1) ?? "0"),
        0,
      );
      return (
        <tr key={a.id} style={{ borderTop: "1px solid var(--line)" }}>
          <td className="px-3 py-1 text-[12px] whitespace-nowrap">
            <span style={{ fontFamily: "var(--font-mono)" }}>{a.code}</span>
            <span className="ml-2" style={{ color: "var(--ink-3)" }}>
              {a.name}
            </span>
          </td>
          {MONTHS.map((_, i) => (
            <td key={i} className="px-0.5 py-1">
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                name={`b[${a.id}][${i + 1}]`}
                defaultValue={cells?.get(i + 1) ?? ""}
                placeholder="—"
                className="w-[72px] px-1.5 py-1 text-[11.5px] rounded outline-none text-right"
                style={cellStyle}
                aria-label={`${a.code} ${MONTHS[i]} budget`}
              />
            </td>
          ))}
          <td
            className="px-3 py-1 text-right text-[11.5px]"
            style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}
          >
            {rowTotal === 0 ? "—" : formatAmount(rowTotal, { compact: true })}
          </td>
        </tr>
      );
    });

  return (
    <>
      <PageHeader
        title="Budgets"
        meta={`Fiscal year ${fiscalYear} · monthly by account`}
        actions={
          <div className="flex items-center gap-1.5">
            {[fiscalYear - 1, fiscalYear, fiscalYear + 1].map((y) => (
              <Link
                key={y}
                href={`/budgets?year=${y}`}
                className="px-2.5 py-1 rounded-md text-[12px]"
                style={{
                  border: "1px solid var(--line-2)",
                  color: y === fiscalYear ? "var(--ink)" : "var(--ink-3)",
                  background: y === fiscalYear ? "var(--raised)" : "transparent",
                  textDecoration: "none",
                  fontWeight: y === fiscalYear ? 600 : 400,
                }}
              >
                {y}
              </Link>
            ))}
          </div>
        }
      />

      <div className="px-6 my-3.5 flex flex-col gap-3.5 pb-8">
        {params.error && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            {params.error}
          </div>
        )}
        {params.saved && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            Budgets saved.
          </div>
        )}

        <form action={saveBudgetsAction}>
          <input type="hidden" name="fiscalYear" value={fiscalYear} />
          <Card
            title={`FY${fiscalYear} budget grid`}
            actions={
              <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                Blank cells = no budget. Compare against actuals on{" "}
                <Link
                  href="/reports?tab=income&compare=budget"
                  style={{ color: "var(--ink-2)", textDecoration: "underline" }}
                >
                  Financial Statements
                </Link>
                .
              </span>
            }
          >
            <div style={{ overflowX: "auto" }}>
              <table className="w-full" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th
                      className="px-3 py-1.5 text-left text-[10.5px] uppercase font-medium whitespace-nowrap"
                      style={{ background: "var(--rail)", color: "var(--ink-3)", letterSpacing: "0.04em" }}
                    >
                      Account
                    </th>
                    {MONTHS.map((m) => (
                      <th
                        key={m}
                        className="px-1 py-1.5 text-right text-[10.5px] uppercase font-medium"
                        style={{ background: "var(--rail)", color: "var(--ink-3)", letterSpacing: "0.04em" }}
                      >
                        {m}
                      </th>
                    ))}
                    <th
                      className="px-3 py-1.5 text-right text-[10.5px] uppercase font-medium"
                      style={{ background: "var(--rail)", color: "var(--ink-3)", letterSpacing: "0.04em" }}
                    >
                      FY total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groupHeader("Revenue")}
                  {accountRows(revenueAccounts)}
                  {totalRow("Total revenue", revTotals)}
                  {groupHeader("Expenses")}
                  {accountRows(expenseAccounts)}
                  {totalRow("Total expenses", expTotals)}
                  {totalRow(
                    "Budgeted net income",
                    revTotals.map((r, i) => r - expTotals[i]),
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end p-3.5">
              <Button variant="primary" type="submit">
                Save budgets
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}
