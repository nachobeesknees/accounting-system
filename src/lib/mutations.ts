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

import { and, desc, eq } from "drizzle-orm";

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

// --------- Lookups + custom fields ---------

export async function createLookupTable(
  _user: SessionUser,
  input: { key: string; label: string; description?: string | null },
) {
  const db = getDb();
  const [created] = await db
    .insert(schema.lookupTables)
    .values({
      key: input.key,
      label: input.label,
      description: input.description ?? null,
      isSystem: false,
    })
    .returning();
  return created;
}

export async function deleteLookupTable(_user: SessionUser, key: string) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(schema.lookupValues).where(eq(schema.lookupValues.tableKey, key));
    await tx.delete(schema.lookupTables).where(eq(schema.lookupTables.key, key));
  });
}

export async function createLookupValue(
  _user: SessionUser,
  input: { tableKey: string; code: string; label: string; sortOrder?: number },
) {
  const db = getDb();
  const id = uid("lv");
  const [created] = await db
    .insert(schema.lookupValues)
    .values({
      id,
      tableKey: input.tableKey,
      code: input.code,
      label: input.label,
      sortOrder: input.sortOrder ?? 0,
      isActive: true,
      isSystem: false,
    })
    .returning();
  return created;
}

export async function updateLookupValue(
  _user: SessionUser,
  id: string,
  input: { label?: string; sortOrder?: number; isActive?: boolean },
) {
  const db = getDb();
  await db
    .update(schema.lookupValues)
    .set({
      ...(input.label !== undefined && { label: input.label }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      updatedAt: new Date(),
    })
    .where(eq(schema.lookupValues.id, id));
}

export async function deleteLookupValue(_user: SessionUser, id: string) {
  const db = getDb();
  await db.delete(schema.lookupValues).where(eq(schema.lookupValues.id, id));
}

export async function createCustomFieldDefinition(
  _user: SessionUser,
  input: {
    recordType: "entity" | "contact" | "asset" | "bank_account";
    fieldKey: string;
    label: string;
    fieldType: "text" | "number" | "date" | "boolean" | "select";
    options?: string[] | null;
    sortOrder?: number;
    isRequired?: boolean;
    helpText?: string | null;
  },
) {
  if (input.fieldType === "select" && (!input.options || input.options.length === 0)) {
    throw new Error("Select-type custom fields require at least one option.");
  }
  const db = getDb();
  const id = uid("cf");
  const [created] = await db
    .insert(schema.customFieldDefinitions)
    .values({
      id,
      recordType: input.recordType,
      fieldKey: input.fieldKey,
      label: input.label,
      fieldType: input.fieldType,
      options: input.options ?? null,
      sortOrder: input.sortOrder ?? 0,
      isRequired: input.isRequired ?? false,
      isActive: true,
      helpText: input.helpText ?? null,
    })
    .returning();
  return created;
}

export async function updateCustomFieldDefinition(
  _user: SessionUser,
  id: string,
  input: {
    label?: string;
    sortOrder?: number;
    isRequired?: boolean;
    isActive?: boolean;
    helpText?: string | null;
    options?: string[] | null;
  },
) {
  const db = getDb();
  await db
    .update(schema.customFieldDefinitions)
    .set({
      ...(input.label !== undefined && { label: input.label }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.isRequired !== undefined && { isRequired: input.isRequired }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.helpText !== undefined && { helpText: input.helpText }),
      ...(input.options !== undefined && { options: input.options }),
      updatedAt: new Date(),
    })
    .where(eq(schema.customFieldDefinitions.id, id));
}

export async function deleteCustomFieldDefinition(_user: SessionUser, id: string) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.customFieldValues)
      .where(eq(schema.customFieldValues.definitionId, id));
    await tx
      .delete(schema.customFieldDefinitions)
      .where(eq(schema.customFieldDefinitions.id, id));
  });
}

/**
 * Upsert a custom field value for a record. Stores the value into the
 * type-appropriate column on `custom_field_values` and nulls the rest.
 */
