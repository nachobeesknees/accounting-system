/**
 * Customer statement builder shared by the statement page and its CSV route.
 * Lists open invoices (+ credit memos) as of a date, aged, plus funds on
 * account, with opening/closing balances.
 */

import type { Invoice } from "./types";
import { parseAmount } from "./money";

export type StatementLine = {
  invoiceId: string;
  invoiceNumber: string;
  kind: "invoice" | "credit_memo";
  invoiceDate: string;
  dueDate: string;
  ageDays: number;
  bucket: "current" | "d30" | "d60" | "d90" | "d90p";
  balance: number;
  currencyCode: string;
};

export type CustomerStatement = {
  lines: StatementLine[];
  openingBalance: number;
  closingBalance: number;
  fundsOnAccount: number;
  buckets: Record<"current" | "d30" | "d60" | "d90" | "d90p", number>;
};

function bucketFor(days: number): StatementLine["bucket"] {
  if (days <= 0) return "current";
  if (days <= 30) return "d30";
  if (days <= 60) return "d60";
  if (days <= 90) return "d90";
  return "d90p";
}

/**
 * Build a statement for a client as of `asOf`. Open invoices/credit memos
 * (non-void, non-template, non-zero balance) count. openingBalance is the
 * closing balance minus funds on account applied — for a demo-scale system
 * we treat opening as 0 and closing as the sum of open balances less funds.
 */
export function buildStatement(
  invoices: Invoice[],
  customerId: string,
  asOf: string,
  fundsOnAccount: number,
): CustomerStatement {
  const asOfDate = new Date(`${asOf}T00:00:00Z`);
  const lines: StatementLine[] = [];
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
  let closingBalance = 0;

  for (const inv of invoices) {
    if (inv.customerId !== customerId) continue;
    if (inv.isTemplate) continue;
    if (inv.status === "void") continue;
    if (inv.invoiceDate > asOf) continue;
    const balance = parseAmount(inv.balanceDue);
    if (Math.abs(balance) <= 0.005) continue;
    const due = new Date(`${inv.dueDate}T00:00:00Z`);
    const ageDays = Math.floor(
      (asOfDate.getTime() - due.getTime()) / (1000 * 60 * 60 * 24),
    );
    const bucket = bucketFor(ageDays);
    // Credit memos have negative balances; they reduce the aged total.
    buckets[bucket] += balance;
    closingBalance += balance;
    lines.push({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      kind: (inv.kind ?? "invoice") as "invoice" | "credit_memo",
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      ageDays,
      bucket,
      balance,
      currencyCode: inv.currencyCode,
    });
  }

  lines.sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));

  // Funds on account reduce the amount the client owes.
  const netClosing = closingBalance - fundsOnAccount;

  return {
    lines,
    openingBalance: 0,
    closingBalance: netClosing,
    fundsOnAccount,
    buckets,
  };
}
