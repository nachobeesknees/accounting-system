import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { getVarianceNotes } from "@/lib/data";
import { formatAmount } from "@/lib/money";
import {
  computeVariance,
  materialRows,
  type VarianceCompare,
  type VarianceMode,
  type VarianceRow,
} from "@/lib/variance";
import {
  generateVarianceExplanationsAction,
  saveVarianceNoteAction,
} from "./actions";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    month?: string;
    mode?: string;
    compare?: string;
    saved?: string;
    generated?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const today = new Date();
  const yearRaw = parseInt(params.year ?? String(today.getUTCFullYear()), 10);
  const fiscalYear = Number.isInteger(yearRaw) ? yearRaw : today.getUTCFullYear();
  const monthRaw = parseInt(params.month ?? String(today.getUTCMonth() + 1), 10);
  const month =
    Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12
      ? monthRaw
      : today.getUTCMonth() + 1;
  const mode: VarianceMode = params.mode === "ytd" ? "ytd" : "monthly";
  const compare: VarianceCompare =
    params.compare === "prior_year" ? "prior_year" : "budget";

  const [report, notes] = await Promise.all([
    computeVariance(fiscalYear, month, mode, compare),
    getVarianceNotes(fiscalYear, month, mode, compare),
  ]);
  const material = new Set(materialRows(report.rows).map((r) => r.accountId));
  const aiConfigured = !!process.env.ANTHROPIC_API_KEY;

  const keyInputs = (
    <>
      <input type="hidden" name="fiscalYear" value={fiscalYear} />
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="compare" value={compare} />
    </>
  );

  const fmt = (n: number) => formatAmount(n, { paren: true, compact: true });

  const headerCell = (label: string, num = false) => (
    <th
      className={`px-3 py-1.5 text-[10.5px] uppercase font-medium whitespace-nowrap ${num ? "text-right" : "text-left"}`}
      style={{ background: "var(--rail)", color: "var(--ink-3)", letterSpacing: "0.04em" }}
    >
      {label}
    </th>
  );

  const numCell = (n: number, opts?: { neg?: boolean }) => (
    <td
      className="px-3 py-1.5 text-right text-[12px] whitespace-nowrap align-top"
      style={{
        fontFamily: "var(--font-mono)",
        fontVariantNumeric: "tabular-nums",
        color: opts?.neg ? "var(--p-review-fg)" : "var(--ink)",
      }}
    >
      {fmt(n)}
    </td>
  );

  const groupHeader = (label: string) => (
    <tr>
      <td
        colSpan={7}
        className="px-3 pt-3 pb-1 text-[10.5px] uppercase font-medium"
        style={{ color: "var(--ink-3)", letterSpacing: "0.04em" }}
      >
        {label}
      </td>
    </tr>
  );

  const totalsRow = (
    label: string,
    t: { actual: number; comparison: number; variance: number },
  ) => (
    <tr style={{ borderTop: "1px solid var(--line)" }}>
      <td className="px-3 py-1.5 text-[12px] font-medium" style={{ color: "var(--ink-2)" }}>
        {label}
      </td>
      {numCell(t.actual)}
      {numCell(t.comparison)}
      {numCell(t.variance, { neg: t.variance < 0 })}
      <td
        className="px-3 py-1.5 text-right text-[12px]"
        style={{ fontFamily: "var(--font-mono)", color: "var(--ink-3)" }}
      >
        {t.comparison !== 0
          ? `${((t.variance / Math.abs(t.comparison)) * 100).toFixed(1)}%`
          : "—"}
      </td>
      <td />
      <td />
    </tr>
  );

  const accountRow = (r: VarianceRow) => {
    const note = notes.get(r.accountId);
    return (
      <tr key={r.accountId} style={{ borderTop: "1px solid var(--line)" }}>
        <td className="px-3 py-1.5 text-[12px] whitespace-nowrap align-top">
          <span style={{ fontFamily: "var(--font-mono)" }}>{r.code}</span>
          <span className="ml-2" style={{ color: "var(--ink-3)" }}>
            {r.name}
          </span>
        </td>
        {numCell(r.actual)}
        {numCell(r.comparison)}
        {numCell(r.variance, { neg: !r.favorable && r.variance !== 0 })}
        <td
          className="px-3 py-1.5 text-right text-[12px] align-top"
          style={{ fontFamily: "var(--font-mono)", color: "var(--ink-3)" }}
        >
          {r.variancePct !== null ? `${(r.variancePct * 100).toFixed(1)}%` : "—"}
        </td>
        <td className="px-2 py-1.5 align-top">
          {r.variance !== 0 && (
            <Pill variant={r.favorable ? "active" : "review"}>
              {r.favorable ? "Fav" : "Unfav"}
            </Pill>
          )}
        </td>
        <td className="px-2 py-1 align-top" style={{ minWidth: 320 }}>
          <form action={saveVarianceNoteAction} className="flex items-start gap-1.5">
            {keyInputs}
            <input type="hidden" name="accountId" value={r.accountId} />
            <textarea
              name="note"
              rows={2}
              defaultValue={note?.note ?? ""}
              placeholder={
                material.has(r.accountId)
                  ? "No explanation yet — generate with AI or write one."
                  : "—"
              }
              className="flex-1 px-2 py-1 text-[11.5px] rounded outline-none"
              style={{
                background: "var(--paper)",
                border: "1px solid var(--line-2)",
                color: "var(--ink)",
                lineHeight: 1.45,
                resize: "vertical",
              }}
            />
            <div className="flex flex-col items-end gap-1">
              <Button type="submit" variant="secondary">
                Save
              </Button>
              {note && (
                <span style={{ fontSize: 10, color: "var(--ink-4)" }}>
                  {note.source === "ai" ? "AI draft" : "edited"}
                </span>
              )}
            </div>
          </form>
        </td>
      </tr>
    );
  };

  const revenueRows = report.rows.filter((r) => r.accountType === "revenue");
  const expenseRows = report.rows.filter((r) => r.accountType === "expense");

  return (
    <>
      <PageHeader
        title="Variance Analysis"
        meta={`${report.period.label} · actual vs ${report.compareLabel.toLowerCase()} · consolidated`}
      />

      <div className="px-6 my-3.5 flex flex-col gap-3.5 pb-8">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
            Period
            <select
              name="mode"
              defaultValue={mode}
              className="px-2.5 py-1.5 text-[13px] rounded-md"
              style={{ background: "var(--paper)", border: "1px solid var(--line-2)", color: "var(--ink)" }}
            >
              <option value="monthly">Monthly</option>
              <option value="ytd">YTD</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
            Month
            <select
              name="month"
              defaultValue={String(month)}
              className="px-2.5 py-1.5 text-[13px] rounded-md"
              style={{ background: "var(--paper)", border: "1px solid var(--line-2)", color: "var(--ink)" }}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
            Year
            <select
              name="year"
              defaultValue={String(fiscalYear)}
              className="px-2.5 py-1.5 text-[13px] rounded-md"
              style={{ background: "var(--paper)", border: "1px solid var(--line-2)", color: "var(--ink)" }}
            >
              {[fiscalYear - 2, fiscalYear - 1, fiscalYear, fiscalYear + 1]
                .filter((v, i, a) => a.indexOf(v) === i)
                .map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
            Compare to
            <select
              name="compare"
              defaultValue={compare}
              className="px-2.5 py-1.5 text-[13px] rounded-md"
              style={{ background: "var(--paper)", border: "1px solid var(--line-2)", color: "var(--ink)" }}
            >
              <option value="budget">Budget</option>
              <option value="prior_year">Prior year</option>
            </select>
          </label>
          <Button type="submit" variant="secondary">
            Apply
          </Button>
        </form>

        {params.error && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{ background: "var(--p-review-bg)", color: "var(--p-review-fg)", border: "1px solid var(--p-review-fg)" }}
          >
            {params.error}
          </div>
        )}
        {params.saved && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{ background: "var(--p-active-bg)", color: "var(--p-active-fg)", border: "1px solid var(--p-active-fg)" }}
          >
            Explanation saved.
          </div>
        )}
        {params.generated !== undefined && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{ background: "var(--p-active-bg)", color: "var(--p-active-fg)", border: "1px solid var(--p-active-fg)" }}
          >
            {params.generated === "0"
              ? "Nothing to generate — every material variance already has an explanation."
              : `Generated ${params.generated} AI explanation${params.generated === "1" ? "" : "s"}. Edit any of them below — your edits won't be overwritten.`}
          </div>
        )}

        <Card
          title={`Actual vs ${report.compareLabel} — ${report.period.label}`}
          actions={
            <form action={generateVarianceExplanationsAction}>
              {keyInputs}
              <Button type="submit" variant="primary" disabled={!aiConfigured}>
                {aiConfigured ? "Generate AI explanations" : "AI not configured"}
              </Button>
            </form>
          }
        >
          <div style={{ overflowX: "auto" }}>
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {headerCell("Account")}
                  {headerCell("Actual", true)}
                  {headerCell(report.compareLabel, true)}
                  {headerCell("Variance", true)}
                  {headerCell("Var %", true)}
                  {headerCell("")}
                  {headerCell("Explanation")}
                </tr>
              </thead>
              <tbody>
                {groupHeader("Revenue")}
                {revenueRows.map(accountRow)}
                {totalsRow("Total revenue", report.totals.revenue)}
                {groupHeader("Expenses")}
                {expenseRows.map(accountRow)}
                {totalsRow("Total expenses", report.totals.expenses)}
                {totalsRow("Net income", report.totals.net)}
              </tbody>
            </table>
          </div>
          <div className="p-3.5 text-[11.5px]" style={{ color: "var(--ink-4)" }}>
            AI drafts explanations for material variances (≥ $100 and ≥ 2%).
            Accountant edits are marked &quot;edited&quot; and never overwritten by
            regeneration. Budgets come from the{" "}
            <a href={`/budgets?year=${fiscalYear}`} style={{ color: "var(--ink-3)", textDecoration: "underline" }}>
              Budgets
            </a>{" "}
            grid.
          </div>
        </Card>
      </div>
    </>
  );
}