export async function setCustomFieldValue(
  _user: SessionUser,
  input: {
    definitionId: string;
    recordId: string;
    valueText?: string | null;
    valueNumber?: number | null;
    valueDate?: string | null;
    valueBoolean?: boolean | null;
  },
) {
  const db = getDb();
  const [existing] = await db
    .select({ id: schema.customFieldValues.id })
    .from(schema.customFieldValues)
    .where(
      and(
        eq(schema.customFieldValues.definitionId, input.definitionId),
        eq(schema.customFieldValues.recordId, input.recordId),
      ),
    )
    .limit(1);
  const valueNumberStr =
    input.valueNumber == null ? null : Number(input.valueNumber).toFixed(4);
  if (existing) {
    await db
      .update(schema.customFieldValues)
      .set({
        valueText: input.valueText ?? null,
        valueNumber: valueNumberStr,
        valueDate: input.valueDate ?? null,
        valueBoolean: input.valueBoolean ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.customFieldValues.id, existing.id));
    return existing.id;
  }
  const id = uid("cv");
  await db.insert(schema.customFieldValues).values({
    id,
    definitionId: input.definitionId,
    recordId: input.recordId,
    valueText: input.valueText ?? null,
    valueNumber: valueNumberStr,
    valueDate: input.valueDate ?? null,
    valueBoolean: input.valueBoolean ?? null,
  });
  return id;
}

// --------- Currencies + FX rates ---------

export type CreateCurrencyInput = {
  code: string;
  symbol: string;
  name: string;
  decimals?: number;
  isBase?: boolean;
};

export async function createCurrency(_user: SessionUser, input: CreateCurrencyInput) {
  const db = getDb();
  return await db.transaction(async (tx) => {
    if (input.isBase) {
      await tx.update(schema.currencies).set({ isBase: false });
    }
    const [created] = await tx
      .insert(schema.currencies)
      .values({
        code: input.code.toUpperCase(),
        symbol: input.symbol,
        name: input.name,
        decimals: input.decimals ?? 2,
        isBase: input.isBase ?? false,
        isActive: true,
      })
      .returning();
    return created;
  });
}

export async function setBaseCurrency(_user: SessionUser, code: string) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.update(schema.currencies).set({ isBase: false });
    const [updated] = await tx
      .update(schema.currencies)
      .set({ isBase: true, isActive: true })
      .where(eq(schema.currencies.code, code.toUpperCase()))
      .returning();
    if (!updated) throw new Error("Currency not found.");
  });
}

export async function setCurrencyActive(
  _user: SessionUser,
  code: string,
  isActive: boolean,
) {
  const db = getDb();
  await db
    .update(schema.currencies)
    .set({ isActive })
    .where(eq(schema.currencies.code, code.toUpperCase()));
}

export async function deleteCurrency(_user: SessionUser, code: string) {
  const db = getDb();
  await db.delete(schema.currencies).where(eq(schema.currencies.code, code.toUpperCase()));
}

export type CreateFxRateInput = {
  currencyCode: string;
  rateDate: string;
  ratePerBase: number;
  source?: string | null;
  notes?: string | null;
};

