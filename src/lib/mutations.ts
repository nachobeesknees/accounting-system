/**
 * Write-side mutations. Backed by Drizzle/Postgres. Journal-entry creation
 * and voiding run inside a transaction so the head and the lines (and any
 * reversing entry) commit atomically — partial entries would leave the
 * trial balance out of balance.
 *
 * The number generators (`nextEntryNumber`, …) read MAX(entry_number) from
 * the DB and bump by one. Unique constraints on those columns are the
 * authoritative defense against duplicate numbers — a concurrent caller
 * will fail on insert rather than silently win the race.
 */

import "server-only";

import { desc, eq } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { sumCredits, sumDebits, toDecimalString } from "./money";
import type { JournalEntry, SessionUser } from "./types";
import { getJournalEntryById } from "./data";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function pad(n: number, w: number) {
  return n.toString().padStart(w, "0");
}

function parseTrailingInt(s: string | undefined): number {
  if (!s) return 0;
  const m = s.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

// --------- Number generators ---------

export async function nextEntryNumber(): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ entryNumber: schema.journalEntries.entryNumber })
    .from(schema.journalEntries)
    .orderBy(desc(schema.journalEntries.entryNumber))
    .limit(1);
  const n = parseTrailingInt(row?.entryNumber) + 1;
  return `JE-${pad(n, 6)}`;
}

export async function nextInvoiceNumber(): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ invoiceNumber: schema.invoices.invoiceNumber })
    .from(schema.invoices)
    .orderBy(desc(schema.invoices.invoiceNumber))
    .limit(1);
  const n = parseTrailingInt(row?.invoiceNumber) + 1;
  return `INV-${pad(n, 6)}`;
}

export async function nextBillNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const db = getDb();
  const [row] = await db
    .select({ billNumber: schema.bills.billNumber })
    .from(schema.bills)
    .orderBy(desc(schema.bills.billNumber))
    .limit(1);
  const n = parseTrailingInt(row?.billNumber) + 1;
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

export async function createJournalEntry(
  user: SessionUser,
  input: CreateJournalEntryInput,
): Promise<JournalEntry> {
  if (input.lines.length < 2) {
    throw new Error("Journal entry must have at least 2 lines.");
  }

  for (const [i, l] of input.lines.entries()) {
    const d = l.debit ?? 0,
      c = l.credit ?? 0;
    if (d < 0 || c < 0) throw new Error(`Line ${i + 1}: amounts must be non-negative.`);
    if ((d > 0 && c > 0) || (d === 0 && c === 0)) {
      throw new Error(`Line ${i + 1}: exactly one of debit or credit must be > 0.`);
    }
    if (!l.accountId) throw new Error(`Line ${i + 1}: account is required.`);
  }

  const dt = input.lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const ct = input.lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  if (Math.abs(dt - ct) > 0.005) {
    throw new Error(
      `Entry is unbalanced: debits ${dt.toFixed(2)} ≠ credits ${ct.toFixed(2)}.`,
    );
  }

  const db = getDb();
  const id = uid("j");
  const entryNumber = await nextEntryNumber();
  const status = input.status ?? "draft";
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(schema.journalEntries).values({
      id,
      entryNumber,
      entryDate: input.entryDate,
      fiscalPeriodId: input.fiscalPeriodId ?? null,
      description: input.description,
      reference: input.reference ?? null,
      source: input.source ?? "manual",
      status,
      postedAt: status === "posted" ? now : null,
      postedBy: status === "posted" ? user.userId : null,
      voidedAt: null,
      voidReason: null,
      createdBy: user.userId,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(schema.journalLines).values(
      input.lines.map((l, i) => ({
        id: `${id}-l${i + 1}`,
        journalEntryId: id,
        lineNumber: i + 1,
        accountId: l.accountId,
        description: l.description ?? null,
        debit: toDecimalString(l.debit ?? 0),
        credit: toDecimalString(l.credit ?? 0),
      })),
    );
  });

  const created = await getJournalEntryById(id);
  if (!created) throw new Error("Created entry not found after insert.");
  return created;
}

