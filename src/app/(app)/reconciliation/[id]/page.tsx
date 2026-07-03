import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Empty } from "@/components/ui/Empty";
import { Pill, statusLabel } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { AutoSubmitCheckbox } from "@/components/AutoSubmitCheckbox";
import { PrintButton } from "@/components/PrintButton";
import {
  getAccountById,
  getBankAccountById,
  getBankTransactions,
  getJournalEntries,
  getLedgerLinesInRange,
  getReconciliationSessionById,
  getReconciliationSessions,
  getSignedBalancesAsOf,
  getUsers,
} from "@/lib/data";
import { formatDate, maskAccountNumber } from "@/lib/format";
import { formatMoney, parseAmount } from "@/lib/money";
import { computeClearedTotal, countsTowardSession, findOpeningAnchor } from "@/lib/reconciliation";
import { getSessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import type { BankTransaction } from "@/lib/types";

import {
  acceptMatchAction,
  completeSessionAction,
  toggleClearedAction,
  voidSessionAction,
} from "./actions";

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000,
  );
}

type MatchSuggestion = {
  entryId: string;
  entryNumber: string;
  entryDate: string;
  description: string | null;
  daysApart: number;
};

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
      style={{ border: "1px solid var(--line)", background: "var(--raised)" }}
    >
      <div
        className="uppercase"
        style={{ fontSize: 10.5, letterSpacing: "0.04em", color: "var(--ink-3)" }}
      >
        {label}
      </div>
      <div
        className="mt-1"
        style={{
          fontSize: 20,
          color: neg ? "var(--p-review-fg)" : "var(--ink)",
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const [session, user] = await Promise.all([
    getReconciliationSessionById(id),
    getSessionUser(),
  ]);
  if (!session) notFound();
  const canReconcile = hasPermission(user, "bank.reconcile");

  const bank = await getBankAccountById(session.bankAccountId);
  if (!bank) notFound();

  const [txs, glAccount, balances, users, allEntries, allSessions] = await Promise.all([
    getBankTransactions(bank.id),
    bank.accountId ? getAccountById(bank.accountId) : Promise.resolve(undefined),
    getSignedBalancesAsOf(session.statementDate),
    getUsers(),
    getJournalEntries(),
    getReconciliationSessions(),
  ]);
  const usersById = new Map(users.map((u) => [u.id, u] as const));
  const entriesById = new Map(allEntries.map((e) => [e.id, e] as const));

  // Book (GL) balance as of the statement date, signed by normal balance
  // (cash is a debit-normal asset so this is the familiar positive figure).
  const signed = bank.accountId ? balances.get(bank.accountId) ?? 0 : 0;
  const bookBalance =
    glAccount && glAccount.normalBalance !== "debit" ? -signed : signed;

  const inWindow = (t: BankTransaction) =>
    t.transactionDate <= session.statementDate;

  const uncleared = txs.filter((t) => !t.isReconciled && inWindow(t));
  const clearedAll = txs.filter((t) => t.isReconciled && inWindow(t));
  const clearedHere = clearedAll.filter(
    (t) => t.reconciliationSessionId === session.id,
  );
  const clearedElsewhere = clearedAll.filter(
    (t) => t.reconciliationSessionId !== session.id,
  );

  // Difference is anchored on the prior completed session's ending balance
  // (see src/lib/reconciliation.ts — completeReconciliationSession enforces
  // the exact same formula): ending − opening − cleared this statement.
  const anchor = findOpeningAnchor(session, allSessions);
  const counted = clearedAll.filter((t) =>
    countsTowardSession(t, session, anchor.anchorDate),
  );
  const clearedTotal = computeClearedTotal(clearedAll, session, anchor.anchorDate);
  const outstandingTotal = uncleared.reduce((s, t) => s + parseAmount(t.amount), 0);
  const statementBalance = parseAmount(session.statementEndingBalance);
  const difference = statementBalance - anchor.openingBalance - clearedTotal;
  const balanced = Math.abs(difference) < 0.005;

  // ---- Auto-match suggestions: posted lines on the linked GL account with
  // the same amount within ±3 days that aren't already tied to a bank txn.
  const usedJeIds = new Set(
    txs.filter((t) => t.journalEntryId).map((t) => t.journalEntryId as string),
  );
  const suggestions = new Map<string, MatchSuggestion>();
  if (session.status === "in_progress" && bank.accountId && uncleared.length > 0) {
    const minDate = uncleared.reduce(
      (m, t) => (t.transactionDate < m ? t.transactionDate : m),
      session.statementDate,
    );
    const lines = await getLedgerLinesInRange(
      addDays(minDate, -3),
      addDays(session.statementDate, 3),
      bank.accountId,
    );
    for (const t of uncleared) {
      const amount = parseAmount(t.amount);
      let best: MatchSuggestion | null = null;
      for (const line of lines) {
        if (usedJeIds.has(line.entryId)) continue;
        const glAmount = line.debit > 0 ? line.debit : -line.credit;
        if (Math.abs(glAmount - amount) >= 0.005) continue;
        const daysApart = Math.abs(dayDiff(line.entryDate, t.transactionDate));
        if (daysApart > 3) continue;
        if (!best || daysApart < best.daysApart) {
          best = {
            entryId: line.entryId,
            entryNumber: line.entryNumber,
            entryDate: line.entryDate,
            description: line.entryDescription,
            daysApart,
          };
        }
      }
      if (best) {
        suggestions.set(t.id, best);
        // Consume the JE so two equal-amount transactions in the same
        // render never both suggest (and accept) the same entry.
        usedJeIds.add(best.entryId);
      }
    }
  }

  function userName(uid: string | null): string {
    if (!uid) return "—";
    return usersById.get(uid)?.fullName ?? uid;
  }

  const fmt = (n: number) =>
    formatMoney(n, bank.currencyCode, { paren: true, hideCurrency: true });

  const isOpen = session.status === "in_progress";

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Reconciliation", href: "/reconciliation" },
          { label: `${bank.name} @ ${formatDate(session.statementDate)}` },
        ]}
      />
      <PageHeader
        title={`Reconcile — ${bank.name}`}
        meta={`Statement ${formatDate(session.statementDate)} · ${bank.institution ?? ""} ${maskAccountNumber(bank.accountNumber, bank.lastFour)} · ${bank.currencyCode}`}
        actions={
          <>
            <ButtonLink href="/reconciliation" variant="secondary">
              ← All sessions
            </ButtonLink>
            {session.status === "completed" && <PrintButton label="Print sign-off" />}
            <Pill
              variant={
                session.status === "completed"
                  ? "active"
                  : session.status === "void"
                    ? "review"
                    : "pending"
              }
            >
              {statusLabel(session.status)}
            </Pill>
          </>
        }
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
        {session.status === "completed" && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            Completed by {userName(session.completedBy)}
            {session.completedAt
              ? ` on ${formatDate(session.completedAt.slice(0, 10))}`
              : ""}
            . The sign-off report below is print-ready.
          </div>
        )}
        {session.status === "void" && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            This session was voided — its cleared transactions were returned to
            unreconciled.
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <Tile
            label="Opening balance"
            value={fmt(anchor.openingBalance)}
            sub={
              anchor.anchorDate
                ? `Prior reconciliation @ ${formatDate(anchor.anchorDate)}`
                : "First reconciliation"
            }
          />
          <Tile label="Statement balance" value={fmt(statementBalance)} sub={`As of ${formatDate(session.statementDate)}`} />
          <Tile
            label="Book (GL) balance"
            value={fmt(bookBalance)}
            sub={glAccount ? `${glAccount.code} — ${glAccount.name}` : "No GL link"}
          />
          <Tile
            label="Cleared"
            value={fmt(clearedTotal)}
            sub={`${counted.length} transaction${counted.length === 1 ? "" : "s"} this statement`}
          />
          <Tile
            label="Outstanding"
            value={fmt(outstandingTotal)}
            sub={`${uncleared.length} uncleared`}
            neg={outstandingTotal < 0}
          />
          <Tile
            label="Difference"
            value={fmt(difference)}
            sub={balanced ? "Ready to complete" : "Ending − opening − cleared"}
            neg={!balanced}
          />
        </div>

        {/* ---- Sign-off report (the printable artifact for completed sessions,
             and a live running summary while in progress) ---- */}
        <Card
          title="Reconciliation summary"
          actions={
            session.status === "completed" ? (
              <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                Signed off by {userName(session.completedBy)}
              </span>
            ) : undefined
          }
        >
          <Table>
            <TBody>
              <TR hover={false}>
                <TD>Book (GL) balance as of {formatDate(session.statementDate)}</TD>
                <TD num>{fmt(bookBalance)}</TD>
              </TR>
              <TR hover={false}>
                <TD style={{ color: "var(--ink-3)" }}>
                  Less: outstanding items ({uncleared.length})
                </TD>
                <TD num neg={outstandingTotal > 0}>{fmt(-outstandingTotal)}</TD>
              </TR>
              <TR hover={false}>
                <TD>Book balance less outstanding</TD>
                <TD num>{fmt(bookBalance - outstandingTotal)}</TD>
              </TR>
              <TR hover={false}>
                <TD>
                  Statement opening balance
                  {anchor.anchorDate
                    ? ` (prior reconciliation @ ${formatDate(anchor.anchorDate)})`
                    : " (first reconciliation)"}
                </TD>
                <TD num>{fmt(anchor.openingBalance)}</TD>
              </TR>
              <TR hover={false}>
                <TD>
                  Cleared this statement ({counted.length})
                </TD>
                <TD num>{fmt(clearedTotal)}</TD>
              </TR>
              <TR hover={false}>
                <TD>Statement ending balance</TD>
                <TD num>{fmt(statementBalance)}</TD>
              </TR>
              <TR total hover={false}>
                <TD>Difference (ending − opening − cleared)</TD>
                <TD num neg={!balanced}>{fmt(difference)}</TD>
              </TR>
            </TBody>
          </Table>
        </Card>

        {isOpen && (
          <Card
            title={`Uncleared transactions on or before ${formatDate(session.statementDate)}`}
            actions={<Pill variant="pending">{uncleared.length} items</Pill>}
          >
            {uncleared.length === 0 ? (
              <Empty
                title="Nothing left to clear"
                body="Every bank transaction dated on or before the statement date is cleared."
              />
            ) : (
              <Table>
                <THead>
                  <TR hover={false}>
                    <TH style={{ width: 40 }}>Clear</TH>
                    <TH>Date</TH>
                    <TH>Description</TH>
                    <TH>Reference</TH>
                    <TH num>Amount</TH>
                    <TH>Suggested match</TH>
                  </TR>
                </THead>
                <TBody>
                  {uncleared.map((t) => {
                    const amount = parseAmount(t.amount);
                    const suggestion = suggestions.get(t.id);
                    return (
                      <TR key={t.id}>
                        <TD>
                          <form action={toggleClearedAction}>
                            <input type="hidden" name="sessionId" value={session.id} />
                            <input type="hidden" name="transactionId" value={t.id} />
                            <input type="hidden" name="cleared" value="1" />
                            <AutoSubmitCheckbox
                              checked={false}
                              disabled={!canReconcile}
                              ariaLabel={`Clear ${t.description}`}
                            />
                          </form>
                        </TD>
                        <TD>{formatDate(t.transactionDate)}</TD>
                        <TD>{t.description}</TD>
                        <TD mono style={{ color: "var(--ink-3)" }}>
                          {t.reference ?? "—"}
                        </TD>
                        <TD num neg={amount < 0}>
                          {/* Keep cents — must match the statement to the penny. */}
                          {fmt(amount)}
                        </TD>
                        <TD>
                          {suggestion ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <Link
                                href={`/journal/${suggestion.entryNumber}`}
                                style={{
                                  color: "var(--ink)",
                                  fontFamily: "var(--font-mono)",
                                  textDecoration: "none",
                                }}
                              >
                                {suggestion.entryNumber}
                              </Link>
                              <span style={{ color: "var(--ink-4)", fontSize: 11.5 }}>
                                {formatDate(suggestion.entryDate)}
                                {suggestion.daysApart > 0
                                  ? ` (±${suggestion.daysApart}d)`
                                  : " (same day)"}
                              </span>
                              <form action={acceptMatchAction}>
                                <input type="hidden" name="sessionId" value={session.id} />
                                <input type="hidden" name="transactionId" value={t.id} />
                                <input
                                  type="hidden"
                                  name="journalEntryId"
                                  value={suggestion.entryId}
                                />
                                <Button variant="secondary" type="submit" disabled={!canReconcile}>
                                  Accept
                                </Button>
                              </form>
                            </div>
                          ) : (
                            <span style={{ color: "var(--ink-4)" }}>—</span>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </Card>
        )}

        <Card
          title={isOpen ? "Cleared in this session" : "Transactions cleared in this session"}
          actions={<Pill variant="active">{clearedHere.length} items</Pill>}
        >
          {clearedHere.length === 0 ? (
            <Empty
              title="Nothing cleared in this session yet"
              body="Tick transactions above as they appear on the statement."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  {isOpen && <TH style={{ width: 40 }}>Cleared</TH>}
                  <TH>Date</TH>
                  <TH>Description</TH>
                  <TH>Reference</TH>
                  <TH>Matched JE</TH>
                  <TH num>Amount</TH>
                </TR>
              </THead>
              <TBody>
                {clearedHere.map((t) => {
                  const amount = parseAmount(t.amount);
                  const je = t.journalEntryId
                    ? entriesById.get(t.journalEntryId)
                    : undefined;
                  return (
                    <TR key={t.id}>
                      {isOpen && (
                        <TD>
                          <form action={toggleClearedAction}>
                            <input type="hidden" name="sessionId" value={session.id} />
                            <input type="hidden" name="transactionId" value={t.id} />
                            <input type="hidden" name="cleared" value="0" />
                            <AutoSubmitCheckbox
                              checked
                              disabled={!canReconcile}
                              ariaLabel={`Unclear ${t.description}`}
                            />
                          </form>
                        </TD>
                      )}
                      <TD>{formatDate(t.transactionDate)}</TD>
                      <TD>{t.description}</TD>
                      <TD mono style={{ color: "var(--ink-3)" }}>
                        {t.reference ?? "—"}
                      </TD>
                      <TD mono>
                        {je ? (
                          <Link
                            href={`/journal/${je.entryNumber}`}
                            style={{ color: "var(--ink)", textDecoration: "none" }}
                          >
                            {je.entryNumber}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD num neg={amount < 0}>
                        {fmt(amount)}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>

        {clearedElsewhere.length > 0 && (
          <Card
            title="Previously cleared (other sessions / legacy)"
            actions={
              <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                {anchor.anchorDate
                  ? `Rows cleared in prior sessions (or dated on/before ${formatDate(anchor.anchorDate)}) are covered by the opening balance`
                  : "Legacy cleared rows count toward this statement"}
              </span>
            }
          >
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Date</TH>
                  <TH>Description</TH>
                  <TH>Reference</TH>
                  <TH>Counted</TH>
                  <TH num>Amount</TH>
                </TR>
              </THead>
              <TBody>
                {clearedElsewhere.map((t) => {
                  const amount = parseAmount(t.amount);
                  const isCounted = countsTowardSession(t, session, anchor.anchorDate);
                  return (
                    <TR key={t.id}>
                      <TD>{formatDate(t.transactionDate)}</TD>
                      <TD style={{ color: "var(--ink-3)" }}>{t.description}</TD>
                      <TD mono style={{ color: "var(--ink-3)" }}>
                        {t.reference ?? "—"}
                      </TD>
                      <TD style={{ color: "var(--ink-3)" }}>
                        {isCounted ? "This statement" : "Opening balance"}
                      </TD>
                      <TD num neg={amount < 0} style={{ color: "var(--ink-3)" }}>
                        {fmt(amount)}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>
        )}

        {isOpen && (
          <Card title="Finish">
            <div className="p-3.5 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                {balanced
                  ? "Difference is 0.00 — the session can be completed and signed off."
                  : `Difference is ${fmt(difference)}. It must be exactly 0.00 to complete — clear the remaining statement lines or import/add the missing transactions.`}
              </div>
              <div className="flex items-center gap-2">
                <form action={voidSessionAction}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <ConfirmButton
                    label="Void session"
                    title="Void this reconciliation session?"
                    message="Every transaction cleared in this session returns to unreconciled and any accepted matches are unwound."
                    confirmText="Void session"
                  />
                </form>
                <form action={completeSessionAction}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={!balanced || !canReconcile}
                    style={
                      !balanced || !canReconcile
                        ? { opacity: 0.5, cursor: "not-allowed" }
                        : undefined
                    }
                  >
                    Complete reconciliation
                  </Button>
                </form>
              </div>
            </div>
          </Card>
        )}

        {session.status === "completed" && (
          <form action={voidSessionAction}>
            <input type="hidden" name="sessionId" value={session.id} />
            <Card title="Danger zone">
              <div className="p-3.5 flex items-center justify-between gap-3 text-[12.5px]">
                <span style={{ color: "var(--ink-3)" }}>
                  Voiding a completed reconciliation returns its cleared
                  transactions to unreconciled. Use only to reopen a period
                  reconciled in error.
                </span>
                <ConfirmButton
                  label="Void session"
                  title="Void this completed reconciliation?"
                  message="Its cleared transactions return to unreconciled and the sign-off is withdrawn. This cannot be undone."
                  confirmText="Void session"
                />
              </div>
            </Card>
          </form>
        )}
      </div>
    </>
  );
}