export async function createFxRate(_user: SessionUser, input: CreateFxRateInput) {
  if (!Number.isFinite(input.ratePerBase) || input.ratePerBase <= 0) {
    throw new Error("Rate must be > 0.");
  }
  const db = getDb();
  const id = uid("fx");
  const [created] = await db
    .insert(schema.fxRates)
    .values({
      id,
      currencyCode: input.currencyCode.toUpperCase(),
      rateDate: input.rateDate,
      ratePerBase: input.ratePerBase.toFixed(8),
      source: input.source ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return created;
}

export async function deleteFxRate(_user: SessionUser, id: string) {
  const db = getDb();
  await db.delete(schema.fxRates).where(eq(schema.fxRates.id, id));
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
  currencyCode?: string;
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
      currencyCode: input.currencyCode ?? "USD",
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
      ...(input.currencyCode !== undefined && { currencyCode: input.currencyCode }),
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
  entityId?: string | null;
  clientId?: string | null;
  currencyCode?: string;
  externalRef?: string | null;
  acquiredDate?: string | null;
  notes?: string | null;
};

export async function createAsset(_user: SessionUser, input: CreateAssetInput) {
  // Enforce ownership-chain invariant: must link to entity OR client.
  if (!input.entityId && !input.clientId) {
    throw new Error("Asset must belong to an entity or directly to a client.");
  }
  const db = getDb();
  const id = uid("as");
  const [created] = await db
    .insert(schema.assets)
    .values({
      id,
      name: input.name,
      kind: input.kind,
      entityId: input.entityId ?? null,
      clientId: input.clientId ?? null,
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
      ...(input.clientId !== undefined && { clientId: input.clientId }),
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

// --------- Customer assignment ---------

export async function setCustomerAssignedUser(
  _user: SessionUser,
  customerId: string,
  assignedUserId: string | null,
) {
  const db = getDb();
  await db
    .update(schema.customers)
    .set({ assignedUserId, updatedAt: new Date() })
    .where(eq(schema.customers.id, customerId));
}

// --------- Invoices (with auto-JE on post + payment) ---------

const AR_ACCOUNT_ID = "a-1200";
const AP_ACCOUNT_ID = "a-2000";
const DEFAULT_CASH_ACCOUNT_ID = "a-1000";
const SERVICE_REVENUE_ACCOUNT_ID = "a-4000";

export type DraftInvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  accountId: string;
};

export type CreateInvoiceInput = {
  customerId: string;
  invoiceDate: string;
  dueDate: string;
  notes?: string | null;
  lines: DraftInvoiceLine[];
};

export async function createInvoice(_user: SessionUser, input: CreateInvoiceInput) {
  if (input.lines.length === 0) throw new Error("Invoice must have at least 1 line.");
  for (const [i, l] of input.lines.entries()) {
    if (!l.accountId) throw new Error(`Line ${i + 1}: account is required.`);
    if (l.quantity <= 0) throw new Error(`Line ${i + 1}: quantity must be > 0.`);
    if (l.unitPrice < 0) throw new Error(`Line ${i + 1}: unit price must be >= 0.`);
    if (!l.description.trim()) throw new Error(`Line ${i + 1}: description is required.`);
  }

  const db = getDb();
  const id = uid("i");
  const invoiceNumber = await nextInvoiceNumber();
  const subtotal = input.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(schema.invoices).values({
      id,
      invoiceNumber,
      customerId: input.customerId,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      status: "draft",
      subtotal: toDecimalString(subtotal),
      taxAmount: "0.00",
      total: toDecimalString(subtotal),
      amountPaid: "0.00",
      balanceDue: toDecimalString(subtotal),
      currencyCode: "USD",
      notes: input.notes ?? null,
      journalEntryId: null,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(schema.invoiceLines).values(
      input.lines.map((l, i) => ({
        id: `${id}-l${i + 1}`,
        invoiceId: id,
        lineNumber: i + 1,
        description: l.description,
        quantity: l.quantity.toString(),
        unitPrice: toDecimalString(l.unitPrice),
        amount: toDecimalString(l.quantity * l.unitPrice),
        accountId: l.accountId,
        createdAt: now,
      })),
    );
  });
  return { id, invoiceNumber };
}

export async function postInvoice(user: SessionUser, invoiceId: string) {
  const db = getDb();
  const [inv] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, invoiceId))
    .limit(1);
  if (!inv) throw new Error("Invoice not found.");
  if (inv.status !== "draft") {
    throw new Error(`Invoice is already ${inv.status}.`);
  }

  const lines = await db
    .select()
    .from(schema.invoiceLines)
    .where(eq(schema.invoiceLines.invoiceId, invoiceId));
  if (lines.length === 0) throw new Error("Invoice has no lines.");

  const total = lines.reduce((s, l) => s + parseFloat(l.amount), 0);
  const jeLines: DraftJournalLine[] = [
    {
      accountId: AR_ACCOUNT_ID,
      description: `${inv.invoiceNumber}`,
      debit: total,
      credit: 0,
    },
    ...lines.map((l) => ({
      accountId: l.accountId,
      description: l.description,
      debit: 0,
      credit: parseFloat(l.amount),
    })),
  ];

  const je = await createJournalEntry(user, {
    entryDate: inv.invoiceDate,
    description: `Service invoice issued (${inv.invoiceNumber})`,
    reference: inv.invoiceNumber,
    source: "invoice",
    status: "posted",
    lines: jeLines,
  });

  await db
    .update(schema.invoices)
    .set({
      status: "sent",
      journalEntryId: je.id,
      updatedAt: new Date(),
    })
    .where(eq(schema.invoices.id, invoiceId));

  return { invoiceId, journalEntryId: je.id, entryNumber: je.entryNumber };
}

export type RecordInvoicePaymentInput = {
  invoiceId: string;
  amount: number;
  paymentDate: string;
  bankAccountId?: string | null;
  reference?: string | null;
};

export async function recordInvoicePayment(
  user: SessionUser,
  input: RecordInvoicePaymentInput,
) {
  const db = getDb();
  const [inv] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, input.invoiceId))
    .limit(1);
  if (!inv) throw new Error("Invoice not found.");
  if (inv.status === "draft") {
    throw new Error("Post the invoice before recording a payment.");
  }
  if (inv.status === "void") throw new Error("Invoice is voided.");
  if (inv.status === "paid") throw new Error("Invoice is already paid.");

  if (input.amount <= 0) throw new Error("Payment amount must be > 0.");
  const balanceDue = parseFloat(inv.balanceDue);
  if (input.amount > balanceDue + 0.005) {
    throw new Error(
      `Payment ${input.amount.toFixed(2)} exceeds balance due ${balanceDue.toFixed(2)}.`,
    );
  }

  let cashAccountId = DEFAULT_CASH_ACCOUNT_ID;
  if (input.bankAccountId) {
    const [ba] = await db
      .select({ accountId: schema.bankAccounts.accountId })
      .from(schema.bankAccounts)
      .where(eq(schema.bankAccounts.id, input.bankAccountId))
      .limit(1);
    if (ba) cashAccountId = ba.accountId;
  }

  const je = await createJournalEntry(user, {
    entryDate: input.paymentDate,
    description: `Payment received (${inv.invoiceNumber})`,
    reference: input.reference ?? inv.invoiceNumber,
    source: "invoice",
    status: "posted",
    lines: [
      { accountId: cashAccountId, description: "Deposit", debit: input.amount, credit: 0 },
      { accountId: AR_ACCOUNT_ID, description: "Apply AR", debit: 0, credit: input.amount },
    ],
  });

  const newPaid = parseFloat(inv.amountPaid) + input.amount;
  const newBalance = parseFloat(inv.total) - newPaid;
  const newStatus = newBalance < 0.005 ? "paid" : "partial";
  await db
    .update(schema.invoices)
    .set({
      amountPaid: toDecimalString(newPaid),
      balanceDue: toDecimalString(Math.max(0, newBalance)),
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(schema.invoices.id, input.invoiceId));

  return { invoiceId: input.invoiceId, journalEntryId: je.id, entryNumber: je.entryNumber };
}

export async function voidInvoice(user: SessionUser, invoiceId: string, reason: string) {
  const db = getDb();
  const [inv] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, invoiceId))
    .limit(1);
  if (!inv) throw new Error("Invoice not found.");
  if (inv.status === "void") return inv;

  if (inv.journalEntryId) {
    await voidJournalEntry(
      user,
      inv.journalEntryId,
      `Invoice ${inv.invoiceNumber} voided: ${reason}`,
    );
  }
  await db
    .update(schema.invoices)
    .set({ status: "void", updatedAt: new Date() })
    .where(eq(schema.invoices.id, invoiceId));
}