export async function postJournalEntry(
  user: SessionUser,
  entryId: string,
): Promise<JournalEntry> {
  const entry = await getJournalEntryById(entryId);
  if (!entry) throw new Error("Entry not found.");
  if (entry.status === "posted") return entry;
  if (entry.status === "void") throw new Error("Cannot post a voided entry.");

  if (entry.fiscalPeriodId) {
    const db = getDb();
    const [period] = await db
      .select()
      .from(schema.fiscalPeriods)
      .where(eq(schema.fiscalPeriods.id, entry.fiscalPeriodId))
      .limit(1);
    if (period && period.status === "closed") {
      throw new Error(`Period ${period.name} is closed; cannot post.`);
    }
  }

  const dt = sumDebits(entry.lines);
  const ct = sumCredits(entry.lines);
  if (Math.abs(dt - ct) > 0.005) {
    throw new Error(`Entry is unbalanced; cannot post.`);
  }

  const db = getDb();
  const now = new Date();
  await db
    .update(schema.journalEntries)
    .set({
      status: "posted",
      postedAt: now,
      postedBy: user.userId,
      updatedAt: now,
    })
    .where(eq(schema.journalEntries.id, entryId));

  const updated = await getJournalEntryById(entryId);
  if (!updated) throw new Error("Entry vanished after post.");
  return updated;
}

