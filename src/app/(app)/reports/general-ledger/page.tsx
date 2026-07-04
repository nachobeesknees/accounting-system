import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { PeriodPicker } from "@/components/PeriodPicker";
import { PrintButton } from "@/components/PrintButton";
import { CsvDownloadButton } from "@/components/CsvDownloadButton";
import { AccountFilter } from "./AccountFilter";
import {
  getAccounts,
  getLedgerLinesInRange,
  getSignedBalancesAsOf,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatAmount } from "@/lib/money";
import { parsePreset, resolvePeriod } from "@/lib/report-periods";

/** Previous calendar day of an ISO date (for opening balances). */
function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * General Ledger report — per-account activity with opening balance,
 * running balance, and closing balance for the period. Consolidated
 * across firm entities.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string; account?: string }>;
}) {
  const params = await searchParams;
  const period = resolvePeriod(parsePreset(params.preset), new Date(), params.from, params.to);
  const accountFilter = (params.account ?? "").trim() || undefined;

  const [lines, accounts, opening] = await Promise.all([
    getLedgerLinesInRange(period.start, period.end, accountFilter),
    getAccounts("all"),
    getSignedBalancesAsOf(dayBefore(period.start), "all"),
  ]);
  const accountById = new Map(accounts.map((a) => [a.id, a] as const));

  // Group by account, preserving chronological order within each.
  const byAccount = new Map<string, typeof lines>();
  for (const l of lines) {
    const arr = byAccount.get(l.accountId) ?? [];
    arr.push(l);
    byAccount.set(l.accountId, arr);
  }
  // Section order: account code. Only accounts with activity (or the
  // explicitly selected account, even if quiet).
  const sectionIds = accountFilter
    ? [accountFilter]
    : [...byAccount.keys()].sort((a, b) =>
        (accountById.get(a)?.code ?? "").localeCompare(accountById.get(b)?.code ?? ""),
      );

  const th = (label: string, num = false) => (
    <th
      className={`px-3 py-1.5 text-[10.5px] uppercase font-medium whitespace-nowrap ${num ? "text-right" : "text-left"}`}
      style={{ background: "var(--rail)", color: "var(--ink-3)", letterSpacing: "0.04em" }}
    >
      {label}
    </th>
  );
  const money = (n: number) => (n === 0 ? "" : formatAmount(n, { paren: true }));

  return (
    <>
      <PageHeader
        title="General Ledger"
        meta={`${period.label} · ${sectionIds.length} account${sectionIds.length === 1 ? "" : "s"} with activity · consolidated`}
        actions={
          <>
            <div className="no-print flex items-center gap-2">
              <AccountFilter
                accounts={accounts
                  .filter((a) => a.isActive)
                  .map((a) => ({ id: a.id, code: a.code, name: a.name }))}
                current={accountFilter ?? ""}
              />
              <Suspense>
                <PeriodPicker />
              </Suspense>
            </div>
            <CsvDownloadButton report="general-ledger" />
            <PrintButton />
          </>
        }
      />

      <div className="px-6 my-3.5 pb-8 flex flex-col gap-3.5">
        {sectionIds.length === 0 && (
          <Card title="No activity">
            <div className="p-3.5 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              No posted journal lines in this period.
            </div>
          </Card>
        )}
        {sectionIds.map((accountId) => {
          const acct = accountById.get(accountId);
          const acctLines = byAccount.get(accountId) ?? [];
          const openBal = opening.get(accountId) ?? 0;
          let running = openBal;
          const periodDebit = acctLines.reduce((s, l) => s + l.debit, 0);
          const periodCredit = acctLines.reduce((s, l) => s + l.credit, 0);
          const closing = openBal + periodDebit - periodCredit;
          return (
            <Card
              key={accountId}
              title={`${acct?.code ?? "—"} — ${acct?.name ?? accountId}`}
              actions={
                <span style={{ color: "var(--ink-3)", fontSize: 11.5, fontFamily: "var(--font-mono)" }}>
                  Closing {formatAmount(closing, { paren: true })}
                </span>
              }
            >
              <div style={{ overflowX: "auto" }}>
                <table className="w-full" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {th("Date")}
                      {th("Entry #")}
                      {th("Description")}
                      {th("Debit", true)}
                      {th("Credit", true)}
                      {th("Balance", true)}
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderTop: "1px solid var(--line)" }}>
                      <td colSpan={5} className="px-3 py-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
                        Opening balance ({formatDate(period.start)})
                      </td>
                      <td className="px-3 py-1 text-right text-[12px]" style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                        {formatAmount(openBal, { paren: true })}
                      </td>
                    </tr>
                    {acctLines.map((l, i) => {
                      running += l.debit - l.credit;
                      return (
                        <tr key={`${l.entryId}-${i}`} style={{ borderTop: "1px solid var(--line)" }}>
                          <td className="px-3 py-1 text-[12px] whitespace-nowrap" style={{ color: "var(--ink-3)" }}>
                            {formatDate(l.entryDate)}
                          </td>
                          <td className="px-3 py-1 text-[12px] whitespace-nowrap" style={{ fontFamily: "var(--font-mono)" }}>
                            <Link
                              href={`/journal/${l.entryNumber}`}
                              style={{ color: "var(--ink)", textDecoration: "none" }}
                            >
                              {l.entryNumber}
                            </Link>
                          </td>
                          <td className="px-3 py-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
                            {l.lineDescription || l.entryDescription || "—"}
                          </td>
                          <td className="px-3 py-1 text-right text-[12px]" style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                            {money(l.debit)}
                          </td>
                          <td className="px-3 py-1 text-right text-[12px]" style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                            {money(l.credit)}
                          </td>
                          <td className="px-3 py-1 text-right text-[12px]" style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                            {formatAmount(running, { paren: true })}
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{ borderTop: "1px solid var(--line-2)" }}>
                      <td colSpan={3} className="px-3 py-1.5 text-[12px] font-semibold">
                        Period activity / closing
                      </td>
                      <td className="px-3 py-1.5 text-right text-[12px] font-semibold" style={{ fontFamily: "var(--font-mono)" }}>
                        {formatAmount(periodDebit, { paren: true })}
                      </td>
                      <td className="px-3 py-1.5 text-right text-[12px] font-semibold" style={{ fontFamily: "var(--font-mono)" }}>
                        {formatAmount(periodCredit, { paren: true })}
                      </td>
                      <td className="px-3 py-1.5 text-right text-[12px] font-semibold" style={{ fontFamily: "var(--font-mono)" }}>
                        {formatAmount(closing, { paren: true })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
