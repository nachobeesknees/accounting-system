import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, SelectField } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Pill, statusLabel } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getBankAccounts,
  getBankTransactions,
  getReconciliationSessions,
  getUsers,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatMoney, parseAmount } from "@/lib/money";
import { getSessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";

import { startSessionAction } from "./actions";

/**
 * Bank reconciliation home: start a session against a GL-linked firm
 * account, resume open sessions, and browse the sign-off history. The
 * per-account outstanding summary at the bottom is the quick health check
 * (client/entity accounts have no GL link and can't be reconciled).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [bankAccounts, sessions, allTxs, users, user] = await Promise.all([
    getBankAccounts(),
    getReconciliationSessions(),
    getBankTransactions(),
    getUsers(),
    getSessionUser(),
  ]);
  const canReconcile = hasPermission(user, "bank.reconcile");
  const usersById = new Map(users.map((u) => [u.id, u] as const));
  const banksById = new Map(bankAccounts.map((b) => [b.id, b] as const));

  // Only firm accounts (GL-linked) reconcile against the ledger.
  const reconcilable = bankAccounts.filter((b) => b.accountId && b.isActive);
  const openSessions = sessions.filter((s) => s.status === "in_progress");
  const history = sessions.filter((s) => s.status !== "in_progress");
  const accountsWithOpenSession = new Set(openSessions.map((s) => s.bankAccountId));

  const today = new Date().toISOString().slice(0, 10);

  // Per-account outstanding summary.
  const summary = bankAccounts.map((b) => {
    const txs = allTxs.filter((t) => t.bankAccountId === b.id);
    const unreconciled = txs.filter((t) => !t.isReconciled);
    return {
      bank: b,
      total: txs.length,
      openCount: unreconciled.length,
      outstanding: unreconciled.reduce((s, t) => s + parseAmount(t.amount), 0),
    };
  });

  function userName(id: string | null): string {
    if (!id) return "—";
    return usersById.get(id)?.fullName ?? id;
  }

  return (
    <>
      <PageHeader
        title="Bank Reconciliation"
        meta={`${openSessions.length} open session${openSessions.length === 1 ? "" : "s"}`}
      />

      <div className="px-6 my-3.5 flex flex-col gap-3.5 pb-8">
        {error && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <div className="md:col-span-2 flex flex-col gap-3.5">
            <Card
              title="Open sessions"
              actions={<Pill variant="pending">{openSessions.length} in progress</Pill>}
            >
              {openSessions.length === 0 ? (
                <Empty
                  title="No open sessions"
                  body="Start a reconciliation from the statement you're working."
                />
              ) : (
                <Table>
                  <THead>
                    <TR hover={false}>
                      <TH>Account</TH>
                      <TH>Statement date</TH>
                      <TH num>Statement balance</TH>
                      <TH>Started by</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {openSessions.map((s) => {
                      const bank = banksById.get(s.bankAccountId);
                      return (
                        <TR key={s.id} href={`/reconciliation/${s.id}`}>
                          <TD>{bank?.name ?? s.bankAccountId}</TD>
                          <TD>{formatDate(s.statementDate)}</TD>
                          <TD num>
                            {formatMoney(
                              parseAmount(s.statementEndingBalance),
                              bank?.currencyCode ?? "USD",
                              { paren: true, hideCurrency: true },
                            )}
                          </TD>
                          <TD style={{ color: "var(--ink-3)" }}>{userName(s.startedBy)}</TD>
                          <TD>
                            <Pill variant="pending">In progress</Pill>
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              )}
            </Card>

            <Card title="Session history">
              {history.length === 0 ? (
                <Empty
                  title="No completed sessions yet"
                  body="Completed and voided reconciliations appear here with their sign-off reports."
                />
              ) : (
                <Table>
                  <THead>
                    <TR hover={false}>
                      <TH>Account</TH>
                      <TH>Statement date</TH>
                      <TH num>Statement balance</TH>
                      <TH>Completed by</TH>
                      <TH>Completed</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {history.map((s) => {
                      const bank = banksById.get(s.bankAccountId);
                      return (
                        <TR key={s.id} href={`/reconciliation/${s.id}`}>
                          <TD>{bank?.name ?? s.bankAccountId}</TD>
                          <TD>{formatDate(s.statementDate)}</TD>
                          <TD num>
                            {formatMoney(
                              parseAmount(s.statementEndingBalance),
                              bank?.currencyCode ?? "USD",
                              { paren: true, hideCurrency: true },
                            )}
                          </TD>
                          <TD style={{ color: "var(--ink-3)" }}>{userName(s.completedBy)}</TD>
                          <TD style={{ color: "var(--ink-3)" }}>
                            {s.completedAt ? formatDate(s.completedAt.slice(0, 10)) : "—"}
                          </TD>
                          <TD>
                            <Pill variant={s.status === "completed" ? "active" : "review"}>
                              {statusLabel(s.status)}
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

          <form action={startSessionAction}>
            <Card title="Start a reconciliation">
              <div className="p-3.5 flex flex-col gap-3">
                <SelectField
                  label="Bank account"
                  name="bankAccountId"
                  required
                  help="Only GL-linked firm accounts reconcile against the ledger. Client/entity accounts never post to the firm ledger."
                >
                  <option value="">— Select account —</option>
                  {reconcilable.map((b) => (
                    <option
                      key={b.id}
                      value={b.id}
                      disabled={accountsWithOpenSession.has(b.id)}
                    >
                      {b.name}
                      {b.lastFour ? ` ··${b.lastFour}` : ""} · {b.currencyCode}
                      {accountsWithOpenSession.has(b.id) ? " (session open)" : ""}
                    </option>
                  ))}
                </SelectField>
                <Field
                  label="Statement date"
                  name="statementDate"
                  type="date"
                  required
                  defaultValue={today}
                />
                <MoneyInput
                  label="Statement ending balance"
                  name="statementEndingBalance"
                  required
                  help="The closing balance printed on the bank statement."
                />
                <div className="flex justify-end">
                  <Button variant="primary" type="submit" disabled={!canReconcile}>
                    Start session
                  </Button>
                </div>
                {!canReconcile && (
                  <div className="text-[11.5px]" style={{ color: "var(--ink-4)" }}>
                    Your role can't reconcile (requires bank.reconcile).
                  </div>
                )}
              </div>
            </Card>
          </form>
        </div>

        <Card title="Outstanding items by account">
          {summary.length === 0 ? (
            <Empty
              title="No bank accounts"
              body="Configure a bank account to begin reconciling."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Account</TH>
                  <TH>GL link</TH>
                  <TH num>Transactions</TH>
                  <TH num>Unreconciled</TH>
                  <TH num>Outstanding total</TH>
                </TR>
              </THead>
              <TBody>
                {summary.map(({ bank, total, openCount, outstanding }) => (
                  <TR key={bank.id} href={`/bank/${bank.id}`}>
                    <TD>{bank.name}</TD>
                    <TD>
                      <Pill variant={bank.accountId ? "active" : "neutral"}>
                        {bank.accountId ? "Firm (GL-linked)" : "Client account"}
                      </Pill>
                    </TD>
                    <TD num style={{ color: "var(--ink-3)" }}>{total}</TD>
                    <TD num>{openCount}</TD>
                    <TD num neg={outstanding < 0}>
                      {formatMoney(outstanding, bank.currencyCode, {
                        paren: true,
                        hideCurrency: true,
                      })}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
