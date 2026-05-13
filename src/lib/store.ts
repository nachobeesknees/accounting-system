/**
 * Module-level mutable store. Seeded from src/lib/seed.ts. Persists for the
 * lifetime of a server process — on Vercel that's a single warm function
 * container. Cold starts will reset to seed. Good enough for a demo;
 * swap to Drizzle/Postgres later by replacing src/lib/data.ts read paths
 * and src/lib/mutations.ts write paths.
 */

import {
  ACCOUNTS,
  BANK_ACCOUNTS,
  BANK_TRANSACTIONS,
  BILLS,
  CUSTOMERS,
  INVOICES,
  JOURNAL_ENTRIES,
  PERIODS,
  USERS,
  VENDORS,
} from "./seed";
import type {
  Account,
  Bill,
  BankAccount,
  BankTransaction,
  Customer,
  FiscalPeriod,
  Invoice,
  JournalEntry,
  User,
  Vendor,
} from "./types";

type Store = {
  users: User[];
  accounts: Account[];
  periods: FiscalPeriod[];
  customers: Customer[];
  vendors: Vendor[];
  invoices: Invoice[];
  bills: Bill[];
  journalEntries: JournalEntry[];
  bankAccounts: BankAccount[];
  bankTransactions: BankTransaction[];
  nextJeNumber: number;
  nextInvoiceNumber: number;
  nextBillNumber: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __thistlewood_store: Store | undefined;
}

function build(): Store {
  return {
    users: [...USERS],
    accounts: [...ACCOUNTS],
    periods: [...PERIODS],
    customers: [...CUSTOMERS],
    vendors: [...VENDORS],
    invoices: [...INVOICES.map((i) => ({ ...i, lines: [...i.lines] }))],
    bills: [...BILLS.map((b) => ({ ...b, lines: [...b.lines] }))],
    journalEntries: [...JOURNAL_ENTRIES.map((j) => ({ ...j, lines: [...j.lines] }))],
    bankAccounts: [...BANK_ACCOUNTS],
    bankTransactions: [...BANK_TRANSACTIONS],
    nextJeNumber: 143,
    nextInvoiceNumber: 19,
    nextBillNumber: 59,
  };
}

export const store: Store = globalThis.__thistlewood_store ?? (globalThis.__thistlewood_store = build());
