/**
 * Write-side mutations. Mirrors the `applyCreate / applyUpdate / applyDelete`
 * pipeline from the build prompt — every mutation is funnelled through here
 * so we can attach activity logging in one place.
 */

import "server-only";

import { store } from "./store";
import { parseAmount, sumCredits, sumDebits, toDecimalString } from "./money";
import type {
  JournalEntry,
  JournalLine,
  SessionUser,
} from "./types";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function pad(n: number, w: number) {
  return n.toString().padStart(w, "0");
}

function nowIso() {
  return new Date().toISOString();
}

export function nextEntryNumber(): string {
  const n = store.nextJeNumber++;
  return `JE-${pad(n, 6)}`;
}

export function nextInvoiceNumber(): string {
  const n = store.nextInvoiceNumber++;
  return `INV-${pad(n, 6)}`;
}

export function nextBillNumber(): string {
  const year = new Date().getFullYear();
  const n = store.nextBillNumber++;
  return `BILL-${year}-${pad(n, 3)}`;
}

// --------- Journal entries ---------

export type DraftJournalLine = {
  accountId: string;
  description?: string | null;
  debit: number;
  credit: number;
};

export type CreateJournalEntryInput = {
  entryDate: string;
  description: string;
  reference?: string | null;
  source?: "manual" | "invoice" | "bill" | "reconciliation";
  fiscalPeriodId?: string | null;
  status?: "draft" | "posted";
  lines: DraftJournalLine[];
};

export function createJournalEntry(user: SessionUser, input: CreateJournalEntryInput): JournalEntry {
  if (input.lines.length < 2) {
    throw new Error("Journal entry must have at least 2 lines.");
  }

  // Validate each line is debit-or-credit, not both, not neither
  for (const [i, l] of input.lines.entries()) {
    const d = l.debit ?? 0, c = l.credit ?? 0;
    if (d < 0 || c < 0) throw new Error(`Line ${i + 1}: amounts must be non-negative.`);
    if ((d > 0 && c > 0) || (d === 0 && c === 0)) {
      throw new Error(`Line ${i + 1}: exactly one of debit or credit must be > 0.`);
    }
    if (!l.accountId) throw new Error(`Line ${i + 1}: account is required.`);
  }

  // Validate balanced
  const dt = input.lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const ct = input.lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  if (Math.abs(dt - ct) > 0.005) {
    throw new Error(`Entry is unbalanced: debits ${dt.toFixed(2)} ≠ credits ${ct.toFixed(2)}.`);
  }

  const id = uid("j");
  const status = input.status ?? "draft";
  const entry: JournalEntry = {
    id,
    entryNumber: nextEntryNumber(),
    entryDate: input.entryDate,
    fiscalPeriodId: input.fiscalPeriodId ?? null,
    description: input.description,
    reference: input.reference ?? null,
    source: input.source ?? "manual",
    status,
    postedAt: status === "posted" ? nowIso() : null,
    postedBy: status === "posted" ? user.userId : null,
    voidedAt: null,
    voidReason: null,
    createdBy: user.userId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lines: input.lines.map((l, i) => ({
      id: `${id}-l${i + 1}`,
      journalEntryId: id,
      lineNumber: i + 1,
      accountId: l.accountId,
      description: l.description ?? null,
      debit: toDecimalString(l.debit ?? 0),
      credit: toDecimalString(l.credit ?? 0),
    } satisfies JournalLine)),
  };

  store.journalEntries.unshift(entry);
  return entry;
}

