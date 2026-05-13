import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getAccounts,
  getCustomers,
  getEntityById,
  getEntityPlRollup,
  getJournalEntries,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatAmount, parseAmount } from "@/lib/money";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entity = await getEntityById(id);
  if (!entity) notFound();

  const [accounts, entries, rollup, customers] = await Promise.all([
    getAccounts(entity.id),
    getJournalEntries(entity.id),
    getEntityPlRollup(),
    getCustomers(),
  ]);
  const pl = rollup.find((r) => r.entityId === entity.id);
  const client = customers.find((c) => c.id === entity.clientId);
  const ccy = entity.currencyCode;

  const accountById = new Map(accounts.map((a) => [a.id, a] as const));

  return (
    <>
      <PageHeader
        title={`${entity.code} — books`}
        meta={`${entity.name} · ${client?.name ?? "—"} · ${ccy}`}
        actions={
          <>
            <ButtonLink href={`/entities/${entity.id}`} variant="secondary">
              ← Entity detail
            </ButtonLink>
            <ButtonLink href="/consolidation" variant="ghost">
              Consolidation →
            </ButtonLink>
          </>
        }
      />

      <div className="px-6 my-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <Tile
          label="Revenue (native)"
          value={`${ccy} ${formatAmount(pl?.revenue ?? 0, { paren: true })}`}
        />
        <Tile
          label="Expenses (native)"
          value={`${ccy} ${formatAmount(pl?.expenses ?? 0, { paren: true })}`}
        />
        <Tile
          label="Net income"
          value={`${ccy} ${formatAmount(pl?.netIncome ?? 0, { paren: true })}`}
          neg={(pl?.netIncome ?? 0) < 0}
        />
      </div>

      <div className="px-6 pb-8 flex flex-col gap-3.5">
        <Card
          title="Chart of accounts (entity-scoped)"
          actions={
            <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
              {accounts.length} accounts in this entity's books
            </span>
          }
        >
          {accounts.length === 0 ? (
            <Empty
              title="No entity-scoped accounts yet"
              body="This entity has no separate chart of accounts. Firm-level postings still apply."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Type</TH>
                  <TH>Sub-type</TH>
                  <TH>Normal</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {accounts.map((a) => (
                  <TR key={a.id}>
                    <TD mono>{a.code}</TD>
                    <TD>{a.name}</TD>
                    <TD style={{ color: "var(--ink-3)", fontSize: 11.5, textTransform: "capitalize" }}>
                      {a.accountType}
                    </TD>
                    <TD style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                      {a.subType ?? "—"}
                    </TD>
                    <TD style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                      {a.normalBalance}
                    </TD>
                    <TD>
                      <Pill variant={statusVariant(a.isActive ? "active" : "inactive")}>
                        {statusLabel(a.isActive ? "active" : "inactive")}
                      </Pill>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card
          title="Journal entries (entity-scoped)"
          actions={
            <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
              {entries.length} entries
            </span>
          }
        >
          {entries.length === 0 ? (
            <Empty
              title="No entity-scoped journal entries"
              body="Entries posted in firm-level books still affect consolidation."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Entry #</TH>
                  <TH>Date</TH>
                  <TH>Description</TH>
                  <TH>Lines</TH>
                  <TH num>Total</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {entries.map((e) => {
                  const total = e.lines.reduce(
                    (s, l) => s + parseAmount(l.debit),
                    0,
                  );
                  return (
                    <TR key={e.id}>
                      <TD mono>
                        <Link
                          href={`/journal/${e.entryNumber}`}
                          style={{ color: "var(--ink)", textDecoration: "none" }}
                        >
                          {e.entryNumber}
                        </Link>
                      </TD>
                      <TD>{formatDate(e.entryDate)}</TD>
                      <TD>{e.description ?? "—"}</TD>
                      <TD style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                        {e.lines
                          .slice(0, 2)
                          .map((l) => {
                            const acct = accountById.get(l.accountId);
                            return acct ? acct.code : l.accountId;
                          })
                          .join(" / ")}
                        {e.lines.length > 2 ? ` …` : ""}
                      </TD>
                      <TD num>
                        {ccy} {formatAmount(total, { paren: true })}
                      </TD>
                      <TD>
                        <Pill variant={statusVariant(e.status)}>
                          {statusLabel(e.status)}
                        </Pill>
                      </TD>
                    </TR>
                  );
                })}
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
