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

// --------- Assets ---------

export type CreateAssetInput = {
  name: string;
  kind:
    | "real_estate"
    | "securities"
    | "cash"
    | "private_equity"
    | "art"
    | "vehicle"
    | "business_interest"
    | "intellectual_property"
    | "other";
  entityId: string;
  currencyCode?: string;
  externalRef?: string | null;
  acquiredDate?: string | null;
  notes?: string | null;
};

export async function createAsset(_user: SessionUser, input: CreateAssetInput) {
  const db = getDb();
  const id = uid("as");
  const [created] = await db
    .insert(schema.assets)
    .values({
      id,
      name: input.name,
      kind: input.kind,
      entityId: input.entityId,
      currencyCode: input.currencyCode ?? "USD",
      externalRef: input.externalRef ?? null,
      acquiredDate: input.acquiredDate ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return created;
}

export type UpdateAssetInput = Partial<CreateAssetInput>;

export async function updateAsset(
  _user: SessionUser,
  id: string,
  input: UpdateAssetInput,
) {
  const db = getDb();
  const [updated] = await db
    .update(schema.assets)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.entityId !== undefined && { entityId: input.entityId }),
      ...(input.currencyCode !== undefined && { currencyCode: input.currencyCode }),
      ...(input.externalRef !== undefined && { externalRef: input.externalRef }),
      ...(input.acquiredDate !== undefined && { acquiredDate: input.acquiredDate }),
      ...(input.notes !== undefined && { notes: input.notes }),
      updatedAt: new Date(),
    })
    .where(eq(schema.assets.id, id))
    .returning();
  if (!updated) throw new Error("Asset not found.");
  return updated;
}

export async function deleteAsset(_user: SessionUser, id: string) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.assetValueSnapshots)
      .where(eq(schema.assetValueSnapshots.assetId, id));
    await tx.delete(schema.assets).where(eq(schema.assets.id, id));
  });
}

export type CreateAssetSnapshotInput = {
  assetId: string;
  snapshotDate: string;
  value: number;
  currencyCode?: string;
  source?: string | null;
  notes?: string | null;
};

export async function createAssetSnapshot(
  user: SessionUser,
  input: CreateAssetSnapshotInput,
) {
  if (input.value < 0) throw new Error("Snapshot value must be non-negative.");
  const db = getDb();
  const id = uid("av");
  const [created] = await db
    .insert(schema.assetValueSnapshots)
    .values({
      id,
      assetId: input.assetId,
      snapshotDate: input.snapshotDate,
      value: toDecimalString(input.value),
      currencyCode: input.currencyCode ?? "USD",
      source: input.source ?? null,
      notes: input.notes ?? null,
      createdBy: user.userId,
    })
    .returning();
  return created;
}

// --------- Fee schedules + entity fees ---------

export type CreateFeeScheduleInput = {
  name: string;
  entityKind:
    | "llc"
    | "trust"
    | "scorp"
    | "ccorp"
    | "partnership"
    | "foundation"
    | "individual"
    | "other";
  annualFee: number;
  includedHours: number;
  applicableYear?: number | null;
  notes?: string | null;
};

export async function createFeeSchedule(
  _user: SessionUser,
  input: CreateFeeScheduleInput,
) {
  if (input.annualFee < 0) throw new Error("Annual fee must be ≥ 0.");
  if (input.includedHours < 0) throw new Error("Included hours must be ≥ 0.");
  const db = getDb();
  const id = uid("fs");
  const [created] = await db
    .insert(schema.feeSchedules)
    .values({
      id,
      name: input.name,
      entityKind: input.entityKind,
      annualFee: toDecimalString(input.annualFee),
      includedHours: input.includedHours.toFixed(2),
      applicableYear: input.applicableYear ?? null,
      isActive: true,
      notes: input.notes ?? null,
    })
    .returning();
  return created;
}

export type UpdateFeeScheduleInput = Partial<CreateFeeScheduleInput> & {
  isActive?: boolean;
};

