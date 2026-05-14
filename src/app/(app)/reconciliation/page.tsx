import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getAccountBalance,
  getBankAccounts,
  getBankTransactions,
  getJournalEntries,
} from "@/lib/data";
import { formatMoney, parseAmount } from "@/lib/money";

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function Tile({
  label,
  value,
  sub,
  neg,
}: {
  label: string;
  value: string;
  sub?: string;
  neg?: boolean;
}) {
  return (
    <div
      className="rounded-lg p-3.5"
      style={{
        border: "1px solid var(--line)",
        background: "var(--raised)",
      }}
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
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="mt-1"
          style={{ fontSize: 11.5, color: "var(--ink-4)" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const params = await searchParams;
  const bankAccounts = await getBankAccounts();
  const selectedId = params.account ?? bankAccounts[0]?.id ?? "";
  const account =
    bankAccounts.find((b) => b.id === selectedId) ?? bankAccounts[0];

  if (!account) {
    return (
      <>
        <PageHeader title="Bank Reconciliation" />
        <div className="px-6 py-3.5">
          <Empty
            title="No bank accounts"
            body="Configure a bank account to begin reconciling."
          />
        </div>
      </>
    );
  }

  const [txs, bookBalance, allEntries] = await Promise.all([
    getBankTransactions(account.id),
    getAccountBalance(account.accountId),
    getJournalEntries(),
  ]);
  const entriesById = new Map(allEntries.map((e) => [e.id, e] as const));
  const reconciled = txs.filter((t) => t.isReconciled);
  const unreconciled = txs.filter((t) => !t.isReconciled);

  const clearedTotal = reconciled.reduce(
    (s, t) => s + parseAmount(t.amount),
    0,
  );
  const outstandingTotal = unreconciled.reduce(
    (s, t) => s + parseAmount(t.amount),
    0,
  );

  const lastFour = account.lastFour ?? "";
  const institution = account.institution ?? "";

  return (
    <>
      <PageHeader
        title="Bank Reconciliation"
        meta={`${account.name} · ${institution} ····${lastFour}`}
      />

      {bankAccounts.length > 1 && (
        <div
          className="px-6 py-2 flex gap-2 items-center"
          style={{
            background: "var(--rail)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <span
            className="text-[11.5px] uppercase"
            style={{ color: "var(--ink-3)", letterSpacing: "0.04em" }}
          >
            Account:
          </span>
          {bankAccounts.map((ba) => {
            const active = ba.id === account.id;
            return (
              <ButtonLink
                key={ba.id}
                variant={active ? "primary" : "secondary"}
                href={`/reconciliation?account=${ba.id}`}
              >
                {ba.name}
              </ButtonLink>
            );
          })}
        </div>
      )}

      <div className="px-6 my-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <Tile
          label="Book balance"
          value={formatMoney(bookBalance, "USD", { paren: true, compact: true })}
          sub="GL account 1000"
        />
        <Tile
          label="Cleared"
          value={formatMoney(clearedTotal, "USD", { paren: true, compact: true })}
          sub={`${reconciled.length} matched transactions`}
        />
        <Tile
          label="Outstanding"
          value={formatMoney(outstandingTotal, "USD", { paren: true, compact: true })}
          sub={`${unreconciled.length} unmatched`}
          neg={outstandingTotal < 0}
        />
      </div>

      <div className="px-6 pb-3.5 flex flex-col gap-3.5">
        <Card
          title="Unreconciled bank transactions"
          actions={
            <Pill variant="pending">{unreconciled.length} items</Pill>
          }
        >
          {unreconciled.length === 0 ? (
            <Empty
              title="Everything is reconciled"
              body="No outstanding bank items. 🎉"
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Date</TH>
                  <TH>Description</TH>
                  <TH>Reference</TH>
                  <TH num>Amount</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {unreconciled.map((t) => {
                  const amount = parseAmount(t.amount);
                  return (
                    <TR key={t.id}>
                      <TD>{formatDate(t.transactionDate)}</TD>
                      <TD>{t.description}</TD>
                      <TD
                        mono
                        style={{ color: "var(--ink-3)" }}
                      >
                        {t.reference ?? "—"}
                      </TD>
                      <TD num neg={amount < 0}>
                        {/* Per-transaction reconciliation rows must keep cents —
                            they have to match the bank statement to the penny. */}
                        {formatMoney(amount, "USD", { paren: true })}
                      </TD>
                      <TD num>
                        <Button variant="ghost" disabled>
                          Match →
                        </Button>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>

        <Card title="Reconciled transactions">
          {reconciled.length === 0 ? (
            <Empty
              title="No reconciled transactions"
              body="Matched bank items will appear here."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Date</TH>
                  <TH>Description</TH>
                  <TH>Matched JE</TH>
                  <TH num>Amount</TH>
                </TR>
              </THead>
              <TBody>
                {reconciled.map((t) => {
                  const amount = parseAmount(t.amount);
                  const je = t.journalEntryId
                    ? entriesById.get(t.journalEntryId)
                    : undefined;
                  return (
                    <TR key={t.id}>
                      <TD>{formatDate(t.transactionDate)}</TD>
                      <TD>{t.description}</TD>
                      <TD mono>
                        {je ? (
                          <Link
                            href={`/journal/${je.entryNumber}`}
                            style={{
                              color: "var(--ink)",
                              textDecoration: "none",
                            }}
                          >
                            {je.entryNumber}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD num neg={amount < 0}>
                        {/* Per-transaction row — keep cents for reconciliation. */}
                        {formatMoney(amount, "USD", { paren: true })}
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
