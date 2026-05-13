/**
 * Read-side data access. Pure functions reading from the in-memory store.
 * When we swap to a real DB, replace these with Drizzle queries; the
 * call-sites won't change.
 */

import { store } from "./store";
import { parseAmount, sumDebits, sumCredits } from "./money";
import type { Account, JournalEntry, AccountType } from "./types";

// --------- Lookups ---------

export function getAccounts(): Account[] {
  return store.accounts;
}

export function getAccountByCode(code: string): Account | undefined {
  return store.accounts.find((a) => a.code === code);
}

export function getAccountById(id: string): Account | undefined {
  return store.accounts.find((a) => a.id === id);
}

export function getCustomers() {
  return store.customers;
}

export function getCustomerById(id: string) {
  return store.customers.find((c) => c.id === id);
}

export function getVendors() {
  return store.vendors;
}

export function getVendorById(id: string) {
  return store.vendors.find((v) => v.id === id);
}

export function getInvoices() {
  return store.invoices;
}

export function getInvoiceById(id: string) {
  return store.invoices.find((i) => i.id === id);
}

export function getBills() {
  return store.bills;
}

export function getBillById(id: string) {
  return store.bills.find((b) => b.id === id);
}

export function getJournalEntries(): JournalEntry[] {
  return store.journalEntries.slice().sort((a, b) => b.entryDate.localeCompare(a.entryDate));
}

export function getJournalEntryById(id: string): JournalEntry | undefined {
  return store.journalEntries.find((j) => j.id === id);
}

export function getJournalEntryByNumber(num: string): JournalEntry | undefined {
  return store.journalEntries.find((j) => j.entryNumber === num);
}

export function getPeriods() {
  return store.periods;
}

export function getBankAccounts() {
  return store.bankAccounts;
}

export function getBankTransactions(bankAccountId?: string) {
  return bankAccountId
    ? store.bankTransactions.filter((t) => t.bankAccountId === bankAccountId)
    : store.bankTransactions;
}

export function getUsers() {
  return store.users;
}

export function getUserById(id: string) {
  return store.users.find((u) => u.id === id);
}

// --------- Derived: balances ---------

/**
 * Calculate balance for a single account from posted journal lines.
 * Debit-normal: SUM(debit) - SUM(credit). Credit-normal: SUM(credit) - SUM(debit).
 */
export function getAccountBalance(accountId: string): number {
  let bal = 0;
  for (const entry of store.journalEntries) {
    if (entry.status !== "posted") continue;
    for (const line of entry.lines) {
      if (line.accountId !== accountId) continue;
      bal += parseAmount(line.debit) - parseAmount(line.credit);
    }
  }
  // Seed the chart of accounts with prior-period openings so the demo
  // numbers feel real even before user activity:
  const opening = OPENING_BALANCES[accountId];
  if (opening !== undefined) bal += opening;
  const account = getAccountById(accountId);
  if (!account) return bal;
  return account.normalBalance === "debit" ? bal : -bal;
}

// Prior-period opening balances so the demo books look populated.
// Stored as signed debit-normal amounts.
// These must sum to zero so the trial balance balances.
// (Cash carries the offsetting amount.)
const OPENING_BALANCES: Record<string, number> = {
  "a-1000": 540_130,
  "a-1200": 165_000,
  "a-1300": 18_250,
  "a-1500": 73_200,
  "a-1510": -21_400,
  "a-2000": -22_500,
  "a-2100": -18_750,
  "a-3000": -200_000,
  "a-3100": -225_350,
  "a-4000": -720_400,
  "a-4100": -4_200,
  "a-5000": 44_000,
  "a-5100": 313_500,
  "a-5200": 5_200,
  "a-5300": 10_020,
  "a-5400": 38_900,
  "a-5500": 4_400,
};

/**
 * Raw signed (debit-normal) balance — debits positive, credits negative.
 * Equal to getAccountBalance() flipped for credit-normal accounts. Used
 * for accounting-equation arithmetic where contra accounts should subtract
 * naturally from their parent category.
 */
function getSignedDebitBalance(accountId: string): number {
  let bal = 0;
  for (const entry of store.journalEntries) {
    if (entry.status !== "posted") continue;
    for (const line of entry.lines) {
      if (line.accountId !== accountId) continue;
      bal += parseAmount(line.debit) - parseAmount(line.credit);
    }
  }
  const opening = OPENING_BALANCES[accountId];
  if (opening !== undefined) bal += opening;
  return bal;
}

export function getKpis() {
  let revenue = 0, expenses = 0, assets = 0, liabilities = 0, equity = 0;
  for (const a of store.accounts) {
    const raw = getSignedDebitBalance(a.id);
    if (a.accountType === "asset") assets += raw;
    else if (a.accountType === "liability") liabilities += -raw;
    else if (a.accountType === "equity") equity += -raw;
    else if (a.accountType === "revenue") revenue += -raw;
    else if (a.accountType === "expense") expenses += raw;
  }
  const cash = getAccountBalance("a-1000");
  return {
    revenue,
    expenses,
    netIncome: revenue - expenses,
    assets,
    liabilities,
    equity,
    cash,
  };
}

export function getTrialBalance() {
  return store.accounts.map((a) => {
    const bal = getAccountBalance(a.id);
    const isDebit = a.normalBalance === "debit";
    if (bal >= 0) {
      return {
        accountId: a.id,
        code: a.code,
        name: a.name,
        debit: isDebit ? bal : 0,
        credit: isDebit ? 0 : bal,
      };
    } else {
      // Contra balance — flip
      return {
        accountId: a.id,
        code: a.code,
        name: a.name,
        debit: isDebit ? 0 : -bal,
        credit: isDebit ? -bal : 0,
      };
    }
  });
}

// --------- Derived: aging ---------

export function getArAging(today: Date) {
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0 };
  for (const inv of store.invoices) {
    const bal = parseAmount(inv.balanceDue);
    if (bal <= 0) continue;
    const due = new Date(inv.dueDate);
    const daysOverdue = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    if (daysOverdue <= 0) buckets.current += bal;
    else if (daysOverdue <= 30) buckets.d30 += bal;
    else if (daysOverdue <= 60) buckets.d60 += bal;
    else buckets.d90 += bal;
  }
  return buckets;
}

export function getApAging(today: Date) {
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0 };
  for (const bill of store.bills) {
    const bal = parseAmount(bill.balanceDue);
    if (bal <= 0) continue;
    const due = new Date(bill.dueDate);
    const daysOverdue = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    if (daysOverdue <= 0) buckets.current += bal;
    else if (daysOverdue <= 30) buckets.d30 += bal;
    else if (daysOverdue <= 60) buckets.d60 += bal;
    else buckets.d90 += bal;
  }
  return buckets;
}

// --------- Helpers ---------

export function totalDebits(entry: JournalEntry): number {
  return sumDebits(entry.lines);
}

export function totalCredits(entry: JournalEntry): number {
  return sumCredits(entry.lines);
}

export function isBalanced(entry: JournalEntry): boolean {
  return Math.abs(totalDebits(entry) - totalCredits(entry)) < 0.005;
}

export function accountTypeOrder(): AccountType[] {
  return ["asset", "liability", "equity", "revenue", "expense"];
}

export function accountsByType() {
  const map = new Map<AccountType, Account[]>();
  for (const a of store.accounts) {
    if (!map.has(a.accountType)) map.set(a.accountType, []);
    map.get(a.accountType)!.push(a);
  }
  return map;
}

// The "today" for the demo. Fix it so reports match the seeded data.
export const DEMO_TODAY = new Date("2026-05-13T00:00:00Z");