// --------- Invoice approval workflow ---------

/**
 * State machine for invoice approvals:
 *   draft ─ submit ─▶ pending_cfo
 *   pending_cfo ─ cfo approve ─▶ pending_assigned
 *   pending_cfo ─ reject ────────▶ draft
 *   pending_assigned ─ assigned approve ─▶ sent  (auto-posts JE via postInvoice)
 *   pending_assigned ─ reject ────────────▶ draft
 * Any non-terminal state can void.
 */

export async function submitInvoiceForApproval(
  _user: SessionUser,
  invoiceId: string,
) {
  const db = getDb();
  const [inv] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, invoiceId))
    .limit(1);
  if (!inv) throw new Error("Invoice not found.");
  if (inv.status !== "draft") {
    throw new Error(`Cannot submit invoice in status "${inv.status}".`);
  }
  await db
    .update(schema.invoices)
    .set({
      status: "pending_cfo",
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.invoices.id, invoiceId));
}

export async function cfoApproveInvoice(user: SessionUser, invoiceId: string) {
  const db = getDb();
  const [inv] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, invoiceId))
    .limit(1);
  if (!inv) throw new Error("Invoice not found.");
  if (inv.status !== "pending_cfo") {
    throw new Error(`Invoice is not pending CFO approval (status: ${inv.status}).`);
  }
  const [cust] = await db
    .select({ assignedUserId: schema.customers.assignedUserId })
    .from(schema.customers)
    .where(eq(schema.customers.id, inv.customerId))
    .limit(1);
  if (!cust || !cust.assignedUserId) {
    throw new Error(
      "Customer has no assigned employee. Assign one on the customer detail page before approving.",
    );
  }
  await db
    .update(schema.invoices)
    .set({
      status: "pending_assigned",
      cfoApprovedAt: new Date(),
      cfoApprovedBy: user.userId,
      updatedAt: new Date(),
    })
    .where(eq(schema.invoices.id, invoiceId));
}