export async function updateFeeSchedule(
  _user: SessionUser,
  id: string,
  input: UpdateFeeScheduleInput,
) {
  const db = getDb();
  const [updated] = await db
    .update(schema.feeSchedules)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.entityKind !== undefined && { entityKind: input.entityKind }),
      ...(input.annualFee !== undefined && {
        annualFee: toDecimalString(input.annualFee),
      }),
      ...(input.includedHours !== undefined && {
        includedHours: input.includedHours.toFixed(2),
      }),
      ...(input.applicableYear !== undefined && {
        applicableYear: input.applicableYear,
      }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.notes !== undefined && { notes: input.notes }),
      updatedAt: new Date(),
    })
    .where(eq(schema.feeSchedules.id, id))
    .returning();
  if (!updated) throw new Error("Fee schedule not found.");
  return updated;
}

export async function deleteFeeSchedule(_user: SessionUser, id: string) {
  const db = getDb();
  await db.delete(schema.feeSchedules).where(eq(schema.feeSchedules.id, id));
}

export type CreateEntityFeeInput = {
  entityId: string;
  billingYear: number;
  feeScheduleId?: string | null;
  annualFee: number;
  includedHours: number;
  status?: "draft" | "active" | "billed" | "paid" | "void";
  invoiceId?: string | null;
  notes?: string | null;
};