export function postJournalEntry(user: SessionUser, entryId: string): JournalEntry {
  const entry = store.journalEntries.find((j) => j.id === entryId);
  if (!entry) throw new Error("Entry not found.");
  if (entry.status === "posted") return entry;
  if (entry.status === "void") throw new Error("Cannot post a voided entry.");

  // Period lock check
  if (entry.fiscalPeriodId) {
    const period = store.periods.find((p) => p.id === entry.fiscalPeriodId);
    if (period && period.status === "closed") {
      throw new Error(`Period ${period.name} is closed; cannot post.`);
    }
  }

  // Validate balanced
  const dt = sumDebits(entry.lines);
  const ct = sumCredits(entry.lines);
  if (Math.abs(dt - ct) > 0.005) {
    throw new Error(`Entry is unbalanced; cannot post.`);
  }

  entry.status = "posted";
  entry.postedAt = nowIso();
  entry.postedBy = user.userId;
  entry.updatedAt = nowIso();
  return entry;
}

export function voidJournalEntry(user: SessionUser, entryId: string, reason: string): JournalEntry {
  const entry = store.journalEntries.find((j) => j.id === entryId);
  if (!entry) throw new Error("Entry not found.");
  if (entry.status === "void") return entry;

  // Reversing entry mirrors the lines with debit/credit swapped
  if (entry.status === "posted") {
    const reversingId = uid("j");
    store.journalEntries.unshift({
      id: reversingId,
      entryNumber: nextEntryNumber(),
      entryDate: new Date().toISOString().slice(0, 10),
      fiscalPeriodId: entry.fiscalPeriodId,
      description: `Reversal of ${entry.entryNumber}${reason ? ` — ${reason}` : ""}`,
      reference: entry.entryNumber,
      source: entry.source,
      status: "posted",
      postedAt: nowIso(),
      postedBy: user.userId,
      voidedAt: null,
      voidReason: null,
      createdBy: user.userId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lines: entry.lines.map((l, i) => ({
        id: `${reversingId}-l${i + 1}`,
        journalEntryId: reversingId,
        lineNumber: i + 1,
        accountId: l.accountId,
        description: l.description,
        debit: l.credit,
        credit: l.debit,
      })),
    });
  }

  entry.status = "void";
  entry.voidedAt = nowIso();
  entry.voidReason = reason || null;
  entry.updatedAt = nowIso();
  return entry;
}

// --------- Customers / Vendors ---------

export function createCustomer(user: SessionUser, input: { code: string; name: string; email?: string | null; phone?: string | null; billingAddress?: string | null; paymentTerms: number }) {
  if (store.customers.some((c) => c.code === input.code)) {
    throw new Error(`Customer code ${input.code} already exists.`);
  }
  const customer = {
    id: uid("c"),
    code: input.code,
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    billingAddress: input.billingAddress ?? null,
    paymentTerms: input.paymentTerms,
    isActive: true,
    notes: null,
  };
  store.customers.push(customer);
  return customer;
}

export function createVendor(user: SessionUser, input: { code: string; name: string; email?: string | null; phone?: string | null; address?: string | null; paymentTerms: number; defaultExpenseAccountId?: string | null }) {
  if (store.vendors.some((v) => v.code === input.code)) {
    throw new Error(`Vendor code ${input.code} already exists.`);
  }
  const vendor = {
    id: uid("v"),
    code: input.code,
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    address: input.address ?? null,
    paymentTerms: input.paymentTerms,
    defaultExpenseAccountId: input.defaultExpenseAccountId ?? null,
    isActive: true,
    notes: null,
  };
  store.vendors.push(vendor);
  return vendor;
}

// --------- Reconciliation ---------

export function reconcileTransaction(user: SessionUser, txId: string, journalEntryId: string | null) {
  const tx = store.bankTransactions.find((t) => t.id === txId);
  if (!tx) throw new Error("Transaction not found.");
  tx.isReconciled = !tx.isReconciled;
  tx.reconciledAt = tx.isReconciled ? nowIso() : null;
  tx.journalEntryId = tx.isReconciled ? journalEntryId : null;
  return tx;
}

// --------- Periods ---------

export function setPeriodStatus(user: SessionUser, periodId: string, status: "open" | "closed") {
  const period = store.periods.find((p) => p.id === periodId);
  if (!period) throw new Error("Period not found.");
  period.status = status;
  return period;
}