export async function voidJournalEntry(
  user: SessionUser,
  entryId: string,
  reason: string,
): Promise<JournalEntry> {
  const entry = await getJournalEntryById(entryId);
  if (!entry) throw new Error("Entry not found.");
  if (entry.status === "void") return entry;

  const db = getDb();
  const now = new Date();
  const wasPosted = entry.status === "posted";

  await db.transaction(async (tx) => {
    if (wasPosted) {
      // Reversing entry mirrors lines with debit/credit swapped.
      const reversingId = uid("j");
      // Compute next entry number inside the txn to keep it monotonic.
      const [maxRow] = await tx
        .select({ entryNumber: schema.journalEntries.entryNumber })
        .from(schema.journalEntries)
        .orderBy(desc(schema.journalEntries.entryNumber))
        .limit(1);
      const n = parseTrailingInt(maxRow?.entryNumber) + 1;
      const reversingNumber = `JE-${pad(n, 6)}`;

      await tx.insert(schema.journalEntries).values({
        id: reversingId,
        entryNumber: reversingNumber,
        entryDate: new Date().toISOString().slice(0, 10),
        fiscalPeriodId: entry.fiscalPeriodId,
        description: `Reversal of ${entry.entryNumber}${reason ? ` — ${reason}` : ""}`,
        reference: entry.entryNumber,
        source: entry.source,
        status: "posted",
        postedAt: now,
        postedBy: user.userId,
        voidedAt: null,
        voidReason: null,
        createdBy: user.userId,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(schema.journalLines).values(
        entry.lines.map((l, i) => ({
          id: `${reversingId}-l${i + 1}`,
          journalEntryId: reversingId,
          lineNumber: i + 1,
          accountId: l.accountId,
          description: l.description,
          debit: l.credit,
          credit: l.debit,
        })),
      );
    }

    await tx
      .update(schema.journalEntries)
      .set({
        status: "void",
        voidedAt: now,
        voidReason: reason || null,
        updatedAt: now,
      })
      .where(eq(schema.journalEntries.id, entryId));
  });

  const updated = await getJournalEntryById(entryId);
  if (!updated) throw new Error("Entry vanished after void.");
  return updated;
}

// --------- Entities ---------

export type CreateEntityInput = {
  code: string;
  name: string;
  clientId: string;
  kind: "llc" | "trust" | "scorp" | "ccorp" | "partnership" | "foundation" | "individual" | "other";
  jurisdiction?: string | null;
  formationDate?: string | null;
  status?: "active" | "pending" | "dormant" | "dissolved";
  ein?: string | null;
  notes?: string | null;
};

export async function createEntity(_user: SessionUser, input: CreateEntityInput) {
  const db = getDb();
  const [existing] = await db
    .select({ id: schema.entities.id })
    .from(schema.entities)
    .where(eq(schema.entities.code, input.code))
    .limit(1);
  if (existing) {
    throw new Error(`Entity code ${input.code} already exists.`);
  }
  const id = uid("e");
  const [created] = await db
    .insert(schema.entities)
    .values({
      id,
      code: input.code,
      name: input.name,
      clientId: input.clientId,
      kind: input.kind,
      jurisdiction: input.jurisdiction ?? null,
      formationDate: input.formationDate ?? null,
      status: input.status ?? "active",
      ein: input.ein ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return created;
}

export type UpdateEntityInput = Partial<Omit<CreateEntityInput, "code">> & {
  code?: string;
};

export async function updateEntity(
  _user: SessionUser,
  id: string,
  input: UpdateEntityInput,
) {
  const db = getDb();
  // Code change must remain unique
  if (input.code) {
    const [collision] = await db
      .select({ id: schema.entities.id })
      .from(schema.entities)
      .where(eq(schema.entities.code, input.code))
      .limit(1);
    if (collision && collision.id !== id) {
      throw new Error(`Entity code ${input.code} already exists.`);
    }
  }
  const [updated] = await db
    .update(schema.entities)
    .set({
      ...(input.code !== undefined && { code: input.code }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.clientId !== undefined && { clientId: input.clientId }),
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.jurisdiction !== undefined && { jurisdiction: input.jurisdiction }),
      ...(input.formationDate !== undefined && { formationDate: input.formationDate }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.ein !== undefined && { ein: input.ein }),
      ...(input.notes !== undefined && { notes: input.notes }),
      updatedAt: new Date(),
    })
    .where(eq(schema.entities.id, id))
    .returning();
  if (!updated) throw new Error("Entity not found.");
  return updated;
}

export async function deleteEntity(_user: SessionUser, id: string) {
  const db = getDb();
  await db.delete(schema.entities).where(eq(schema.entities.id, id));
}

// --------- Customers / Vendors ---------

export async function createCustomer(
  _user: SessionUser,
  input: {
    code: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    billingAddress?: string | null;
    paymentTerms: number;
  },
) {
  const db = getDb();
  const [existing] = await db
    .select({ id: schema.customers.id })
    .from(schema.customers)
    .where(eq(schema.customers.code, input.code))
    .limit(1);
  if (existing) {
    throw new Error(`Customer code ${input.code} already exists.`);
  }
  const id = uid("c");
  const [created] = await db
    .insert(schema.customers)
    .values({
      id,
      code: input.code,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      billingAddress: input.billingAddress ?? null,
      paymentTerms: input.paymentTerms,
      isActive: true,
      notes: null,
    })
    .returning();
  return created;
}

export async function createVendor(
  _user: SessionUser,
  input: {
    code: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    paymentTerms: number;
    defaultExpenseAccountId?: string | null;
  },
) {
  const db = getDb();
  const [existing] = await db
    .select({ id: schema.vendors.id })
    .from(schema.vendors)
    .where(eq(schema.vendors.code, input.code))
    .limit(1);
  if (existing) {
    throw new Error(`Vendor code ${input.code} already exists.`);
  }
  const id = uid("v");
  const [created] = await db
    .insert(schema.vendors)
    .values({
      id,
      code: input.code,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      paymentTerms: input.paymentTerms,
      defaultExpenseAccountId: input.defaultExpenseAccountId ?? null,
      isActive: true,
      notes: null,
    })
    .returning();
  return created;
}

// --------- Reconciliation ---------

export async function reconcileTransaction(
  _user: SessionUser,
  txId: string,
  journalEntryId: string | null,
) {
  const db = getDb();
  const [tx] = await db
    .select()
    .from(schema.bankTransactions)
    .where(eq(schema.bankTransactions.id, txId))
    .limit(1);
  if (!tx) throw new Error("Transaction not found.");
  const newReconciled = !tx.isReconciled;
  await db
    .update(schema.bankTransactions)
    .set({
      isReconciled: newReconciled,
      reconciledAt: newReconciled ? new Date() : null,
      journalEntryId: newReconciled ? journalEntryId : null,
    })
    .where(eq(schema.bankTransactions.id, txId));
  return { ...tx, isReconciled: newReconciled };
}

// --------- Periods ---------

export async function setPeriodStatus(
  _user: SessionUser,
  periodId: string,
  status: "open" | "closed",
) {
  const db = getDb();
  const [updated] = await db
    .update(schema.fiscalPeriods)
    .set({ status })
    .where(eq(schema.fiscalPeriods.id, periodId))
    .returning();
  if (!updated) throw new Error("Period not found.");
  return updated;
}