export async function createEntityFee(
  _user: SessionUser,
  input: CreateEntityFeeInput,
) {
  const db = getDb();
  const id = uid("ef");
  const [created] = await db
    .insert(schema.entityFees)
    .values({
      id,
      entityId: input.entityId,
      billingYear: input.billingYear,
      feeScheduleId: input.feeScheduleId ?? null,
      annualFee: toDecimalString(input.annualFee),
      includedHours: input.includedHours.toFixed(2),
      status: input.status ?? "draft",
      invoiceId: input.invoiceId ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return created;
}

export type UpdateEntityFeeInput = Partial<CreateEntityFeeInput>;

export async function updateEntityFee(
  _user: SessionUser,
  id: string,
  input: UpdateEntityFeeInput,
) {
  const db = getDb();
  const [updated] = await db
    .update(schema.entityFees)
    .set({
      ...(input.entityId !== undefined && { entityId: input.entityId }),
      ...(input.billingYear !== undefined && { billingYear: input.billingYear }),
      ...(input.feeScheduleId !== undefined && { feeScheduleId: input.feeScheduleId }),
      ...(input.annualFee !== undefined && {
        annualFee: toDecimalString(input.annualFee),
      }),
      ...(input.includedHours !== undefined && {
        includedHours: input.includedHours.toFixed(2),
      }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.invoiceId !== undefined && { invoiceId: input.invoiceId }),
      ...(input.notes !== undefined && { notes: input.notes }),
      updatedAt: new Date(),
    })
    .where(eq(schema.entityFees.id, id))
    .returning();
  if (!updated) throw new Error("Entity fee not found.");
  return updated;
}

export async function deleteEntityFee(_user: SessionUser, id: string) {
  const db = getDb();
  await db.delete(schema.entityFees).where(eq(schema.entityFees.id, id));
}

// --------- Employee rates ---------

export type CreateEmployeeRateInput = {
  userId: string;
  role: string;
  billableRate: number;
  costRate?: number | null;
  effectiveDate: string;
  isDefault?: boolean;
  notes?: string | null;
};

export async function createEmployeeRate(
  _user: SessionUser,
  input: CreateEmployeeRateInput,
) {
  const db = getDb();
  const id = uid("er");
  const [created] = await db
    .insert(schema.employeeRates)
    .values({
      id,
      userId: input.userId,
      role: input.role,
      billableRate: toDecimalString(input.billableRate),
      costRate: input.costRate == null ? null : toDecimalString(input.costRate),
      effectiveDate: input.effectiveDate,
      isDefault: input.isDefault ?? false,
      notes: input.notes ?? null,
    })
    .returning();
  return created;
}

export async function deleteEmployeeRate(_user: SessionUser, id: string) {
  const db = getDb();
  await db.delete(schema.employeeRates).where(eq(schema.employeeRates.id, id));
}

// --------- Time entries ---------

export type CreateTimeEntryInput = {
  userId: string;
  entryDate: string;
  durationHours: number;
  description: string;
  clientId?: string | null;
  entityId?: string | null;
  taskType?: string | null;
  isBillable?: boolean;
  rateAtLog?: number | null;
  notes?: string | null;
};

export async function createTimeEntry(
  _user: SessionUser,
  input: CreateTimeEntryInput,
) {
  if (input.durationHours <= 0) throw new Error("Duration must be > 0.");
  if (!input.description.trim()) throw new Error("Description is required.");
  const db = getDb();
  const id = uid("te");
  const [created] = await db
    .insert(schema.timeEntries)
    .values({
      id,
      userId: input.userId,
      entryDate: input.entryDate,
      durationHours: input.durationHours.toFixed(2),
      description: input.description.trim(),
      clientId: input.clientId ?? null,
      entityId: input.entityId ?? null,
      taskType: input.taskType ?? null,
      isBillable: input.isBillable ?? true,
      rateAtLog: input.rateAtLog == null ? null : toDecimalString(input.rateAtLog),
      notes: input.notes ?? null,
    })
    .returning();
  return created;
}

export type UpdateTimeEntryInput = Partial<CreateTimeEntryInput>;

export async function updateTimeEntry(
  _user: SessionUser,
  id: string,
  input: UpdateTimeEntryInput,
) {
  const db = getDb();
  const [updated] = await db
    .update(schema.timeEntries)
    .set({
      ...(input.userId !== undefined && { userId: input.userId }),
      ...(input.entryDate !== undefined && { entryDate: input.entryDate }),
      ...(input.durationHours !== undefined && {
        durationHours: input.durationHours.toFixed(2),
      }),
      ...(input.description !== undefined && { description: input.description.trim() }),
      ...(input.clientId !== undefined && { clientId: input.clientId }),
      ...(input.entityId !== undefined && { entityId: input.entityId }),
      ...(input.taskType !== undefined && { taskType: input.taskType }),
      ...(input.isBillable !== undefined && { isBillable: input.isBillable }),
      ...(input.rateAtLog !== undefined && {
        rateAtLog:
          input.rateAtLog == null ? null : toDecimalString(input.rateAtLog),
      }),
      ...(input.notes !== undefined && { notes: input.notes }),
      updatedAt: new Date(),
    })
    .where(eq(schema.timeEntries.id, id))
    .returning();
  if (!updated) throw new Error("Time entry not found.");
  return updated;
}

export async function deleteTimeEntry(_user: SessionUser, id: string) {
  const db = getDb();
  await db.delete(schema.timeEntries).where(eq(schema.timeEntries.id, id));
}

// --------- Contacts (unified Client/Vendor/Employee/Intermediary) ---------

export type CreateContactInput = {
  code: string;
  name: string;
  kind: "individual" | "organization";
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isClient?: boolean;
  isVendor?: boolean;
  isEmployee?: boolean;
  isIntermediary?: boolean;
  customerId?: string | null;
  vendorId?: string | null;
  userId?: string | null;
};

export async function createContact(_user: SessionUser, input: CreateContactInput) {
  const db = getDb();
  const [existing] = await db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(eq(schema.contacts.code, input.code))
    .limit(1);
  if (existing) throw new Error(`Contact code ${input.code} already exists.`);
  const id = uid("co");
  const [created] = await db
    .insert(schema.contacts)
    .values({
      id,
      code: input.code,
      name: input.name,
      kind: input.kind,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
      isClient: input.isClient ?? false,
      isVendor: input.isVendor ?? false,
      isEmployee: input.isEmployee ?? false,
      isIntermediary: input.isIntermediary ?? false,
      customerId: input.customerId ?? null,
      vendorId: input.vendorId ?? null,
      userId: input.userId ?? null,
      isActive: true,
    })
    .returning();
  return created;
}

export type UpdateContactInput = Partial<CreateContactInput> & { isActive?: boolean };

export async function updateContact(
  _user: SessionUser,
  id: string,
  input: UpdateContactInput,
) {
  const db = getDb();
  if (input.code) {
    const [collision] = await db
      .select({ id: schema.contacts.id })
      .from(schema.contacts)
      .where(eq(schema.contacts.code, input.code))
      .limit(1);
    if (collision && collision.id !== id) {
      throw new Error(`Contact code ${input.code} already exists.`);
    }
  }
  const [updated] = await db
    .update(schema.contacts)
    .set({
      ...(input.code !== undefined && { code: input.code }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.isClient !== undefined && { isClient: input.isClient }),
      ...(input.isVendor !== undefined && { isVendor: input.isVendor }),
      ...(input.isEmployee !== undefined && { isEmployee: input.isEmployee }),
      ...(input.isIntermediary !== undefined && {
        isIntermediary: input.isIntermediary,
      }),
      ...(input.customerId !== undefined && { customerId: input.customerId }),
      ...(input.vendorId !== undefined && { vendorId: input.vendorId }),
      ...(input.userId !== undefined && { userId: input.userId }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      updatedAt: new Date(),
    })
    .where(eq(schema.contacts.id, id))
    .returning();
  if (!updated) throw new Error("Contact not found.");
  return updated;
}

export async function deleteContact(_user: SessionUser, id: string) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(schema.contactLinks).where(eq(schema.contactLinks.contactId, id));
    await tx.delete(schema.contacts).where(eq(schema.contacts.id, id));
  });
}

