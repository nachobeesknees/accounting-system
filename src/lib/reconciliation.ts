/**
 * Shared reconciliation math — used by both the session page and the
 * complete-session mutation so the difference shown on screen is exactly
 * the difference the server enforces.
 *
 * The difference is anchored on the PRIOR completed session's statement
 * ending balance (the "opening balance" of this statement):
 *
 *   difference = statement ending − opening anchor − cleared this statement
 *
 * where "cleared this statement" counts reconciled transactions dated on
 * or before the statement date that were either cleared in THIS session,
 * or are legacy reconciled rows (no session id) dated after the anchor —
 * rows cleared in prior completed sessions (and legacy rows on or before
 * the anchor date) are already inside the anchor balance and must not be
 * double-counted. For the first session on an account the anchor is 0.00;
 * accounts onboarded mid-life reconcile their first statement by adding a
 * manual "Opening balance" transaction and clearing it in that session.
 */

import { parseAmount } from "./money";

export type AnchorSessionLike = {
  id: string;
  bankAccountId: string;
  statementDate: string;
  /** Numeric string from the DB. */
  statementEndingBalance: string;
  status: string;
};

export type ClearedTxLike = {
  transactionDate: string;
  /** Numeric string from the DB. */
  amount: string;
  isReconciled: boolean;
  reconciliationSessionId?: string | null;
};

export type OpeningAnchor = {
  /** Prior completed session's ending balance; 0 for a first session. */
  openingBalance: number;
  /** Statement date of the anchor session; null for a first session. */
  anchorDate: string | null;
  /** The anchor session's id, for display; null for a first session. */
  anchorSessionId: string | null;
};

/** Most recent completed session for the same account dated strictly
 *  before this session's statement date. */
export function findOpeningAnchor(
  session: { id: string; bankAccountId: string; statementDate: string },
  allSessions: AnchorSessionLike[],
): OpeningAnchor {
  let best: AnchorSessionLike | null = null;
  for (const s of allSessions) {
    if (s.id === session.id) continue;
    if (s.bankAccountId !== session.bankAccountId) continue;
    if (s.status !== "completed") continue;
    if (s.statementDate >= session.statementDate) continue;
    if (!best || s.statementDate > best.statementDate) best = s;
  }
  if (!best) return { openingBalance: 0, anchorDate: null, anchorSessionId: null };
  return {
    openingBalance: parseAmount(best.statementEndingBalance),
    anchorDate: best.statementDate,
    anchorSessionId: best.id,
  };
}

/** Does this reconciled transaction count toward the session's cleared
 *  movement (vs. being covered by the opening anchor)? */
export function countsTowardSession(
  tx: ClearedTxLike,
  session: { id: string; statementDate: string },
  anchorDate: string | null,
): boolean {
  if (!tx.isReconciled) return false;
  if (tx.transactionDate > session.statementDate) return false;
  if (tx.reconciliationSessionId === session.id) return true;
  // Legacy reconciled rows (never captured by a session) count only when
  // dated after the anchor — earlier ones are inside the anchor balance.
  if (tx.reconciliationSessionId == null) {
    return anchorDate == null || tx.transactionDate > anchorDate;
  }
  // Cleared in some other session — covered by (or belonging to) that
  // session's statement, never this one's.
  return false;
}

export function computeClearedTotal(
  txs: ClearedTxLike[],
  session: { id: string; statementDate: string },
  anchorDate: string | null,
): number {
  return txs.reduce(
    (s, t) =>
      countsTowardSession(t, session, anchorDate) ? s + parseAmount(t.amount) : s,
    0,
  );
}