export async function assignedApproveInvoice(user: SessionUser, invoiceId: string) {
  const db = getDb();
  const [inv] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, invoiceId))
    .limit(1);
  if (!inv) throw new Error("Invoice not found.");
  if (inv.status !== "pending_assigned") {
    throw new Error(`Invoice is not pending assigned approval (status: ${inv.status}).`);
  }
  const [cust] = await db
    .select({ assignedUserId: schema.customers.assignedUserId })
    .from(schema.customers)
    .where(eq(schema.customers.id, inv.customerId))
    .limit(1);
  if (!cust || !cust.assignedUserId) {
    throw new Error("Customer has no assigned employee.");
  }
  if (cust.assignedUserId !== user.userId && !user.isSuperuser) {
    throw new Error(
      "Only the assigned employee (or an Admin) can grant the final approval.",
    );
  }
  // Mark approved AND flip back to draft so postInvoice's "must be draft"
  // precondition is satisfied, then post — same JE posting path as the
  // manual one-click "Post" button.
  await db
    .update(schema.invoices)
    .set({
      assignedApprovedAt: new Date(),
      assignedApprovedBy: user.userId,
      status: "draft",
      updatedAt: new Date(),
    })
    .where(eq(schema.invoices.id, invoiceId));
  await postInvoice(user, invoiceId);
}

export async function rejectInvoice(
  user: SessionUser,
  invoiceId: string,
  reason: string,
) {
  const db = getDb();
  const [inv] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, invoiceId))
    .limit(1);
  if (!inv) throw new Error("Invoice not found.");
  if (inv.status !== "pending_cfo" && inv.status !== "pending_assigned") {
    throw new Error(`Cannot reject invoice in status "${inv.status}".`);
  }
  await db
    .update(schema.invoices)
    .set({
      status: "draft",
      cfoApprovedAt: null,
      cfoApprovedBy: null,
      assignedApprovedAt: null,
      assignedApprovedBy: null,
      rejectedAt: new Date(),
      rejectedBy: user.userId,
      rejectionReason: reason || "(no reason given)",
      updatedAt: new Date(),
    })
    .where(eq(schema.invoices.id, invoiceId));
}

// --------- Generate invoice from a client's entity fees ---------

export type AddonCharge = {
  /** Stable key from price_list_entries.item_key */
  key: string;
  /** Display label and unit price come from the price list at draft time. */
  label: string;
  unitPrice: number;
  quantity: number;
};

export type GenerateInvoiceFromFeesInput = {
  customerId: string;
  billingYear: number;
  invoiceDate?: string;
  dueDate?: string;
  /** Optional add-on charges (e.g. Compliance Fee, FS Preparation) */
  addons?: AddonCharge[];
  notes?: string | null;
  /** If true, submit straight to CFO for approval after creating. */
  submitForApproval?: boolean;
};