export type CreateContactLinkInput = {
  contactId: string;
  refType: "entity" | "bank_account" | "invoice" | "bill" | "asset";
  refId: string;
  role?: string | null;
  notes?: string | null;
};

export async function createContactLink(
  _user: SessionUser,
  input: CreateContactLinkInput,
) {
  const db = getDb();
  const id = uid("cl");
  const [created] = await db
    .insert(schema.contactLinks)
    .values({
      id,
      contactId: input.contactId,
      refType: input.refType,
      refId: input.refId,
      role: input.role ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return created;
}

export async function deleteContactLink(_user: SessionUser, id: string) {
  const db = getDb();
  await db.delete(schema.contactLinks).where(eq(schema.contactLinks.id, id));
}

// --------- Offices ---------

export type CreateOfficeInput = {
  code: string;
  name: string;
  address?: string | null;
  currencyCode?: string;
  notes?: string | null;
};

export async function createOffice(_user: SessionUser, input: CreateOfficeInput) {
  const db = getDb();
  const [existing] = await db
    .select({ id: schema.offices.id })
    .from(schema.offices)
    .where(eq(schema.offices.code, input.code))
    .limit(1);
  if (existing) throw new Error(`Office code ${input.code} already exists.`);
  const id = uid("of");
  const [created] = await db
    .insert(schema.offices)
    .values({
      id,
      code: input.code,
      name: input.name,
      address: input.address ?? null,
      currencyCode: input.currencyCode ?? "USD",
      isActive: true,
      notes: input.notes ?? null,
    })
    .returning();
  return created;
}

export type UpdateOfficeInput = Partial<CreateOfficeInput> & { isActive?: boolean };

export async function updateOffice(
  _user: SessionUser,
  id: string,
  input: UpdateOfficeInput,
) {
  const db = getDb();
  const [updated] = await db
    .update(schema.offices)
    .set({
      ...(input.code !== undefined && { code: input.code }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.currencyCode !== undefined && { currencyCode: input.currencyCode }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      updatedAt: new Date(),
    })
    .where(eq(schema.offices.id, id))
    .returning();
  if (!updated) throw new Error("Office not found.");
  return updated;
}

export async function deleteOffice(_user: SessionUser, id: string) {
  const db = getDb();
  await db.delete(schema.offices).where(eq(schema.offices.id, id));
}

// --------- Price lists ---------

export type CreatePriceListInput = {
  officeId: string;
  name: string;
  versionNumber?: number;
  effectiveDate: string;
  isCurrent?: boolean;
  parentVersionId?: string | null;
  notes?: string | null;
};

export async function createPriceList(
  _user: SessionUser,
  input: CreatePriceListInput,
) {
  const db = getDb();
  const id = uid("pl");
  return await db.transaction(async (tx) => {
    if (input.isCurrent) {
      // Reset isCurrent on existing siblings for this office
      await tx
        .update(schema.priceLists)
        .set({ isCurrent: false })
        .where(eq(schema.priceLists.officeId, input.officeId));
    }
    const [created] = await tx
      .insert(schema.priceLists)
      .values({
        id,
        officeId: input.officeId,
        name: input.name,
        versionNumber: input.versionNumber ?? 1,
        effectiveDate: input.effectiveDate,
        isActive: true,
        isCurrent: input.isCurrent ?? false,
        parentVersionId: input.parentVersionId ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    return created;
  });
}

export type UpdatePriceListInput = Partial<CreatePriceListInput> & {
  isActive?: boolean;
};

export async function updatePriceList(
  _user: SessionUser,
  id: string,
  input: UpdatePriceListInput,
) {
  const db = getDb();
  return await db.transaction(async (tx) => {
    if (input.isCurrent) {
      const [existing] = await tx
        .select({ officeId: schema.priceLists.officeId })
        .from(schema.priceLists)
        .where(eq(schema.priceLists.id, id))
        .limit(1);
      if (existing) {
        await tx
          .update(schema.priceLists)
          .set({ isCurrent: false })
          .where(eq(schema.priceLists.officeId, existing.officeId));
      }
    }
    const [updated] = await tx
      .update(schema.priceLists)
      .set({
        ...(input.officeId !== undefined && { officeId: input.officeId }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.versionNumber !== undefined && {
          versionNumber: input.versionNumber,
        }),
        ...(input.effectiveDate !== undefined && {
          effectiveDate: input.effectiveDate,
        }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.isCurrent !== undefined && { isCurrent: input.isCurrent }),
        ...(input.parentVersionId !== undefined && {
          parentVersionId: input.parentVersionId,
        }),
        ...(input.notes !== undefined && { notes: input.notes }),
        updatedAt: new Date(),
      })
      .where(eq(schema.priceLists.id, id))
      .returning();
    if (!updated) throw new Error("Price list not found.");
    return updated;
  });
}

export async function deletePriceList(_user: SessionUser, id: string) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.priceListEntries)
      .where(eq(schema.priceListEntries.priceListId, id));
    await tx.delete(schema.priceLists).where(eq(schema.priceLists.id, id));
  });
}

/**
 * Clone a price list as the next version of the same office. Copies all
 * entries, increments versionNumber, sets parentVersionId, and (if
 * requested) flips isCurrent — clearing the flag on siblings inside the
 * same transaction.
 */
export async function clonePriceList(
  _user: SessionUser,
  sourceId: string,
  options: { name: string; effectiveDate: string; setCurrent?: boolean } = {
    name: "(cloned)",
    effectiveDate: new Date().toISOString().slice(0, 10),
  },
) {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(schema.priceLists)
      .where(eq(schema.priceLists.id, sourceId))
      .limit(1);
    if (!source) throw new Error("Source price list not found.");
    const sourceEntries = await tx
      .select()
      .from(schema.priceListEntries)
      .where(eq(schema.priceListEntries.priceListId, sourceId));

    if (options.setCurrent) {
      await tx
        .update(schema.priceLists)
        .set({ isCurrent: false })
        .where(eq(schema.priceLists.officeId, source.officeId));
    }
    const newId = uid("pl");
    const [created] = await tx
      .insert(schema.priceLists)
      .values({
        id: newId,
        officeId: source.officeId,
        name: options.name,
        versionNumber: source.versionNumber + 1,
        effectiveDate: options.effectiveDate,
        isActive: true,
        isCurrent: options.setCurrent ?? false,
        parentVersionId: source.id,
        notes: `Cloned from ${source.name}`,
      })
      .returning();
    if (sourceEntries.length > 0) {
      await tx.insert(schema.priceListEntries).values(
        sourceEntries.map((e, i) => ({
          id: `${newId}-e${i + 1}`,
          priceListId: newId,
          itemType: e.itemType,
          itemKey: e.itemKey,
          label: e.label,
          unitPrice: e.unitPrice,
          includedQuantity: e.includedQuantity,
          notes: e.notes,
        })),
      );
    }
    return created;
  });
}

