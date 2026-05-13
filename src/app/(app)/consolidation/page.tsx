import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  convertToBase,
  getBaseCurrency,
  getCustomers,
  getEntities,
  getEntityPlRollup,
  getLatestFxRates,
} from "@/lib/data";
import { formatAmount } from "@/lib/money";

export default async function Page() {
  const [rollup, entities, customers, base, fxRates] = await Promise.all([
    getEntityPlRollup(),
    getEntities(),
    getCustomers(),
    getBaseCurrency(),
    getLatestFxRates(),
  ]);
  const baseCode = base?.code ?? "USD";
  const baseSymbol = base?.symbol ?? "$";
  const entityById = new Map(entities.map((e) => [e.id, e] as const));
  const customerById = new Map(customers.map((c) => [c.id, c] as const));

  // Convert each row to base currency using the entity's functional ccy.
  const rows = rollup.map((r) => {
    const entity = r.entityId ? entityById.get(r.entityId) : undefined;
    const ccy = entity?.currencyCode ?? baseCode;
    const conv = (n: number) =>
      ccy === baseCode ? n : (convertToBase(n, ccy, fxRates) ?? 0);
    return {
      entityId: r.entityId,
      label: entity ? `${entity.code} — ${entity.name}` : "Firm-level books",
      clientName: entity
        ? (customerById.get(entity.clientId)?.name ?? "—")
        : "Thistlewood",
      ccy,
      revenueNative: r.revenue,
      expensesNative: r.expenses,
      netNative: r.netIncome,
      revenueBase: conv(r.revenue),
      expensesBase: conv(r.expenses),
      netBase: conv(r.netIncome),
    };
  });
  // Stable ordering — firm first, then by net descending.
  rows.sort((a, b) => {
    if (a.entityId == null) return -1;
    if (b.entityId == null) return 1;
    return b.netBase - a.netBase;
  });

  const totalRev = rows.reduce((s, r) => s + r.revenueBase, 0);
  const totalExp = rows.reduce((s, r) => s + r.expensesBase, 0);
  const totalNet = totalRev - totalExp;
  const formatBase = (n: number) =>
    `${baseSymbol}${formatAmount(n, { paren: true })}`;

  return (
    <>
      <PageHeader
        title="Consolidation"
        meta={`Rolls up posted P&L from firm-level books + ${rows.length - rows.filter((r) => r.entityId == null).length} entity-scoped books. Base ${baseCode}.`}
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

      <div className="px-6 pb-8">
        <Card title="Per-book P&L (current year)">
          {rows.length === 0 ? (
            <Empty
              title="No posted activity yet"
              body="Post some journal entries to see entity and firm-level P&L roll up here."
              cta={
                <ButtonLink variant="primary" href="/journal/new">
                  + New entry
                </ButtonLink>
              }
            />
          ) : (
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Book</TH>
                <TH>Client</TH>
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
                <TR key={r.entityId ?? "firm"}>
                  <TD>
                    {r.entityId ? (
                      <Link
                        href={`/entities/${r.entityId}/books`}
                        style={{ color: "var(--ink)", textDecoration: "none" }}
                      >
                        {r.label}
                      </Link>
                    ) : (
                      r.label
                    )}
                  </TD>
                  <TD style={{ color: "var(--ink-3)" }}>{r.clientName}</TD>
                  <TD mono>{r.ccy}</TD>
                  <TD num>{formatAmount(r.revenueNative, { paren: true })}</TD>
                  <TD num>{formatAmount(r.expensesNative, { paren: true })}</TD>
                  <TD num neg={r.netNative < 0}>
                    {formatAmount(r.netNative, { paren: true })}
                  </TD>
                  <TD num neg={r.netBase < 0}>{formatBase(r.netBase)}</TD>
                  <TD>
                    {r.entityId == null ? (
                      <Pill variant="formation">Firm</Pill>
                    ) : (
                      <Pill variant="active">Entity</Pill>
                    )}
                  </TD>
                </TR>
              ))}
              <TR total hover={false}>
                <TD colSpan={3}>Consolidated ({baseCode})</TD>
                <TD num>{formatBase(totalRev)}</TD>
                <TD num>{formatBase(totalExp)}</TD>
                <TD num>{""}</TD>
                <TD num neg={totalNet < 0}>{formatBase(totalNet)}</TD>
                <TD>{""}</TD>
              </TR>
            </TBody>
          </Table>
          )}
        </Card>
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