export async function generateInvoiceFromEntityFees(
  user: SessionUser,
  input: GenerateInvoiceFromFeesInput,
): Promise<{ id: string; invoiceNumber: string; lineCount: number }> {
  const db = getDb();

  const [cust] = await db
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.id, input.customerId))
    .limit(1);
  if (!cust) throw new Error("Customer not found.");

  // Entities owned by this client. In the demo seed, customer.id is used as
  // the clientId reference on entities.
  const entities = await db
    .select()
    .from(schema.entities)
    .where(eq(schema.entities.clientId, cust.id));

  // Fee lines (one per active entity fee for the billing year)
  const feeLines: DraftInvoiceLine[] = [];
  for (const ent of entities) {
    const fees = await db
      .select()
      .from(schema.entityFees)
      .where(eq(schema.entityFees.entityId, ent.id));
    for (const fee of fees) {
      if (fee.billingYear !== input.billingYear) continue;
      const amount = parseFloat(fee.annualFee);
      if (amount <= 0) continue;
      feeLines.push({
        description: `Annual fee — ${ent.name} (${ent.code}, ${input.billingYear})`,
        quantity: 1,
        unitPrice: amount,
        accountId: SERVICE_REVENUE_ACCOUNT_ID,
      });
    }
  }

  const addonLines: DraftInvoiceLine[] = (input.addons ?? [])
    .filter((a) => a.quantity > 0 && a.unitPrice >= 0)
    .map((a) => ({
      description: a.label,
      quantity: a.quantity,
      unitPrice: a.unitPrice,
      accountId: SERVICE_REVENUE_ACCOUNT_ID,
    }));

  const lines = [...feeLines, ...addonLines];
  if (lines.length === 0) {
    throw new Error("No billable lines could be generated.");
  }

  const today = new Date().toISOString().slice(0, 10);
  const due = new Date();
  due.setDate(due.getDate() + (cust.paymentTerms ?? 30));

  const { id, invoiceNumber } = await createInvoice(user, {
    customerId: cust.id,
    invoiceDate: input.invoiceDate ?? today,
    dueDate: input.dueDate ?? due.toISOString().slice(0, 10),
    notes: input.notes ?? `Auto-generated from ${input.billingYear} annual fees.`,
    lines,
  });

  if (input.submitForApproval) {
    await submitInvoiceForApproval(user, id);
  }

  return { id, invoiceNumber, lineCount: lines.length };
}

// --------- Bills (with auto-JE on approve + payment) ---------

export type DraftBillLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  accountId: string; // expense account
};

export type CreateBillInput = {
  vendorId: string;
  billDate: string;
  dueDate: string;
  reference?: string | null;
  notes?: string | null;
  lines: DraftBillLine[];
};

export async function createBill(_user: SessionUser, input: CreateBillInput) {
  if (input.lines.length === 0) throw new Error("Bill must have at least 1 line.");
  for (const [i, l] of input.lines.entries()) {
    if (!l.accountId) throw new Error(`Line ${i + 1}: account is required.`);
    if (l.quantity <= 0) throw new Error(`Line ${i + 1}: quantity must be > 0.`);
    if (l.unitPrice < 0) throw new Error(`Line ${i + 1}: unit price must be >= 0.`);
    if (!l.description.trim()) throw new Error(`Line ${i + 1}: description is required.`);
  }

  const db = getDb();
  const id = uid("b");
  const billNumber = input.reference?.trim() || (await nextBillNumber());
  const subtotal = input.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(schema.bills).values({
      id,
      billNumber,
      vendorId: input.vendorId,
      billDate: input.billDate,
      dueDate: input.dueDate,
      status: "draft",
      subtotal: toDecimalString(subtotal),
      taxAmount: "0.00",
      total: toDecimalString(subtotal),
      amountPaid: "0.00",
      balanceDue: toDecimalString(subtotal),
      currencyCode: "USD",
      notes: input.notes ?? null,
      journalEntryId: null,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(schema.billLines).values(
      input.lines.map((l, i) => ({
        id: `${id}-l${i + 1}`,
        billId: id,
        lineNumber: i + 1,
        description: l.description,
        quantity: l.quantity.toString(),
        unitPrice: toDecimalString(l.unitPrice),
        amount: toDecimalString(l.quantity * l.unitPrice),
        accountId: l.accountId,
        createdAt: now,
      })),
    );
  });
  return { id, billNumber };
}