export type CreatePriceListEntryInput = {
  priceListId: string;
  itemType: "entity_fee" | "time_rate" | "service";
  itemKey: string;
  label: string;
  unitPrice: number;
  includedQuantity?: number | null;
  notes?: string | null;
};

export async function createPriceListEntry(
  _user: SessionUser,
  input: CreatePriceListEntryInput,
) {
  const db = getDb();
  const id = uid("pe");
  const [created] = await db
    .insert(schema.priceListEntries)
    .values({
      id,
      priceListId: input.priceListId,
      itemType: input.itemType,
      itemKey: input.itemKey,
      label: input.label,
      unitPrice: toDecimalString(input.unitPrice),
      includedQuantity:
        input.includedQuantity == null ? null : input.includedQuantity.toFixed(2),
      notes: input.notes ?? null,
    })
    .returning();
  return created;
}

export async function deletePriceListEntry(_user: SessionUser, id: string) {
  const db = getDb();
  await db.delete(schema.priceListEntries).where(eq(schema.priceListEntries.id, id));
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

// --------- Bank accounts + signers ---------

export type CreateBankAccountInput = {
  name: string;
  accountId: string; // GL account
  institution?: string | null;
  lastFour?: string | null;
  currencyCode?: string;
  entityId?: string | null;
  clientId?: string | null;
  currentBalance?: number | null;
  balanceAsOf?: string | null;
};

export async function createBankAccount(
  _user: SessionUser,
  input: CreateBankAccountInput,
) {
  const db = getDb();
  const id = uid("ba");
  const [created] = await db
    .insert(schema.bankAccounts)
    .values({
      id,
      name: input.name,
      accountId: input.accountId,
      institution: input.institution ?? null,
      lastFour: input.lastFour ?? null,
      currencyCode: input.currencyCode ?? "USD",
      isActive: true,
      entityId: input.entityId ?? null,
      clientId: input.clientId ?? null,
      currentBalance:
        input.currentBalance == null ? null : toDecimalString(input.currentBalance),
      balanceAsOf: input.balanceAsOf ?? null,
    })
    .returning();
  return created;
}

export type UpdateBankAccountInput = Partial<CreateBankAccountInput> & {
  isActive?: boolean;
};

export async function updateBankAccount(
  _user: SessionUser,
  id: string,
  input: UpdateBankAccountInput,
) {
  const db = getDb();
  const [updated] = await db
    .update(schema.bankAccounts)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.accountId !== undefined && { accountId: input.accountId }),
      ...(input.institution !== undefined && { institution: input.institution }),
      ...(input.lastFour !== undefined && { lastFour: input.lastFour }),
      ...(input.currencyCode !== undefined && { currencyCode: input.currencyCode }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.entityId !== undefined && { entityId: input.entityId }),
      ...(input.clientId !== undefined && { clientId: input.clientId }),
      ...(input.currentBalance !== undefined && {
        currentBalance:
          input.currentBalance == null
            ? null
            : toDecimalString(input.currentBalance),
      }),
      ...(input.balanceAsOf !== undefined && { balanceAsOf: input.balanceAsOf }),
    })
    .where(eq(schema.bankAccounts.id, id))
    .returning();
  if (!updated) throw new Error("Bank account not found.");
  return updated;
}

export async function deleteBankAccount(_user: SessionUser, id: string) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.bankAccountSigners)
      .where(eq(schema.bankAccountSigners.bankAccountId, id));
    await tx.delete(schema.bankAccounts).where(eq(schema.bankAccounts.id, id));
  });
}

export type CreateSignerInput = {
  bankAccountId: string;
  name: string;
  email?: string | null;
  title?: string | null;
  authority: "sole" | "joint" | "limited" | "view_only";
  isPrimary?: boolean;
  addedDate?: string | null;
  notes?: string | null;
};

export async function createSigner(_user: SessionUser, input: CreateSignerInput) {
  const db = getDb();
  const id = uid("bs");
  const [created] = await db
    .insert(schema.bankAccountSigners)
    .values({
      id,
      bankAccountId: input.bankAccountId,
      name: input.name,
      email: input.email ?? null,
      title: input.title ?? null,
      authority: input.authority,
      isPrimary: input.isPrimary ?? false,
      addedDate: input.addedDate ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return created;
}

export async function deleteSigner(_user: SessionUser, id: string) {
  const db = getDb();
  await db.delete(schema.bankAccountSigners).where(eq(schema.bankAccountSigners.id, id));
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
