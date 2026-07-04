import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { PeriodPicker } from "@/components/PeriodPicker";
import { PrintButton } from "@/components/PrintButton";
import { CsvDownloadButton } from "@/components/CsvDownloadButton";
import { getAccounts, getLedgerLinesInRange } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatAmount } from "@/lib/money";
import { parsePreset, resolvePeriod } from "@/lib/report-periods";

/**
 * General Journal report — every posted journal line in the period, in
 * chronological entry order. Consolidated across firm entities.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = resolvePeriod(parsePreset(params.preset), new Date(), params.from, params.to);
  const [lines, accounts] = await Promise.all([
    getLedgerLinesInRange(period.start, period.end),
    getAccounts("all"),
  ]);
  const accountById = new Map(accounts.map((a) => [a.id, a] as const));

  // Group lines by entry, preserving order.
  const entries: Array<{
    entryId: string;
    entryNumber: string;
    entryDate: string;
    description: string | null;
    lines: typeof lines;
  }> = [];
  for (const l of lines) {
    const last = entries[entries.length - 1];
    if (last && last.entryId === l.entryId) {
      last.lines.push(l);
    } else {
      entries.push({
        entryId: l.entryId,
        entryNumber: l.entryNumber,
        entryDate: l.entryDate,
        description: l.entryDescription,
        lines: [l],
      });
    }
  }
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  const th = (label: string, num = false) => (
    <th
      className={`px-3 py-1.5 text-[10.5px] uppercase font-medium whitespace-nowrap ${num ? "text-right" : "text-left"}`}
      style={{ background: "var(--rail)", color: "var(--ink-3)", letterSpacing: "0.04em" }}
    >
      {label}
    </th>
  );
  const money = (n: number) => (n === 0 ? "" : formatAmount(n, { paren: true, compact: false }));

  return (
    <>
      <PageHeader
        title="General Journal"
        meta={`${period.label} · ${entries.length} posted entries · consolidated`}
        actions={
          <>
            <div className="no-print">
              <Suspense>
                <PeriodPicker />
              </Suspense>
            </div>
            <CsvDownloadButton report="general-journal" />
            <PrintButton />
          </>
        }
      />

      <div className="px-6 my-3.5 pb-8">
        <Card title={`Posted entries — ${period.label}`}>
          <div style={{ overflowX: "auto" }}>
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {th("Date")}
                  {th("Entry #")}
                  {th("Account")}
                  {th("Description")}
                  {th("Debit", true)}
                  {th("Credit", true)}
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                      No posted entries in this period.
                    </td>
                  </tr>
                )}
                {entries.map((e) =>
                  e.lines.map((l, i) => {
                    const acct = accountById.get(l.accountId);
                    return (
                      <tr
                        key={`${e.entryId}-${i}`}
                        style={{
                          borderTop: i === 0 ? "1px solid var(--line)" : "none",
                        }}
                      >
                        <td className="px-3 py-1 text-[12px] whitespace-nowrap" style={{ color: "var(--ink-3)" }}>
                          {i === 0 ? formatDate(e.entryDate) : ""}
                        </td>
                        <td className="px-3 py-1 text-[12px] whitespace-nowrap" style={{ fontFamily: "var(--font-mono)" }}>
                          {i === 0 ? (
                            <Link
                              href={`/journal/${e.entryNumber}`}
                              style={{ color: "var(--ink)", textDecoration: "none" }}
                            >
                              {e.entryNumber}
                            </Link>
                          ) : (
                            ""
                          )}
                        </td>
                        <td className="px-3 py-1 text-[12px] whitespace-nowrap">
                          <span style={{ fontFamily: "var(--font-mono)" }}>{acct?.code ?? "—"}</span>
                          <span className="ml-2" style={{ color: "var(--ink-3)" }}>
                            {acct?.name ?? l.accountId}
                          </span>
                        </td>
                        <td className="px-3 py-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
                          {l.lineDescription || (i === 0 ? (e.description ?? "") : "")}
                        </td>
                        <td className="px-3 py-1 text-right text-[12px]" style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                          {money(l.debit)}
                        </td>
                        <td className="px-3 py-1 text-right text-[12px]" style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                          {money(l.credit)}
                        </td>
                      </tr>
                    );
                  }),
                )}
                <tr style={{ borderTop: "1px solid var(--line-2)" }}>
                  <td colSpan={4} className="px-3 py-1.5 text-[12px] font-semibold">
                    Totals
                  </td>
                  <td className="px-3 py-1.5 text-right text-[12px] font-semibold" style={{ fontFamily: "var(--font-mono)" }}>
                    {formatAmount(totalDebit, { paren: true })}
                  </td>
                  <td className="px-3 py-1.5 text-right text-[12px] font-semibold" style={{ fontFamily: "var(--font-mono)" }}>
                    {formatAmount(totalCredit, { paren: true })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
