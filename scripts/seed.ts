/**
 * Seed script — wipes and repopulates the Thistlewood demo database.
 *
 * Usage: DATABASE_URL=... npm run db:seed (or set it in .env.local).
 * The script also reads .env.local itself so contributors don't need to
 * remember to source it before running.
 *
 * Inserts:
 *  - 4 demo users (admin, bookkeeper, controller, CFO)
 *  - 17 GL accounts
 *  - 4 fiscal periods (Q1–Q4 2026; Q1 closed)
 *  - 5 customers, 5 vendors
 *  - 1 opening-balance JE dated 2026-01-01 (in closed Q1) carrying prior
 *    balances; balanced to zero so the trial balance ties.
 *  - 10 activity JEs (drafts, posts, one void) — ported from the original
 *    in-memory seed data.
 *  - 7 invoices and 6 bills with their line items.
 *  - 1 bank account + 6 bank transactions (3 reconciled, 3 outstanding).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local before anything imports getDb().
loadDotenvLocal();

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

import * as schema from "../src/db/schema";
import {
  ACCOUNTS,
  ASSETS,
  ASSET_VALUE_SNAPSHOTS,
  BANK_ACCOUNTS,
  BANK_ACCOUNT_SIGNERS,
  BANK_TRANSACTIONS,
  BILLS,
  CUSTOMERS,
  ENTITIES,
  ENTITY_FEES,
  FEE_SCHEDULES,
  INVOICES,
  JOURNAL_ENTRIES,
  PERIODS,
  USERS,
  VENDORS,
} from "../src/lib/seed";

function loadDotenvLocal() {
  const candidates = [".env.local", ".env"];
  for (const name of candidates) {
    try {
      const path = resolve(process.cwd(), name);
      const body = readFileSync(path, "utf8");
      for (const rawLine of body.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        // Strip wrapping quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env)) {
          process.env[key] = value;
        }
      }
      console.log(`Loaded env from ${name}`);
      return;
    } catch {
      // Try next candidate
    }
  }
}

// Opening balances — signed (debit-normal) amounts that lock down the
// pre-2026 ledger state. Sum to zero so debits and credits balance.
const OPENING_BALANCES: Record<string, number> = {
  "a-1000": 540_130, // Cash
  "a-1200": 165_000, // AR
  "a-1300": 18_250, // Prepaid
  "a-1500": 73_200, // Equipment
  "a-1510": -21_400, // Acc. depreciation (contra)
  "a-2000": -22_500, // AP
  "a-2100": -18_750, // Accrued
  "a-3000": -200_000, // Owner's equity
  "a-3100": -225_350, // Retained earnings
  "a-4000": -720_400, // Service revenue
  "a-4100": -4_200, // Interest income
  "a-5000": 44_000, // Rent
  "a-5100": 313_500, // Salaries
  "a-5200": 5_200, // Supplies
  "a-5300": 10_020, // Utilities
  "a-5400": 38_900, // Professional fees
  "a-5500": 4_400, // Depreciation
};

function toDecimalString(n: number): string {
  return n.toFixed(2);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is not set. Add it to .env.local or export it.",
    );
    process.exit(1);
  }

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  console.log("Wiping existing data…");
  // Order matters — child tables first to avoid orphan rows. We don't
  // declare FKs in the schema but truncating in order keeps things tidy
  // and survives if FKs are added later.
  await db.execute(sql`
    TRUNCATE TABLE
      payment_allocations,
      payments,
      bank_transactions,
      bank_account_signers,
      bank_accounts,
      bill_lines,
      bills,
      invoice_lines,
      invoices,
      journal_lines,
      journal_entries,
      activity_log,
      asset_value_snapshots,
      assets,
      entity_fees,
      fee_schedules,
      fiscal_periods,
      entities,
      vendors,
      customers,
      accounts,
      users
    RESTART IDENTITY CASCADE
  `);

  console.log("Inserting users…");
  await db.insert(schema.users).values(
    USERS.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      // Login validates against the literal password "demo123" — no hash
      // verification path exists yet. Store a sentinel so future password
      // verification can detect "this is a demo account".
      passwordHash: "$demo$demo123",
      role: u.role,
      isSuperuser: u.isSuperuser,
      isActive: true,
    })),
  );

  console.log("Inserting accounts…");
  await db.insert(schema.accounts).values(
    ACCOUNTS.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      accountType: a.accountType,
      subType: a.subType,
      currencyCode: a.currencyCode,
      isActive: a.isActive,
      normalBalance: a.normalBalance,
    })),
  );

  console.log("Inserting fiscal periods…");
  await db.insert(schema.fiscalPeriods).values(
    PERIODS.map((p) => ({
      id: p.id,
      name: p.name,
      startDate: p.startDate,
      endDate: p.endDate,
      status: p.status,
    })),
  );

  console.log("Inserting customers + vendors…");
  await db.insert(schema.customers).values(
    CUSTOMERS.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      email: c.email,
      phone: c.phone,
      billingAddress: c.billingAddress,
      paymentTerms: c.paymentTerms,
      isActive: c.isActive,
      notes: c.notes,
    })),
  );
  await db.insert(schema.vendors).values(
    VENDORS.map((v) => ({
      id: v.id,
      name: v.name,
      code: v.code,
      email: v.email,
      phone: v.phone,
      address: v.address,
      paymentTerms: v.paymentTerms,
      defaultExpenseAccountId: v.defaultExpenseAccountId,
      isActive: v.isActive,
      notes: v.notes,
    })),
  );

  console.log("Inserting entities…");
  await db.insert(schema.entities).values(
    ENTITIES.map((e) => ({
      id: e.id,
      code: e.code,
      name: e.name,
      clientId: e.clientId,
      kind: e.kind,
      jurisdiction: e.jurisdiction,
      formationDate: e.formationDate,
      status: e.status,
      ein: e.ein,
      notes: e.notes,
    })),
  );

  console.log("Inserting fee schedules + entity fees…");
  await db.insert(schema.feeSchedules).values(
    FEE_SCHEDULES.map((f) => ({
      id: f.id,
      name: f.name,
      entityKind: f.entityKind,
      annualFee: f.annualFee,
      includedHours: f.includedHours,
      applicableYear: f.applicableYear,
      isActive: f.isActive,
      notes: f.notes,
    })),
  );
  await db.insert(schema.entityFees).values(
    ENTITY_FEES.map((f) => ({
      id: f.id,
      entityId: f.entityId,
      billingYear: f.billingYear,
      feeScheduleId: f.feeScheduleId,
      annualFee: f.annualFee,
      includedHours: f.includedHours,
      status: f.status,
      invoiceId: f.invoiceId,
      notes: f.notes,
    })),
  );

  console.log("Inserting assets + value snapshots…");
  await db.insert(schema.assets).values(
    ASSETS.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      entityId: a.entityId,
      currencyCode: a.currencyCode,
      externalRef: a.externalRef,
      acquiredDate: a.acquiredDate,
      notes: a.notes,
    })),
  );
  await db.insert(schema.assetValueSnapshots).values(
    ASSET_VALUE_SNAPSHOTS.map((s) => ({
      id: s.id,
      assetId: s.assetId,
      snapshotDate: s.snapshotDate,
      value: s.value,
      currencyCode: s.currencyCode,
      source: s.source,
      notes: s.notes,
      createdBy: s.createdBy,
      createdAt: new Date(s.createdAt),
    })),
  );

  console.log("Inserting opening-balance journal entry…");
  const openingId = "j-opening";
  const openingDate = "2026-01-01";
  const openingPeriod = PERIODS.find((p) => p.name === "2026-Q1")?.id ?? null;
  await db.insert(schema.journalEntries).values({
    id: openingId,
    entryNumber: "JE-000100",
    entryDate: openingDate,
    fiscalPeriodId: openingPeriod,
    description: "Opening balances — carried forward from FY2025",
    reference: "OPENING",
    source: "manual",
    status: "posted",
    postedAt: new Date(`${openingDate}T12:00:00Z`),
    postedBy: "u-aldous",
    voidedAt: null,
    voidReason: null,
    createdBy: "u-aldous",
    createdAt: new Date(`${openingDate}T12:00:00Z`),
    updatedAt: new Date(`${openingDate}T12:00:00Z`),
  });
  const openingLineEntries = Object.entries(OPENING_BALANCES);
  let openingDebitTotal = 0;
  let openingCreditTotal = 0;
  await db.insert(schema.journalLines).values(
    openingLineEntries.map(([accountId, signed], idx) => {
      const debit = signed > 0 ? signed : 0;
      const credit = signed < 0 ? -signed : 0;
      openingDebitTotal += debit;
      openingCreditTotal += credit;
      return {
        id: `${openingId}-l${idx + 1}`,
        journalEntryId: openingId,
        lineNumber: idx + 1,
        accountId,
        description: "Opening balance",
        debit: toDecimalString(debit),
        credit: toDecimalString(credit),
      };
    }),
  );
  if (Math.abs(openingDebitTotal - openingCreditTotal) > 0.005) {
    throw new Error(
      `Opening balances unbalanced: debits ${openingDebitTotal} vs credits ${openingCreditTotal}`,
    );
  }

  console.log("Inserting activity journal entries…");
  await db.insert(schema.journalEntries).values(
    JOURNAL_ENTRIES.map((j) => ({
      id: j.id,
      entryNumber: j.entryNumber,
      entryDate: j.entryDate,
      fiscalPeriodId: j.fiscalPeriodId,
      description: j.description,
      reference: j.reference,
      source: j.source,
      status: j.status,
      postedAt: j.postedAt ? new Date(j.postedAt) : null,
      postedBy: j.postedBy,
      voidedAt: j.voidedAt ? new Date(j.voidedAt) : null,
      voidReason: j.voidReason,
      createdBy: j.createdBy,
      createdAt: new Date(j.createdAt),
      updatedAt: new Date(j.updatedAt),
    })),
  );
  const allActivityLines = JOURNAL_ENTRIES.flatMap((j) =>
    j.lines.map((l) => ({
      id: l.id,
      journalEntryId: l.journalEntryId,
      lineNumber: l.lineNumber,
      accountId: l.accountId,
      description: l.description,
      debit: l.debit,
      credit: l.credit,
    })),
  );
  if (allActivityLines.length > 0) {
    await db.insert(schema.journalLines).values(allActivityLines);
  }

  console.log("Inserting invoices + lines…");
  await db.insert(schema.invoices).values(
    INVOICES.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      customerId: i.customerId,
      invoiceDate: i.invoiceDate,
      dueDate: i.dueDate,
      status: i.status,
      subtotal: i.subtotal,
      taxAmount: i.taxAmount,
      total: i.total,
      amountPaid: i.amountPaid,
      balanceDue: i.balanceDue,
      currencyCode: i.currencyCode,
      notes: i.notes,
      journalEntryId: i.journalEntryId,
    })),
  );
  const allInvoiceLines = INVOICES.flatMap((i) =>
    i.lines.map((l) => ({
      id: l.id,
      invoiceId: l.invoiceId,
      lineNumber: l.lineNumber,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      amount: l.amount,
      accountId: l.accountId,
    })),
  );
  if (allInvoiceLines.length > 0) {
    await db.insert(schema.invoiceLines).values(allInvoiceLines);
  }

  console.log("Inserting bills + lines…");
  await db.insert(schema.bills).values(
    BILLS.map((b) => ({
      id: b.id,
      billNumber: b.billNumber,
      vendorId: b.vendorId,
      billDate: b.billDate,
      dueDate: b.dueDate,
      status: b.status,
      subtotal: b.subtotal,
      taxAmount: b.taxAmount,
      total: b.total,
      amountPaid: b.amountPaid,
      balanceDue: b.balanceDue,
      currencyCode: b.currencyCode,
      notes: b.notes,
      journalEntryId: b.journalEntryId,
    })),
  );
  const allBillLines = BILLS.flatMap((b) =>
    b.lines.map((l) => ({
      id: l.id,
      billId: l.billId,
      lineNumber: l.lineNumber,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      amount: l.amount,
      accountId: l.accountId,
    })),
  );
  if (allBillLines.length > 0) {
    await db.insert(schema.billLines).values(allBillLines);
  }

  console.log("Inserting bank accounts + signers + transactions…");
  await db.insert(schema.bankAccounts).values(
    BANK_ACCOUNTS.map((b) => ({
      id: b.id,
      name: b.name,
      accountId: b.accountId,
      institution: b.institution,
      lastFour: b.lastFour,
      currencyCode: b.currencyCode,
      isActive: b.isActive,
      entityId: b.entityId,
      clientId: b.clientId,
      currentBalance: b.currentBalance,
      balanceAsOf: b.balanceAsOf,
    })),
  );
  await db.insert(schema.bankAccountSigners).values(
    BANK_ACCOUNT_SIGNERS.map((s) => ({
      id: s.id,
      bankAccountId: s.bankAccountId,
      name: s.name,
      email: s.email,
      title: s.title,
      authority: s.authority,
      isPrimary: s.isPrimary,
      addedDate: s.addedDate,
      notes: s.notes,
    })),
  );
  await db.insert(schema.bankTransactions).values(
    BANK_TRANSACTIONS.map((t) => ({
      id: t.id,
      bankAccountId: t.bankAccountId,
      transactionDate: t.transactionDate,
      description: t.description,
      amount: t.amount,
      reference: t.reference,
      isReconciled: t.isReconciled,
      reconciledAt: t.reconciledAt ? new Date(t.reconciledAt) : null,
      journalEntryId: t.journalEntryId,
    })),
  );

  console.log("Done. Sign in at /login as any demo user — password is demo123.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