export async function approveBill(user: SessionUser, billId: string) {
  const db = getDb();
  const [bill] = await db
    .select()
    .from(schema.bills)
    .where(eq(schema.bills.id, billId))
    .limit(1);
  if (!bill) throw new Error("Bill not found.");
  if (bill.status !== "draft") throw new Error(`Bill is already ${bill.status}.`);

  const lines = await db
    .select()
    .from(schema.billLines)
    .where(eq(schema.billLines.billId, billId));
  if (lines.length === 0) throw new Error("Bill has no lines.");

  const total = lines.reduce((s, l) => s + parseFloat(l.amount), 0);
  const jeLines: DraftJournalLine[] = [
    ...lines.map((l) => ({
      accountId: l.accountId,
      description: l.description,
      debit: parseFloat(l.amount),
      credit: 0,
    })),
    { accountId: AP_ACCOUNT_ID, description: bill.billNumber, debit: 0, credit: total },
  ];

  const je = await createJournalEntry(user, {
    entryDate: bill.billDate,
    description: `Bill approved (${bill.billNumber})`,
    reference: bill.billNumber,
    source: "bill",
    status: "posted",
    lines: jeLines,
  });

  await db
    .update(schema.bills)
    .set({
      status: "approved",
      journalEntryId: je.id,
      updatedAt: new Date(),
    })
    .where(eq(schema.bills.id, billId));

  return { billId, journalEntryId: je.id, entryNumber: je.entryNumber };
}

export type RecordBillPaymentInput = {
  billId: string;
  amount: number;
  paymentDate: string;
  bankAccountId?: string | null;
  reference?: string | null;
};

export async function recordBillPayment(
  user: SessionUser,
  input: RecordBillPaymentInput,
) {
  const db = getDb();
  const [bill] = await db
    .select()
    .from(schema.bills)
    .where(eq(schema.bills.id, input.billId))
    .limit(1);
  if (!bill) throw new Error("Bill not found.");
  if (bill.status === "draft") throw new Error("Approve the bill before paying.");
  if (bill.status === "void") throw new Error("Bill is voided.");
  if (bill.status === "paid") throw new Error("Bill is already paid.");

  if (input.amount <= 0) throw new Error("Payment amount must be > 0.");
  const balanceDue = parseFloat(bill.balanceDue);
  if (input.amount > balanceDue + 0.005) {
    throw new Error(
      `Payment ${input.amount.toFixed(2)} exceeds balance due ${balanceDue.toFixed(2)}.`,
    );
  }

  let cashAccountId = DEFAULT_CASH_ACCOUNT_ID;
  if (input.bankAccountId) {
    const [ba] = await db
      .select({ accountId: schema.bankAccounts.accountId })
      .from(schema.bankAccounts)
      .where(eq(schema.bankAccounts.id, input.bankAccountId))
      .limit(1);
    if (ba) cashAccountId = ba.accountId;
  }

  const je = await createJournalEntry(user, {
    entryDate: input.paymentDate,
    description: `Payment sent (${bill.billNumber})`,
    reference: input.reference ?? bill.billNumber,
    source: "bill",
    status: "posted",
    lines: [
      { accountId: AP_ACCOUNT_ID, description: "Pay AP", debit: input.amount, credit: 0 },
      { accountId: cashAccountId, description: "Bank out", debit: 0, credit: input.amount },
    ],
  });

  const newPaid = parseFloat(bill.amountPaid) + input.amount;
  const newBalance = parseFloat(bill.total) - newPaid;
  const newStatus = newBalance < 0.005 ? "paid" : "partial";
  await db
    .update(schema.bills)
    .set({
      amountPaid: toDecimalString(newPaid),
      balanceDue: toDecimalString(Math.max(0, newBalance)),
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(schema.bills.id, input.billId));

  return { billId: input.billId, journalEntryId: je.id, entryNumber: je.entryNumber };
}

export async function voidBill(user: SessionUser, billId: string, reason: string) {
  const db = getDb();
  const [bill] = await db
    .select()
    .from(schema.bills)
    .where(eq(schema.bills.id, billId))
    .limit(1);
  if (!bill) throw new Error("Bill not found.");
  if (bill.status === "void") return bill;

  if (bill.journalEntryId) {
    await voidJournalEntry(
      user,
      bill.journalEntryId,
      `Bill ${bill.billNumber} voided: ${reason}`,
    );
  }
  await db
    .update(schema.bills)
    .set({ status: "void", updatedAt: new Date() })
    .where(eq(schema.bills.id, billId));
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
