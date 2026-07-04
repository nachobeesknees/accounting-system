import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { PrintButton } from "@/components/PrintButton";
import { CsvDownloadButton } from "@/components/CsvDownloadButton";
import {
  convertToBase,
  getBaseCurrency,
  getFirmPlRollup,
  getLatestFxRates,
  getOffices,
} from "@/lib/data";
import { formatAmount } from "@/lib/money";

/**
 * Consolidation = the FIRM's corporate entities (offices), consolidated to
 * base currency with intercompany eliminations applied. Client-structure
 * entities are operational records owned by client relationships — they
 * deliberately do not report here or anywhere in the financials.
 */
export default async function Page() {
  const [rollup, offices, base, fxRates] = await Promise.all([
    getFirmPlRollup("all"),
    getOffices(),
    getBaseCurrency(),
    getLatestFxRates(),
  ]);
  const baseCode = base?.code ?? "USD";
  const baseSymbol = base?.symbol ?? "$";
  const officeById = new Map(offices.map((o) => [o.id, o] as const));

  const rows = rollup.rows.map((r) => {
    const office = r.officeId ? officeById.get(r.officeId) : undefined;
    const ccy = office?.currencyCode ?? baseCode;
    const conv = (n: number) =>
      ccy === baseCode ? n : (convertToBase(n, ccy, fxRates) ?? 0);
    return {
      officeId: r.officeId,
      label: office
        ? `${office.code} — ${office.name}`
        : "Firm-level (unattributed)",
      ccy,
      revenueNative: r.revenue,
      expensesNative: r.expenses,
      netNative: r.netIncome,
      revenueBase: conv(r.revenue),
      expensesBase: conv(r.expenses),
      netBase: conv(r.netIncome),
    };
  });
  rows.sort((a, b) => {
    if (a.officeId == null) return 1;
    if (b.officeId == null) return -1;
    return a.label.localeCompare(b.label);
  });

  // Eliminations are booked in base currency at the consolidated level.
  const elim = rollup.eliminations;
  const hasElim =
    elim.revenue !== 0 || elim.expenses !== 0 || elim.netIncome !== 0;

  const totalRev = rows.reduce((s, r) => s + r.revenueBase, 0) + elim.revenue;
  const totalExp = rows.reduce((s, r) => s + r.expensesBase, 0) + elim.expenses;
  const totalNet = totalRev - totalExp;
  const formatBase = (n: number) =>
    `${baseSymbol}${formatAmount(n, { paren: true, compact: true })}`;

  return (
    <>
      <PageHeader
        title="Consolidation"
        meta={`Firm entities consolidated to ${baseCode} · intercompany eliminations applied`}
        actions={
          <>
            <CsvDownloadButton report="consolidation" />
            <PrintButton />
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 px-6 my-3.5">
        <Tile label={`Revenue (${baseCode})`} value={formatBase(totalRev)} />
        <Tile label={`Expenses (${baseCode})`} value={formatBase(totalExp)} />
        <Tile
          label={`Net income (${baseCode})`}
          value={formatBase(totalNet)}
          neg={totalNet < 0}
        />
      </div>

      <div className="px-6 pb-8 flex flex-col gap-3.5">
        <Card title="Per firm entity P&L (posted)">
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Firm entity</TH>
                <TH>Ccy</TH>
                <TH num>Revenue (native)</TH>
                <TH num>Expenses (native)</TH>
                <TH num>Net (native)</TH>
                <TH num>Net ({baseCode})</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.officeId ?? "firm"}>
                  <TD>{r.label}</TD>
                  <TD mono>{r.ccy}</TD>
                  <TD num>{formatAmount(r.revenueNative, { paren: true, compact: true })}</TD>
                  <TD num>{formatAmount(r.expensesNative, { paren: true, compact: true })}</TD>
                  <TD num neg={r.netNative < 0}>
                    {formatAmount(r.netNative, { paren: true, compact: true })}
                  </TD>
                  <TD num neg={r.netBase < 0}>{formatBase(r.netBase)}</TD>
                  <TD>
                    {r.officeId == null ? (
                      <Pill variant="neutral">Unattributed</Pill>
                    ) : (
                      <Pill variant="formation">Firm entity</Pill>
                    )}
                  </TD>
                </TR>
              ))}
              {hasElim && (
                <TR hover={false}>
                  <TD style={{ color: "var(--ink-3)" }}>
                    Intercompany eliminations
                  </TD>
                  <TD mono style={{ color: "var(--ink-3)" }}>{baseCode}</TD>
                  <TD num>{formatAmount(elim.revenue, { paren: true, compact: true })}</TD>
                  <TD num>{formatAmount(elim.expenses, { paren: true, compact: true })}</TD>
                  <TD num neg={elim.netIncome < 0}>
                    {formatAmount(elim.netIncome, { paren: true, compact: true })}
                  </TD>
                  <TD num neg={elim.netIncome < 0}>{formatBase(elim.netIncome)}</TD>
                  <TD>
                    <Pill variant="pending">Elimination</Pill>
                  </TD>
                </TR>
              )}
              <TR total hover={false}>
                <TD colSpan={2}>Consolidated ({baseCode})</TD>
                <TD num>{formatBase(totalRev)}</TD>
                <TD num>{formatBase(totalExp)}</TD>
                <TD num>{""}</TD>
                <TD num neg={totalNet < 0}>{formatBase(totalNet)}</TD>
                <TD>{""}</TD>
              </TR>
            </TBody>
          </Table>
        </Card>

        <div className="text-[11.5px]" style={{ color: "var(--ink-4)" }}>
          Client-structure entities (LLCs, trusts, partnerships owned by
          client relationships) are operational records — they do not report
          in the firm&apos;s financials. Their activity lives on each
          entity&apos;s own books page and in{" "}
          <Link href="/entities" style={{ color: "var(--ink-3)", textDecoration: "underline" }}>
            Entities
          </Link>
          . Full statements:{" "}
          <Link href="/reports" style={{ color: "var(--ink-3)", textDecoration: "underline" }}>
            Financial Statements
          </Link>{" "}
          at the &quot;All entities (consolidated)&quot; scope.
        </div>
      </div>
    </>
  );
}

function Tile({
  label,
  value,
  neg,
}: {
  label: string;
  value: string;
  neg?: boolean;
}) {
  return (
    <div
      className="rounded-lg p-3.5"
      style={{ border: "1px solid var(--line)", background: "var(--raised)" }}
    >
      <div
        className="uppercase"
        style={{
          fontSize: 10.5,
          letterSpacing: "0.04em",
          color: "var(--ink-3)",
        }}
      >
        {label}
      </div>
      <div
        className="mt-1"
        style={{
          fontSize: 22,
          color: neg ? "var(--p-review-fg)" : "var(--ink)",
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}
