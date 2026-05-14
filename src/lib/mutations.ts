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

import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { parseAmount, sumCredits, sumDebits, toDecimalString } from "./money";
import type {
  JournalEntry,
  RecurringFrequency,
  SessionUser,
} from "./types";
import { getJournalEntryById } from "./data";
import { getEntityScope } from "./entity-scope";
import { checkPeriodForPost } from "./periods";

/**
 * Currency to use for a new transaction issued by the firm. Prefers the
 * currently-scoped firm entity's currency; falls back to the first active
 * firm's currency, then "USD". Used by createInvoice / createBill so a
 * non-USD scope (e.g. Europe SARL) issues invoices in the right currency
 * instead of always defaulting to USD.
 */
async function getFirmIssuingCurrency(): Promise<{
  firmEntityId: string | null;
  currencyCode: string;
}> {
  const db = getDb();
  const scope = await getEntityScope();
  if (scope) {
    const [office] = await db
      .select({ id: schema.offices.id, currencyCode: schema.offices.currencyCode })
      .from(schema.offices)
      .where(eq(schema.offices.id, scope))
      .limit(1);
    if (office) {
      return { firmEntityId: office.id, currencyCode: office.currencyCode };
    }
  }
  const [first] = await db
    .select({ id: schema.offices.id, currencyCode: schema.offices.currencyCode })
    .from(schema.offices)
    .where(eq(schema.offices.isActive, true))
    .orderBy(schema.offices.code)
    .limit(1);
  return {
    firmEntityId: first?.id ?? null,
    currencyCode: first?.currencyCode ?? "USD",
  };
}

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
  // Templates have their own "TPL-XXXXXX" sequence and must not bump the
  // "JE-XXXXXX" counter; exclude them here.
  const [row] = await db
    .select({ entryNumber: schema.journalEntries.entryNumber })
    .from(schema.journalEntries)
    .where(eq(schema.journalEntries.isTemplate, false))
    .orderBy(desc(schema.journalEntries.entryNumber))
    .limit(1);
  const n = parseTrailingInt(row?.entryNumber) + 1;
  return `JE-${pad(n, 6)}`;
}

export async function nextTemplateNumber(): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ entryNumber: schema.journalEntries.entryNumber })
    .from(schema.journalEntries)
    .where(eq(schema.journalEntries.isTemplate, true))
    .orderBy(desc(schema.journalEntries.entryNumber))
    .limit(1);
  const n = parseTrailingInt(row?.entryNumber) + 1;
  return `TPL-${pad(n, 6)}`;
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
  /** Dimension map: { [dimension.key]: dimension_value.id }. Defaults to {}. */
  dimensions?: Record<string, string>;
  /** If set, marks this line as an intercompany leg; FK → offices.id. */
  intercompanyCounterpartEntityId?: string | null;
};

export type CreateJournalEntryInput = {
  entryDate: string;
  description: string;
  reference?: string | null;
  source?: "manual" | "invoice" | "bill" | "reconciliation";
  fiscalPeriodId?: string | null;
  /** Legacy: client-entity tag. Reserved; not used for scoping. */
  entityId?: string | null;
  /** Which firm corporate entity issued this entry (drives the topbar scope). */
  firmEntityId?: string | null;
  status?: "draft" | "posted" | "template";
  /** User confirmed past an AR/AP/Cash direct-posting warning. */
  bypassControlWarning?: boolean;
  /**
   * If the entry date falls inside a soft-closed accounting period, this
   * reason is required and stored alongside the entry for audit.
   */
  periodOverrideReason?: string | null;
  /** When set, this JE is an elimination entry (consolidation adjustment). */
  eliminationEntryId?: string | null;
  lines: DraftJournalLine[];
  /** When true, persisted as a recurring template (status forced to "template"). */
  isTemplate?: boolean;
  recurringFrequency?: RecurringFrequency | null;
  recurringDayOfMonth?: number | null;
  recurringNextDate?: string | null;
  recurringEndDate?: string | null;
  recurringParentId?: string | null;
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

  const isTemplate = input.isTemplate === true;
  if (isTemplate) {
    if (!input.recurringFrequency) {
      throw new Error("Recurring frequency is required for a template.");
    }
    if (!input.recurringNextDate) {
      throw new Error("Recurring start date is required for a template.");
    }
  }

  const db = getDb();
  const id = uid("j");
  const entryNumber = isTemplate
    ? await nextTemplateNumber()
    : await nextEntryNumber();
  const status = isTemplate ? "template" : input.status ?? "draft";
  const now = new Date();

  // Period close enforcement (see src/lib/periods.ts). Locked periods always
  // block; closed periods require an override reason. Applied to drafts too
  // so the warning fires at the same moment as on the form. Templates skip
  // this because they never hit the ledger themselves — the generated drafts
  // will be checked when the user posts them.
  const result = isTemplate
    ? { overrideRecorded: null }
    : await checkPeriodForPost(
        input.entryDate,
        input.periodOverrideReason,
      );
  const overrideRecorded = result.overrideRecorded;

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
      entityId: input.entityId ?? null,
      firmEntityId: input.firmEntityId ?? null,
      bypassControlWarning: input.bypassControlWarning ?? false,
      periodOverrideReason: overrideRecorded,
      eliminationEntryId: input.eliminationEntryId ?? null,
      isTemplate,
      recurringFrequency: isTemplate ? input.recurringFrequency ?? null : null,
      recurringDayOfMonth: isTemplate ? input.recurringDayOfMonth ?? null : null,
      recurringNextDate: isTemplate ? input.recurringNextDate ?? null : null,
      recurringEndDate: isTemplate ? input.recurringEndDate ?? null : null,
      recurringParentId: input.recurringParentId ?? null,
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
        entityId: input.entityId ?? null,
        firmEntityId: input.firmEntityId ?? null,
        intercompanyCounterpartEntityId:
          l.intercompanyCounterpartEntityId ?? null,
        dimensions: l.dimensions ?? {},
      })),
    );
  });

  const created = await getJournalEntryById(id);
  if (!created) throw new Error("Created entry not found after insert.");
  return created;
}

/**
 * Advance a yyyy-mm-dd date by one recurring step. Day-of-month clamps to
 * the last day of the target month (Feb only has 28/29 days; templates with
 * day=31 would otherwise overflow into March). The 1-28 limit on
 * `recurringDayOfMonth` already keeps the inputs safe, but the clamp keeps
 * us defensive for legacy or hand-edited rows.
 */
export function advanceRecurringDate(
  iso: string,
  frequency: RecurringFrequency,
  dayOfMonth?: number | null,
): string {
  const [yStr, mStr, dStr] = iso.split("-");
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10);
  let monthsToAdd = 0;
  switch (frequency) {
    case "monthly":
      monthsToAdd = 1;
      break;
    case "quarterly":
      monthsToAdd = 3;
      break;
    case "annually":
      monthsToAdd = 12;
      break;
    case "custom":
      monthsToAdd = 1;
      break;
  }
  m += monthsToAdd;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  const desiredDay = dayOfMonth ?? parseInt(dStr, 10);
  const lastDayOfMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d = Math.min(desiredDay, lastDayOfMonth);
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

/**
 * Generate the next draft journal entry from a recurring template, then
 * advance the template's `recurringNextDate`. The new entry copies header
 * fields and lines verbatim, is dated `recurringNextDate`, and starts as
 * status="draft" so the user can review before posting. Returns the new
 * entry's id + entryNumber for redirecting.
 */
export async function generateNextRecurringEntry(
  user: SessionUser,
  templateId: string,
): Promise<{ id: string; entryNumber: string }> {
  const db = getDb();
  const [tpl] = await db
    .select()
    .from(schema.journalEntries)
    .where(eq(schema.journalEntries.id, templateId))
    .limit(1);
  if (!tpl) throw new Error("Template not found.");
  if (!tpl.isTemplate) throw new Error("Source entry is not a template.");
  if (!tpl.recurringFrequency || !tpl.recurringNextDate) {
    throw new Error("Template is missing a frequency or next date.");
  }
  if (
    tpl.recurringEndDate &&
    tpl.recurringNextDate > tpl.recurringEndDate
  ) {
    throw new Error("Template has reached its end date.");
  }

  const tplLines = await db
    .select()
    .from(schema.journalLines)
    .where(eq(schema.journalLines.journalEntryId, templateId))
    .orderBy(schema.journalLines.lineNumber);
  if (tplLines.length < 2) {
    throw new Error("Template must have at least 2 lines.");
  }

  const id = uid("j");
  const entryNumber = await nextEntryNumber();
  const now = new Date();
  const entryDate = tpl.recurringNextDate;
  const frequency = tpl.recurringFrequency as RecurringFrequency;
  const nextDate = advanceRecurringDate(
    entryDate,
    frequency,
    tpl.recurringDayOfMonth ?? null,
  );

  await db.transaction(async (tx) => {
    await tx.insert(schema.journalEntries).values({
      id,
      entryNumber,
      entryDate,
      fiscalPeriodId: tpl.fiscalPeriodId,
      description: tpl.description,
      reference: tpl.reference,
      source: tpl.source,
      status: "draft",
      postedAt: null,
      postedBy: null,
      voidedAt: null,
      voidReason: null,
      createdBy: user.userId,
      entityId: tpl.entityId,
      firmEntityId: tpl.firmEntityId,
      isTemplate: false,
      recurringParentId: tpl.id,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(schema.journalLines).values(
      tplLines.map((l, i) => ({
        id: `${id}-l${i + 1}`,
        journalEntryId: id,
        lineNumber: i + 1,
        accountId: l.accountId,
        description: l.description,
        debit: l.debit,
        credit: l.credit,
        entityId: l.entityId,
        firmEntityId: l.firmEntityId,
        dimensions: l.dimensions,
        createdAt: now,
      })),
    );
    await tx
      .update(schema.journalEntries)
      .set({ recurringNextDate: nextDate, updatedAt: now })
      .where(eq(schema.journalEntries.id, templateId));
  });

  return { id, entryNumber };
}

export async function postJournalEntry(
  user: SessionUser,
  entryId: string,
  options: { periodOverrideReason?: string | null } = {},
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

  // New monthly-period enforcement (see src/lib/periods.ts).
  const periodCheck = await checkPeriodForPost(
    entry.entryDate,
    options.periodOverrideReason,
  );

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
      periodOverrideReason:
        periodCheck.overrideRecorded ?? entry.periodOverrideReason ?? null,
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
      // Exclude templates from the lookup — they live in the parallel
      // "TPL-XXXXXX" sequence and would otherwise sort above "JE-".
      const [maxRow] = await tx
        .select({ entryNumber: schema.journalEntries.entryNumber })
        .from(schema.journalEntries)
        .where(eq(schema.journalEntries.isTemplate, false))
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

// --------- Intercompany eliminations ---------

/**
 * Generate an elimination JE that zeroes out the open intercompany balance
 * between two firm entities. We pull every non-eliminated IC line on
 * posted JEs between (entityA, entityB) — in either direction — and
 * produce a single JE with the reverse debit/credit on each account
 * involved.
 *
 * The new JE is marked with `eliminationEntryId` (pointer to the first
 * source IC JE), `firmEntityId = null` so it's a firm-level adjustment,
 * and `status = "posted"` so it lands on the firm-level consolidated view
 * immediately. Per the elimination filter on report queries, it is
 * EXCLUDED from any single-entity scoped view.
 *
 * Throws if there is nothing to eliminate.
 */
export async function generateIntercompanyElimination(
  user: SessionUser,
  entityAId: string,
  entityBId: string,
): Promise<JournalEntry> {
  if (entityAId === entityBId) {
    throw new Error("Pick two distinct firm entities.");
  }
  const db = getDb();

  // Pull every non-eliminated IC line between the two entities, in either
  // direction. The from-side comes from journalEntries.firmEntityId; the
  // to-side comes from journalLines.intercompanyCounterpartEntityId.
  const rows = await db
    .select({
      entryId: schema.journalEntries.id,
      lineId: schema.journalLines.id,
      fromEntityId: schema.journalEntries.firmEntityId,
      toEntityId: schema.journalLines.intercompanyCounterpartEntityId,
      accountId: schema.journalLines.accountId,
      debit: schema.journalLines.debit,
      credit: schema.journalLines.credit,
    })
    .from(schema.journalLines)
    .innerJoin(
      schema.journalEntries,
      eq(schema.journalLines.journalEntryId, schema.journalEntries.id),
    )
    .where(
      and(
        eq(schema.journalEntries.status, "posted"),
        isNull(schema.journalEntries.eliminationEntryId),
        or(
          and(
            eq(schema.journalEntries.firmEntityId, entityAId),
            eq(
              schema.journalLines.intercompanyCounterpartEntityId,
              entityBId,
            ),
          ),
          and(
            eq(schema.journalEntries.firmEntityId, entityBId),
            eq(
              schema.journalLines.intercompanyCounterpartEntityId,
              entityAId,
            ),
          ),
        ),
      ),
    );

  if (rows.length === 0) {
    throw new Error("No open intercompany balance between this pair.");
  }

  // Net per account. We post the REVERSE of each side's accumulated net.
  const netByAccount = new Map<string, number>();
  for (const r of rows) {
    const n = parseAmount(r.debit) - parseAmount(r.credit);
    netByAccount.set(r.accountId, (netByAccount.get(r.accountId) ?? 0) + n);
  }
  const eliminationLines: DraftJournalLine[] = [];
  for (const [accountId, net] of netByAccount.entries()) {
    if (Math.abs(net) < 0.005) continue;
    // Reverse sign — debit balance → post credit; credit balance → post debit.
    if (net > 0) {
      eliminationLines.push({ accountId, debit: 0, credit: net });
    } else {
      eliminationLines.push({ accountId, debit: -net, credit: 0 });
    }
  }
  if (eliminationLines.length < 2) {
    // Already net zero — nothing to eliminate.
    throw new Error("Intercompany balance is already zero for this pair.");
  }
  // Sanity: ensure overall balance — should already be balanced since the
  // underlying postings were each balanced and we're just reversing nets.
  const dt = eliminationLines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const ct = eliminationLines.reduce((s, l) => s + (l.credit ?? 0), 0);
  if (Math.abs(dt - ct) > 0.005) {
    throw new Error(
      `Computed elimination is unbalanced: ${dt.toFixed(2)} vs ${ct.toFixed(2)}.`,
    );
  }

  // Reference one source IC JE so eliminationEntryId has a meaningful FK.
  const sourceEntryId = rows[0].entryId;

  return createJournalEntry(user, {
    entryDate: new Date().toISOString().slice(0, 10),
    description: `Intercompany elimination · ${entityAId} ↔ ${entityBId}`,
    source: "manual",
    firmEntityId: null,
    status: "posted",
    eliminationEntryId: sourceEntryId,
    lines: eliminationLines,
  });
}

// --------- Attachments + activity log ---------

export async function logActivity(
  user: SessionUser,
  input: {
    action: string;
    tableName: string;
    recordId: string;
    before?: unknown;
    after?: unknown;
    diff?: unknown;
  },
) {
  const db = getDb();
  await db.insert(schema.activityLog).values({
    id: uid("al"),
    actorUserId: user.userId,
    action: input.action,
    tableName: input.tableName,
    recordId: input.recordId,
    before: input.before ?? null,
    after: input.after ?? null,
    diff: input.diff ?? null,
  });
}

export async function createAttachment(
  user: SessionUser,
  input: {
    recordType:
      | "journal_entry"
      | "invoice"
      | "bill"
      | "contact"
      | "entity"
      | "asset"
      | "bank_account"
      | "fee"
      | "time_entry"
      | "other";
    recordId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    fileUrl: string;
    blobPathname?: string | null;
    notes?: string | null;
    documentType?: string | null;
  },
) {
  const db = getDb();
  const id = uid("att");
  const [created] = await db
    .insert(schema.attachments)
    .values({
      id,
      recordType: input.recordType,
      recordId: input.recordId,
      fileName: input.fileName,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      fileUrl: input.fileUrl,
      blobPathname: input.blobPathname ?? null,
      uploadedBy: user.userId,
      notes: input.notes ?? null,
      documentType: input.documentType ?? null,
    })
    .returning();
  await logActivity(user, {
    action: "attachment.upload",
    tableName: "attachments",
    recordId: id,
    after: {
      recordType: input.recordType,
      recordId: input.recordId,
      fileName: input.fileName,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
    },
  });
  return created;
}

export async function deleteAttachment(user: SessionUser, id: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.attachments)
    .where(eq(schema.attachments.id, id))
    .limit(1);
  if (!row) return;
  await db.delete(schema.attachments).where(eq(schema.attachments.id, id));
  await logActivity(user, {
    action: "attachment.delete",
    tableName: "attachments",
    recordId: id,
    before: {
      recordType: row.recordType,
      recordId: row.recordId,
      fileName: row.fileName,
      fileUrl: row.fileUrl,
      blobPathname: row.blobPathname,
    },
  });
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
  registrationNumber?: string | null;
  notes?: string | null;
  currencyCode?: string;
  regionId?: string | null;
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
      registrationNumber: input.registrationNumber ?? null,
      notes: input.notes ?? null,
      currencyCode: input.currencyCode ?? "USD",
      regionId: input.regionId ?? null,
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
      ...(input.registrationNumber !== undefined && { registrationNumber: input.registrationNumber }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.currencyCode !== undefined && { currencyCode: input.currencyCode }),
      ...(input.regionId !== undefined && { regionId: input.regionId }),
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
  /** Raw OCR text indexed by global search. */
  ocrText?: string | null;
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
      ocrText: input.ocrText ?? null,
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
    invoiceNumberPrefix?: string | null;
    invoiceNumberPattern?: string | null;
    invoiceNumberLastUsed?: string | null;
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
      invoiceNumberPrefix: input.invoiceNumberPrefix ?? null,
      invoiceNumberPattern: input.invoiceNumberPattern ?? null,
      invoiceNumberLastUsed: input.invoiceNumberLastUsed ?? null,
    })
    .returning();
  return created;
}

export async function updateVendorInvoiceNumberRule(
  _user: SessionUser,
  vendorId: string,
  rule: {
    invoiceNumberPrefix?: string | null;
    invoiceNumberPattern?: string | null;
    invoiceNumberLastUsed?: string | null;
  },
) {
  const db = getDb();
  await db
    .update(schema.vendors)
    .set({
      invoiceNumberPrefix: rule.invoiceNumberPrefix ?? null,
      invoiceNumberPattern: rule.invoiceNumberPattern ?? null,
      invoiceNumberLastUsed: rule.invoiceNumberLastUsed ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.vendors.id, vendorId));
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
  // Mirror to customer_assignments: clear all then re-insert one row marked primary.
  await db.delete(schema.customerAssignments).where(eq(schema.customerAssignments.customerId, customerId));
  if (assignedUserId) {
    await db.insert(schema.customerAssignments).values({
      id: uid("ca"),
      customerId,
      userId: assignedUserId,
      isPrimary: true,
      canApprove: true,
      role: null,
    });
  }
}

export async function addCustomerAssignment(
  _user: SessionUser,
  input: { customerId: string; userId: string; isPrimary?: boolean; canApprove?: boolean; role?: string | null },
) {
  const db = getDb();
  // Unique (customerId, userId) — bail if it already exists.
  const existing = await db
    .select({ id: schema.customerAssignments.id })
    .from(schema.customerAssignments)
    .where(
      and(
        eq(schema.customerAssignments.customerId, input.customerId),
        eq(schema.customerAssignments.userId, input.userId),
      ),
    );
  if (existing.length > 0) {
    throw new Error("That employee is already assigned to this client.");
  }
  const id = uid("ca");
  // If this is being marked as primary, clear other primaries.
  if (input.isPrimary) {
    await db
      .update(schema.customerAssignments)
      .set({ isPrimary: false })
      .where(eq(schema.customerAssignments.customerId, input.customerId));
  }
  await db.insert(schema.customerAssignments).values({
    id,
    customerId: input.customerId,
    userId: input.userId,
    isPrimary: input.isPrimary ?? false,
    canApprove: input.canApprove ?? true,
    role: input.role ?? null,
  });
  // Keep the legacy customers.assigned_user_id in sync with whoever is primary.
  const [primary] = await db
    .select()
    .from(schema.customerAssignments)
    .where(
      and(
        eq(schema.customerAssignments.customerId, input.customerId),
        eq(schema.customerAssignments.isPrimary, true),
      ),
    )
    .limit(1);
  await db
    .update(schema.customers)
    .set({ assignedUserId: primary?.userId ?? null, updatedAt: new Date() })
    .where(eq(schema.customers.id, input.customerId));
}

export async function removeCustomerAssignment(
  _user: SessionUser,
  assignmentId: string,
) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.customerAssignments)
    .where(eq(schema.customerAssignments.id, assignmentId))
    .limit(1);
  if (!row) return;
  await db.delete(schema.customerAssignments).where(eq(schema.customerAssignments.id, assignmentId));
  // Re-sync the legacy single-assign column.
  const [primary] = await db
    .select()
    .from(schema.customerAssignments)
    .where(
      and(
        eq(schema.customerAssignments.customerId, row.customerId),
        eq(schema.customerAssignments.isPrimary, true),
      ),
    )
    .limit(1);
  await db
    .update(schema.customers)
    .set({ assignedUserId: primary?.userId ?? null, updatedAt: new Date() })
    .where(eq(schema.customers.id, row.customerId));
}

// --------- Invoices (with auto-JE on post + payment) ---------

const AR_ACCOUNT_ID = "a-1200";
const AP_ACCOUNT_ID = "a-2000";
/** Sales / VAT tax credited when an invoice with tax > 0 is posted. */
const SALES_TAX_PAYABLE_ACCOUNT_ID = "a-2200";
const DEFAULT_CASH_ACCOUNT_ID = "a-1000";
const SERVICE_REVENUE_ACCOUNT_ID = "a-4000";

export type DraftInvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  accountId: string;
  /** Dimension map: { [dimension.key]: dimension_value.id }. Defaults to {}. */
  dimensions?: Record<string, string>;
};

export type CreateInvoiceInput = {
  customerId: string;
  invoiceDate: string;
  dueDate: string;
  notes?: string | null;
  /** Raw OCR text indexed by global search. */
  ocrText?: string | null;
  /** Required when the invoice date falls inside a soft-closed period. */
  periodOverrideReason?: string | null;
  /** Optional tax rate override (decimal, 0.0875 = 8.75%). When omitted
   *  we snapshot the customer's default. */
  taxRate?: number | null;
  /** Optional tax exemption override. Snapshots from customer when omitted. */
  taxExempt?: boolean;
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

  // Period close enforcement on the invoice date (see src/lib/periods.ts).
  const periodCheck = await checkPeriodForPost(
    input.invoiceDate,
    input.periodOverrideReason,
  );

  const db = getDb();
  const id = uid("i");
  const invoiceNumber = await nextInvoiceNumber();
  const subtotal = input.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const now = new Date();
  // Inherit currency + firm from the active entity scope. This way an invoice
  // drafted under a non-USD scope (e.g. Europe SARL) gets the right ccy
  // straight away rather than always defaulting to USD.
  const { firmEntityId, currencyCode } = await getFirmIssuingCurrency();

  // Tax: pull customer defaults, allow per-invoice override, snapshot
  // both rate + exempt onto the invoice row so historical totals stay
  // stable when the customer's default later changes.
  const [cust] = await db
    .select({
      taxRate: schema.customers.taxRate,
      taxExempt: schema.customers.taxExempt,
    })
    .from(schema.customers)
    .where(eq(schema.customers.id, input.customerId))
    .limit(1);
  const taxRate =
    input.taxRate != null
      ? Math.max(0, input.taxRate)
      : parseFloat(cust?.taxRate ?? "0") || 0;
  const taxExempt = input.taxExempt ?? !!cust?.taxExempt;
  const taxAmount =
    taxExempt || taxRate === 0
      ? 0
      : Math.round(subtotal * taxRate * 100) / 100;
  const total = subtotal + taxAmount;

  await db.transaction(async (tx) => {
    await tx.insert(schema.invoices).values({
      id,
      invoiceNumber,
      customerId: input.customerId,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      status: "draft",
      subtotal: toDecimalString(subtotal),
      taxRate: taxRate.toFixed(5),
      taxExempt,
      taxAmount: toDecimalString(taxAmount),
      total: toDecimalString(total),
      amountPaid: "0.00",
      balanceDue: toDecimalString(total),
      currencyCode,
      firmEntityId,
      notes: input.notes ?? null,
      ocrText: input.ocrText ?? null,
      periodOverrideReason: periodCheck.overrideRecorded,
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
        dimensions: l.dimensions ?? {},
        createdAt: now,
      })),
    );
  });
  return { id, invoiceNumber };
}

/**
 * Look up the customer's primary entity. Used by postInvoice and
 * recordInvoicePayment to attribute generated JEs to the right entity
 * so the multi-entity scope picker shows real per-entity numbers.
 */
async function getPrimaryEntityForCustomer(customerId: string): Promise<string | null> {
  const db = getDb();
  // Prefer the entity stored on the invoice if any; otherwise fall back to
  // the customer's first entity (entities.clientId = customer.id in our seed).
  const [ent] = await db
    .select({ id: schema.entities.id })
    .from(schema.entities)
    .where(eq(schema.entities.clientId, customerId))
    .orderBy(schema.entities.code)
    .limit(1);
  return ent?.id ?? null;
}

/**
 * Default firm corporate entity used when an invoice doesn't already have
 * one set. Picks the first active office by code so the seed's US LLC
 * comes up first.
 */
async function getDefaultFirmEntityId(): Promise<string | null> {
  const db = getDb();
  const [first] = await db
    .select({ id: schema.offices.id })
    .from(schema.offices)
    .where(eq(schema.offices.isActive, true))
    .orderBy(schema.offices.code)
    .limit(1);
  return first?.id ?? null;
}

export async function postInvoice(
  user: SessionUser,
  invoiceId: string,
  options: { periodOverrideReason?: string | null } = {},
) {
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

  // Use the persisted totals so the JE matches whatever the invoice
  // table says (including tax). Falls back to summing lines for legacy
  // rows where total wasn't persisted yet.
  const subtotal =
    parseFloat(inv.subtotal) ||
    lines.reduce((s, l) => s + parseFloat(l.amount), 0);
  const taxAmount = parseFloat(inv.taxAmount) || 0;
  const total = parseFloat(inv.total) || subtotal + taxAmount;
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
  // Tax credit balances the AR debit that includes tax. Only add the
  // Tax Payable leg when there's actually tax — keeps zero-tax JEs
  // unchanged from the old behavior.
  if (taxAmount > 0) {
    jeLines.push({
      accountId: SALES_TAX_PAYABLE_ACCOUNT_ID,
      description: `Sales tax — ${inv.invoiceNumber}`,
      debit: 0,
      credit: taxAmount,
    });
  }

  const entityId =
    inv.entityId ?? (await getPrimaryEntityForCustomer(inv.customerId));
  // Firm scope: which of OUR corporate entities issued this invoice.
  // Default to the firm that's already on the invoice (set at create
  // time / by /invoices/generate), or fall back to the primary US LLC.
  const firmEntityId = inv.firmEntityId ?? (await getDefaultFirmEntityId());

  // Bubble through any override the invoice already recorded at create time
  // so the caller doesn't have to re-supply it, plus accept a fresh reason
  // from `options`.
  const periodOverrideReason =
    options.periodOverrideReason ?? inv.periodOverrideReason ?? null;

  const je = await createJournalEntry(user, {
    entryDate: inv.invoiceDate,
    description: `Service invoice issued (${inv.invoiceNumber})`,
    reference: inv.invoiceNumber,
    source: "invoice",
    status: "posted",
    entityId,
    firmEntityId,
    periodOverrideReason,
    lines: jeLines,
  });

  await db
    .update(schema.invoices)
    .set({
      status: "sent",
      journalEntryId: je.id,
      entityId,
      firmEntityId,
      periodOverrideReason: periodOverrideReason ?? inv.periodOverrideReason,
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

  const entityId =
    inv.entityId ?? (await getPrimaryEntityForCustomer(inv.customerId));
  const firmEntityId = inv.firmEntityId ?? (await getDefaultFirmEntityId());

  const je = await createJournalEntry(user, {
    entryDate: input.paymentDate,
    description: `Payment received (${inv.invoiceNumber})`,
    reference: input.reference ?? inv.invoiceNumber,
    source: "invoice",
    status: "posted",
    entityId,
    firmEntityId,
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
  // Accept either a row in customer_assignments OR the legacy single
  // assigned_user_id column. Either way the client needs at least one
  // assigned employee before CFO approval can proceed (so there's
  // someone to do the final step).
  const assignmentRows = await db
    .select({ userId: schema.customerAssignments.userId })
    .from(schema.customerAssignments)
    .where(eq(schema.customerAssignments.customerId, inv.customerId));
  const [cust] = await db
    .select({ assignedUserId: schema.customers.assignedUserId })
    .from(schema.customers)
    .where(eq(schema.customers.id, inv.customerId))
    .limit(1);
  if (assignmentRows.length === 0 && !cust?.assignedUserId) {
    throw new Error(
      "Client has no assigned employee. Assign one on the client detail page before approving.",
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
  // Check the assignments table first (multi-assign), fall back to the
  // legacy single column. Anyone marked can_approve OR the legacy assignee
  // (OR an Admin) can grant the final approval.
  const assignments = await db
    .select({
      userId: schema.customerAssignments.userId,
      canApprove: schema.customerAssignments.canApprove,
    })
    .from(schema.customerAssignments)
    .where(eq(schema.customerAssignments.customerId, inv.customerId));
  const [cust] = await db
    .select({ assignedUserId: schema.customers.assignedUserId })
    .from(schema.customers)
    .where(eq(schema.customers.id, inv.customerId))
    .limit(1);

  const approverIds = new Set<string>(
    assignments.filter((a) => a.canApprove).map((a) => a.userId),
  );
  if (cust?.assignedUserId) approverIds.add(cust.assignedUserId);

  if (approverIds.size === 0) {
    throw new Error("Client has no assigned employee.");
  }
  if (!approverIds.has(user.userId) && !user.isSuperuser) {
    throw new Error(
      "Only an assigned employee (or an Admin) can grant the final approval.",
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
  /** Optional per-line client/entity allocation (inherits header default). */
  clientId?: string | null;
  entityId?: string | null;
  /** Dimension map: { [dimension.key]: dimension_value.id }. Defaults to {}. */
  dimensions?: Record<string, string>;
};

export type CreateBillInput = {
  vendorId: string;
  billDate: string;
  dueDate: string;
  reference?: string | null;
  /**
   * The vendor's own invoice number — informational, separate from our
   * internal bill_number. When set we also bump the vendor's
   * invoice_number_last_used so future suggestions roll forward.
   */
  vendorInvoiceNumber?: string | null;
  notes?: string | null;
  /** Who the bill is on-behalf-of (separate from chargeback rebill target). */
  clientId?: string | null;
  entityId?: string | null;
  /** Raw OCR text indexed by global search. */
  ocrText?: string | null;
  /** Required when the bill date falls inside a soft-closed period. */
  periodOverrideReason?: string | null;
  lines: DraftBillLine[];
  // Optional chargeback config — if `chargebackType` is set the bill is
  // marked as rebillable. "included" means just reference the client/entity
  // (no rebill is generated); "cost", "markup", "fixed" produce a future
  // invoice via `generateChargebackInvoice`.
  chargebackClientId?: string | null;
  chargebackEntityId?: string | null;
  chargebackType?: "cost" | "markup" | "fixed" | "included" | null;
  markupPct?: number | null;
  rebillAmount?: number | null;
  chargebackNotes?: string | null;
};

export async function createBill(_user: SessionUser, input: CreateBillInput) {
  if (input.lines.length === 0) throw new Error("Bill must have at least 1 line.");
  for (const [i, l] of input.lines.entries()) {
    if (!l.accountId) throw new Error(`Line ${i + 1}: account is required.`);
    if (l.quantity <= 0) throw new Error(`Line ${i + 1}: quantity must be > 0.`);
    if (l.unitPrice < 0) throw new Error(`Line ${i + 1}: unit price must be >= 0.`);
    if (!l.description.trim()) throw new Error(`Line ${i + 1}: description is required.`);
  }

  // Period close enforcement on the bill date.
  const periodCheck = await checkPeriodForPost(
    input.billDate,
    input.periodOverrideReason,
  );

  const db = getDb();
  const id = uid("b");
  const billNumber = input.reference?.trim() || (await nextBillNumber());
  const subtotal = input.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const now = new Date();
  // Same firm-derived currency rule as invoices — a bill recorded under a
  // non-USD scope picks up that firm's ccy.
  const { currencyCode } = await getFirmIssuingCurrency();

  const vendorInvoiceNumber =
    input.vendorInvoiceNumber?.trim() ? input.vendorInvoiceNumber.trim() : null;

  await db.transaction(async (tx) => {
    await tx.insert(schema.bills).values({
      id,
      billNumber,
      vendorId: input.vendorId,
      vendorInvoiceNumber,
      billDate: input.billDate,
      dueDate: input.dueDate,
      status: "draft",
      subtotal: toDecimalString(subtotal),
      taxAmount: "0.00",
      total: toDecimalString(subtotal),
      amountPaid: "0.00",
      balanceDue: toDecimalString(subtotal),
      currencyCode,
      notes: input.notes ?? null,
      ocrText: input.ocrText ?? null,
      periodOverrideReason: periodCheck.overrideRecorded,
      journalEntryId: null,
      clientId: input.clientId ?? null,
      entityId: input.entityId ?? null,
      chargebackClientId: input.chargebackClientId ?? null,
      chargebackEntityId: input.chargebackEntityId ?? null,
      chargebackType: input.chargebackType ?? null,
      markupPct:
        input.markupPct != null ? input.markupPct.toFixed(4) : null,
      rebillAmount:
        input.rebillAmount != null ? toDecimalString(input.rebillAmount) : null,
      chargebackNotes: input.chargebackNotes ?? null,
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
        clientId: l.clientId ?? input.clientId ?? null,
        entityId: l.entityId ?? input.entityId ?? null,
        dimensions: l.dimensions ?? {},
        createdAt: now,
      })),
    );
    if (vendorInvoiceNumber) {
      await tx
        .update(schema.vendors)
        .set({
          invoiceNumberLastUsed: vendorInvoiceNumber,
          updatedAt: now,
        })
        .where(eq(schema.vendors.id, input.vendorId));
    }
  });
  return { id, billNumber };
}

export async function approveBill(
  user: SessionUser,
  billId: string,
  options: { periodOverrideReason?: string | null } = {},
) {
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

  // Attribute the JE to the firm that's currently scoped (or the default
  // active firm) so bills show up in scoped views just like invoices do.
  const { firmEntityId } = await getFirmIssuingCurrency();

  // Carry through any reason recorded at create time so the user isn't
  // re-prompted at approval, plus accept a fresh one from `options`.
  const periodOverrideReason =
    options.periodOverrideReason ?? bill.periodOverrideReason ?? null;

  const je = await createJournalEntry(user, {
    entryDate: bill.billDate,
    description: `Bill approved (${bill.billNumber})`,
    reference: bill.billNumber,
    source: "bill",
    status: "posted",
    firmEntityId,
    periodOverrideReason,
    lines: jeLines,
  });

  await db
    .update(schema.bills)
    .set({
      status: "approved",
      journalEntryId: je.id,
      periodOverrideReason: periodOverrideReason ?? bill.periodOverrideReason,
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

  const { firmEntityId } = await getFirmIssuingCurrency();
  const je = await createJournalEntry(user, {
    entryDate: input.paymentDate,
    description: `Payment sent (${bill.billNumber})`,
    reference: input.reference ?? bill.billNumber,
    source: "bill",
    status: "posted",
    firmEntityId,
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

// --------- Bill chargeback (rebill to client / entity) ---------

export type SetBillChargebackInput = {
  billId: string;
  clientId?: string | null;
  entityId?: string | null;
  type: "cost" | "markup" | "fixed" | "included" | null;
  markupPct?: number | null;
  rebillAmount?: number | null;
  notes?: string | null;
};

/**
 * Configure (or clear) the chargeback on a bill.
 *
 *  - `type === null` clears the chargeback entirely.
 *  - `cost` = rebill at bill total, no markup.
 *  - `markup` = bill total × (1 + markupPct).
 *  - `fixed` = override with a fixed rebill amount.
 *  - `included` = reference only; bill is covered by an annual fee, no
 *    new invoice will ever be generated.
 *
 * Once a chargeback invoice has been generated this mutation refuses to
 * change anything — clear it through the invoice instead.
 */
export async function setBillChargeback(
  _user: SessionUser,
  input: SetBillChargebackInput,
) {
  const db = getDb();
  const [bill] = await db
    .select()
    .from(schema.bills)
    .where(eq(schema.bills.id, input.billId))
    .limit(1);
  if (!bill) throw new Error("Bill not found.");
  if (bill.chargebackInvoiceId) {
    throw new Error(
      "This bill has already been billed back. Void the chargeback invoice to change it.",
    );
  }

  if (input.type === null) {
    await db
      .update(schema.bills)
      .set({
        chargebackClientId: null,
        chargebackEntityId: null,
        chargebackType: null,
        markupPct: null,
        rebillAmount: null,
        chargebackNotes: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.bills.id, input.billId));
    return;
  }

  if (!input.clientId && !input.entityId) {
    throw new Error("Chargeback needs a client or entity recipient.");
  }
  if (input.type === "markup" && (input.markupPct == null || input.markupPct < 0)) {
    throw new Error("Markup % is required.");
  }
  if (input.type === "fixed" && (input.rebillAmount == null || input.rebillAmount < 0)) {
    throw new Error("Fixed rebill amount is required.");
  }

  await db
    .update(schema.bills)
    .set({
      chargebackClientId: input.clientId ?? null,
      chargebackEntityId: input.entityId ?? null,
      chargebackType: input.type,
      markupPct:
        input.type === "markup" && input.markupPct != null
          ? input.markupPct.toFixed(4)
          : null,
      rebillAmount:
        input.type === "fixed" && input.rebillAmount != null
          ? toDecimalString(input.rebillAmount)
          : null,
      chargebackNotes: input.notes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.bills.id, input.billId));
}

/**
 * Compute what each bill in a chargeback batch would rebill at, given its
 * `chargebackType`. Skips bills marked "included" (those reference an
 * annual fee and never get a new invoice).
 */
function computeRebillAmount(bill: {
  total: string;
  chargebackType: string | null;
  markupPct: string | null;
  rebillAmount: string | null;
}): number | null {
  const total = parseFloat(bill.total);
  switch (bill.chargebackType) {
    case "cost":
      return total;
    case "markup": {
      const pct = bill.markupPct ? parseFloat(bill.markupPct) : 0;
      return Math.round(total * (1 + pct) * 100) / 100;
    }
    case "fixed":
      return bill.rebillAmount ? parseFloat(bill.rebillAmount) : null;
    case "included":
      return null;
    default:
      return null;
  }
}

export type GenerateChargebackInvoiceInput = {
  clientId: string;
  billIds: string[];
  invoiceDate?: string; // defaults to today
  dueDate?: string; // defaults to today + 30
  notes?: string | null;
};

/**
 * Roll a batch of rebillable bills (all targeting the same client) into a
 * single new invoice, one line per bill. Marks each bill with the new
 * invoice id so it doesn't get billed back twice.
 */
export async function generateChargebackInvoice(
  user: SessionUser,
  input: GenerateChargebackInvoiceInput,
) {
  if (input.billIds.length === 0) throw new Error("Pick at least one bill.");
  const db = getDb();

  const bills = await db
    .select()
    .from(schema.bills)
    .where(inArray(schema.bills.id, input.billIds));
  if (bills.length !== input.billIds.length) {
    throw new Error("Some bills not found.");
  }

  const lines: DraftInvoiceLine[] = [];
  for (const b of bills) {
    if (b.chargebackInvoiceId) {
      throw new Error(`Bill ${b.billNumber} is already billed back.`);
    }
    if (b.chargebackClientId !== input.clientId) {
      throw new Error(`Bill ${b.billNumber} isn't tagged to this client.`);
    }
    if (b.chargebackType === "included" || b.chargebackType == null) {
      throw new Error(`Bill ${b.billNumber} isn't set to rebill.`);
    }
    const amt = computeRebillAmount(b);
    if (amt == null || amt <= 0) {
      throw new Error(`Bill ${b.billNumber} has no rebillable amount.`);
    }
    lines.push({
      description: `Reimbursable — ${b.billNumber}`,
      quantity: 1,
      unitPrice: amt,
      accountId: SERVICE_REVENUE_ACCOUNT_ID,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const due = (() => {
    if (input.dueDate) return input.dueDate;
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  })();

  const created = await createInvoice(user, {
    customerId: input.clientId,
    invoiceDate: input.invoiceDate ?? today,
    dueDate: due,
    notes:
      input.notes ??
      `Pass-through of ${bills.length} vendor bill${bills.length === 1 ? "" : "s"}.`,
    lines,
  });

  await db
    .update(schema.bills)
    .set({ chargebackInvoiceId: created.id, updatedAt: new Date() })
    .where(inArray(schema.bills.id, input.billIds));

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

// --------- Entity fee billing schedule + recurring payments + invoice expected pay date ---------

export type UpdateEntityFeeBillingInput = {
  frequency?: "monthly" | "quarterly" | "semiannual" | "annual" | "one_time";
  startDate?: string | null;
  endDate?: string | null;
  billingMonth?: number | null;
  billingDay?: number | null;
  nextBillingDate?: string | null;
  perPeriodAmount?: number | null;
  annualFee?: number;
  includedHours?: number;
  status?: "draft" | "active" | "billed" | "paid" | "void";
  notes?: string | null;
};

export async function updateEntityFeeBilling(
  _user: SessionUser,
  id: string,
  input: UpdateEntityFeeBillingInput,
) {
  const db = getDb();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.frequency != null) patch.frequency = input.frequency;
  if (input.startDate !== undefined) patch.startDate = input.startDate;
  if (input.endDate !== undefined) patch.endDate = input.endDate;
  if (input.billingMonth !== undefined) patch.billingMonth = input.billingMonth;
  if (input.billingDay !== undefined) patch.billingDay = input.billingDay;
  if (input.nextBillingDate !== undefined) patch.nextBillingDate = input.nextBillingDate;
  if (input.perPeriodAmount !== undefined)
    patch.perPeriodAmount =
      input.perPeriodAmount == null ? null : toDecimalString(input.perPeriodAmount);
  if (input.annualFee != null) patch.annualFee = toDecimalString(input.annualFee);
  if (input.includedHours != null) patch.includedHours = input.includedHours.toString();
  if (input.status != null) patch.status = input.status;
  if (input.notes !== undefined) patch.notes = input.notes;

  await db
    .update(schema.entityFees)
    .set(patch)
    .where(eq(schema.entityFees.id, id));
}

export type CreateRecurringPaymentInput = {
  name: string;
  amount: number;
  frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "semiannual" | "annual";
  nextPaymentDate: string;
  expenseAccountId: string;
  vendorId?: string | null;
  bankAccountId?: string | null;
  notes?: string | null;
};

export async function createRecurringPayment(
  _user: SessionUser,
  input: CreateRecurringPaymentInput,
) {
  if (input.amount <= 0) throw new Error("Amount must be > 0.");
  if (!input.name.trim()) throw new Error("Name is required.");
  if (!input.expenseAccountId) throw new Error("Expense account is required.");
  const db = getDb();
  const id = uid("rp");
  const now = new Date();
  await db.insert(schema.recurringPayments).values({
    id,
    name: input.name,
    amount: toDecimalString(input.amount),
    frequency: input.frequency,
    nextPaymentDate: input.nextPaymentDate,
    expenseAccountId: input.expenseAccountId,
    vendorId: input.vendorId ?? null,
    bankAccountId: input.bankAccountId ?? null,
    isActive: true,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return { id };
}

export type UpdateRecurringPaymentInput = Partial<CreateRecurringPaymentInput> & {
  isActive?: boolean;
};

export async function updateRecurringPayment(
  _user: SessionUser,
  id: string,
  input: UpdateRecurringPaymentInput,
) {
  const db = getDb();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name != null) patch.name = input.name;
  if (input.amount != null) patch.amount = toDecimalString(input.amount);
  if (input.frequency != null) patch.frequency = input.frequency;
  if (input.nextPaymentDate != null) patch.nextPaymentDate = input.nextPaymentDate;
  if (input.expenseAccountId != null) patch.expenseAccountId = input.expenseAccountId;
  if (input.vendorId !== undefined) patch.vendorId = input.vendorId;
  if (input.bankAccountId !== undefined) patch.bankAccountId = input.bankAccountId;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.isActive !== undefined) patch.isActive = input.isActive;

  await db
    .update(schema.recurringPayments)
    .set(patch)
    .where(eq(schema.recurringPayments.id, id));
}

export async function deleteRecurringPayment(_user: SessionUser, id: string) {
  const db = getDb();
  await db.delete(schema.recurringPayments).where(eq(schema.recurringPayments.id, id));
}

export async function setInvoiceExpectedPaymentDate(
  _user: SessionUser,
  invoiceId: string,
  expectedPaymentDate: string | null,
) {
  const db = getDb();
  await db
    .update(schema.invoices)
    .set({ expectedPaymentDate, updatedAt: new Date() })
    .where(eq(schema.invoices.id, invoiceId));
}

export async function addInvoiceNote(
  user: SessionUser,
  invoiceId: string,
  note: string,
) {
  const trimmed = note.trim();
  if (trimmed === "") throw new Error("Note cannot be empty.");
  const db = getDb();
  const id = uid("inote");
  await db.insert(schema.invoiceNotes).values({
    id,
    invoiceId,
    note: trimmed,
    authorName: user.fullName,
    authorUserId: user.userId,
  });
  return { id };
}

// --------- Regions + region groups ---------

export type CreateRegionGroupInput = { name: string; notes?: string | null };

export async function createRegionGroup(
  _user: SessionUser,
  input: CreateRegionGroupInput,
) {
  const db = getDb();
  const id = uid("rg");
  await db.insert(schema.regionGroups).values({
    id,
    name: input.name,
    notes: input.notes ?? null,
  });
  return { id };
}

export async function updateRegionGroup(
  _user: SessionUser,
  id: string,
  patch: Partial<CreateRegionGroupInput>,
) {
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.notes !== undefined) set.notes = patch.notes ?? null;
  await db.update(schema.regionGroups).set(set).where(eq(schema.regionGroups.id, id));
}

export async function deleteRegionGroup(_user: SessionUser, id: string) {
  const db = getDb();
  // Detach any regions referencing this group, then delete.
  await db
    .update(schema.regions)
    .set({ groupId: null, updatedAt: new Date() })
    .where(eq(schema.regions.groupId, id));
  await db.delete(schema.regionGroups).where(eq(schema.regionGroups.id, id));
}

export type CreateRegionInput = {
  name: string;
  groupId?: string | null;
  notes?: string | null;
};

export async function createRegion(_user: SessionUser, input: CreateRegionInput) {
  const db = getDb();
  const id = uid("rgn");
  await db.insert(schema.regions).values({
    id,
    name: input.name,
    groupId: input.groupId ?? null,
    notes: input.notes ?? null,
  });
  return { id };
}

export async function updateRegion(
  _user: SessionUser,
  id: string,
  patch: Partial<CreateRegionInput>,
) {
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.groupId !== undefined) set.groupId = patch.groupId ?? null;
  if (patch.notes !== undefined) set.notes = patch.notes ?? null;
  await db.update(schema.regions).set(set).where(eq(schema.regions.id, id));
}

export async function deleteRegion(_user: SessionUser, id: string) {
  const db = getDb();
  // Detach offices, entities, and customers first so we don't leave dangling
  // region_id references behind.
  await db
    .update(schema.offices)
    .set({ regionId: null, updatedAt: new Date() })
    .where(eq(schema.offices.regionId, id));
  await db
    .update(schema.entities)
    .set({ regionId: null, updatedAt: new Date() })
    .where(eq(schema.entities.regionId, id));
  await db
    .update(schema.customers)
    .set({ regionId: null, updatedAt: new Date() })
    .where(eq(schema.customers.regionId, id));
  await db.delete(schema.regions).where(eq(schema.regions.id, id));
}

export async function setOfficeRegion(
  _user: SessionUser,
  officeId: string,
  regionId: string | null,
) {
  const db = getDb();
  await db
    .update(schema.offices)
    .set({ regionId, updatedAt: new Date() })
    .where(eq(schema.offices.id, officeId));
}

export async function setEntityRegion(
  _user: SessionUser,
  entityId: string,
  regionId: string | null,
) {
  const db = getDb();
  await db
    .update(schema.entities)
    .set({ regionId, updatedAt: new Date() })
    .where(eq(schema.entities.id, entityId));
}

export async function setCustomerRegion(
  _user: SessionUser,
  customerId: string,
  regionId: string | null,
) {
  const db = getDb();
  await db
    .update(schema.customers)
    .set({ regionId, updatedAt: new Date() })
    .where(eq(schema.customers.id, customerId));
}

// --------- Dimensions ---------

export type CreateDimensionInput = {
  key: string;
  label: string;
  description?: string | null;
};

export async function createDimension(
  _user: SessionUser,
  input: CreateDimensionInput,
) {
  if (!/^[a-z][a-z0-9_]*$/.test(input.key)) {
    throw new Error("Key must be lowercase, start with a letter, and only contain letters/digits/underscore.");
  }
  const db = getDb();
  const id = uid("dim");
  await db.insert(schema.dimensions).values({
    id,
    key: input.key,
    label: input.label,
    description: input.description ?? null,
  });
  return { id };
}

export async function updateDimension(
  _user: SessionUser,
  id: string,
  patch: Partial<Pick<CreateDimensionInput, "label" | "description"> & { isActive: boolean }>,
) {
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.label !== undefined) set.label = patch.label;
  if (patch.description !== undefined) set.description = patch.description ?? null;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  await db.update(schema.dimensions).set(set).where(eq(schema.dimensions.id, id));
}

export async function deleteDimension(_user: SessionUser, id: string) {
  const db = getDb();
  // Just soft-delete by marking inactive — line.dimensions JSONB references
  // are by key, so the schema integrity is preserved either way. The user
  // can decide to hard-delete via SQL if they really want it gone.
  await db
    .update(schema.dimensions)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(schema.dimensions.id, id));
}

export type CreateDimensionValueInput = {
  dimensionId: string;
  code: string;
  label: string;
  parentId?: string | null;
};

export async function createDimensionValue(
  _user: SessionUser,
  input: CreateDimensionValueInput,
) {
  const db = getDb();
  const id = uid("dv");
  await db.insert(schema.dimensionValues).values({
    id,
    dimensionId: input.dimensionId,
    code: input.code,
    label: input.label,
    parentId: input.parentId ?? null,
  });
  return { id };
}

export async function updateDimensionValue(
  _user: SessionUser,
  id: string,
  patch: Partial<Pick<CreateDimensionValueInput, "code" | "label" | "parentId"> & { isActive: boolean }>,
) {
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.code !== undefined) set.code = patch.code;
  if (patch.label !== undefined) set.label = patch.label;
  if (patch.parentId !== undefined) set.parentId = patch.parentId ?? null;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  await db.update(schema.dimensionValues).set(set).where(eq(schema.dimensionValues.id, id));
}

export async function deleteDimensionValue(_user: SessionUser, id: string) {
  const db = getDb();
  await db
    .update(schema.dimensionValues)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(schema.dimensionValues.id, id));
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

// --------- Duplicate / clone ---------

/**
 * Duplicate a journal entry. The copy is always a fresh draft: status,
 * post/void stamps, journal links, and approval state are dropped. The new
 * entry gets the next sequential entry number and today's date. Returns the
 * created entry's id + entryNumber.
 */
export async function duplicateJournalEntry(
  user: SessionUser,
  sourceId: string,
): Promise<{ id: string; entryNumber: string }> {
  const db = getDb();
  const [src] = await db
    .select()
    .from(schema.journalEntries)
    .where(eq(schema.journalEntries.id, sourceId))
    .limit(1);
  if (!src) throw new Error("Source entry not found.");

  const srcLines = await db
    .select()
    .from(schema.journalLines)
    .where(eq(schema.journalLines.journalEntryId, sourceId))
    .orderBy(schema.journalLines.lineNumber);

  const id = uid("j");
  const entryNumber = await nextEntryNumber();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  await db.transaction(async (tx) => {
    await tx.insert(schema.journalEntries).values({
      id,
      entryNumber,
      entryDate: today,
      fiscalPeriodId: src.fiscalPeriodId,
      description: src.description,
      reference: src.reference,
      source: src.source,
      status: "draft",
      postedAt: null,
      postedBy: null,
      voidedAt: null,
      voidReason: null,
      createdBy: user.userId,
      entityId: src.entityId,
      firmEntityId: src.firmEntityId,
      createdAt: now,
      updatedAt: now,
    });
    if (srcLines.length > 0) {
      await tx.insert(schema.journalLines).values(
        srcLines.map((l, i) => ({
          id: `${id}-l${i + 1}`,
          journalEntryId: id,
          lineNumber: i + 1,
          accountId: l.accountId,
          description: l.description,
          debit: l.debit,
          credit: l.credit,
          entityId: l.entityId,
          firmEntityId: l.firmEntityId,
          dimensions: l.dimensions,
          createdAt: now,
        })),
      );
    }
  });

  return { id, entryNumber };
}

/**
 * Duplicate an invoice into a new draft. The clone keeps customer, lines,
 * notes (header notes only — append-only invoice_notes log is not copied),
 * and dimensions; it always gets a fresh invoice number and today's date,
 * with the due date offset by the original payment term gap.
 */
export async function duplicateInvoice(
  _user: SessionUser,
  sourceId: string,
): Promise<{ id: string; invoiceNumber: string }> {
  const db = getDb();
  const [src] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, sourceId))
    .limit(1);
  if (!src) throw new Error("Source invoice not found.");

  const srcLines = await db
    .select()
    .from(schema.invoiceLines)
    .where(eq(schema.invoiceLines.invoiceId, sourceId))
    .orderBy(schema.invoiceLines.lineNumber);

  const id = uid("i");
  const invoiceNumber = await nextInvoiceNumber();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Preserve the original gap between invoice date and due date so a
  // duplicated Net-30 stays Net-30.
  const gapMs =
    new Date(`${src.dueDate}T00:00:00Z`).getTime() -
    new Date(`${src.invoiceDate}T00:00:00Z`).getTime();
  const dueDate = new Date(
    new Date(`${today}T00:00:00Z`).getTime() + Math.max(0, gapMs),
  )
    .toISOString()
    .slice(0, 10);

  await db.transaction(async (tx) => {
    await tx.insert(schema.invoices).values({
      id,
      invoiceNumber,
      customerId: src.customerId,
      entityId: src.entityId,
      clientId: src.clientId,
      invoiceDate: today,
      dueDate,
      status: "draft",
      cfoApprovedAt: null,
      cfoApprovedBy: null,
      assignedApprovedAt: null,
      assignedApprovedBy: null,
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null,
      subtotal: src.subtotal,
      taxAmount: src.taxAmount,
      total: src.total,
      amountPaid: "0.00",
      balanceDue: src.total,
      currencyCode: src.currencyCode,
      expectedPaymentDate: null,
      notes: src.notes,
      journalEntryId: null,
      firmEntityId: src.firmEntityId,
      createdAt: now,
      updatedAt: now,
    });
    if (srcLines.length > 0) {
      await tx.insert(schema.invoiceLines).values(
        srcLines.map((l, i) => ({
          id: `${id}-l${i + 1}`,
          invoiceId: id,
          lineNumber: i + 1,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          amount: l.amount,
          accountId: l.accountId,
          dimensions: l.dimensions,
          createdAt: now,
        })),
      );
    }
  });

  return { id, invoiceNumber };
}

/**
 * Duplicate a bill into a new draft. The vendor invoice number reference
 * is intentionally NOT carried over — the user must enter a fresh one. The
 * bill number itself is auto-generated.
 */
export async function duplicateBill(
  _user: SessionUser,
  sourceId: string,
): Promise<{ id: string; billNumber: string }> {
  const db = getDb();
  const [src] = await db
    .select()
    .from(schema.bills)
    .where(eq(schema.bills.id, sourceId))
    .limit(1);
  if (!src) throw new Error("Source bill not found.");

  const srcLines = await db
    .select()
    .from(schema.billLines)
    .where(eq(schema.billLines.billId, sourceId))
    .orderBy(schema.billLines.lineNumber);

  const id = uid("b");
  const billNumber = await nextBillNumber();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const gapMs =
    new Date(`${src.dueDate}T00:00:00Z`).getTime() -
    new Date(`${src.billDate}T00:00:00Z`).getTime();
  const dueDate = new Date(
    new Date(`${today}T00:00:00Z`).getTime() + Math.max(0, gapMs),
  )
    .toISOString()
    .slice(0, 10);

  await db.transaction(async (tx) => {
    await tx.insert(schema.bills).values({
      id,
      billNumber,
      vendorId: src.vendorId,
      billDate: today,
      dueDate,
      status: "draft",
      subtotal: src.subtotal,
      taxAmount: src.taxAmount,
      total: src.total,
      amountPaid: "0.00",
      balanceDue: src.total,
      currencyCode: src.currencyCode,
      notes: src.notes,
      journalEntryId: null,
      clientId: src.clientId,
      entityId: src.entityId,
      chargebackClientId: src.chargebackClientId,
      chargebackEntityId: src.chargebackEntityId,
      chargebackType: src.chargebackType,
      markupPct: src.markupPct,
      rebillAmount: src.rebillAmount,
      chargebackInvoiceId: null,
      chargebackNotes: src.chargebackNotes,
      createdAt: now,
      updatedAt: now,
    });
    if (srcLines.length > 0) {
      await tx.insert(schema.billLines).values(
        srcLines.map((l, i) => ({
          id: `${id}-l${i + 1}`,
          billId: id,
          lineNumber: i + 1,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          amount: l.amount,
          accountId: l.accountId,
          clientId: l.clientId,
          entityId: l.entityId,
          dimensions: l.dimensions,
          createdAt: now,
        })),
      );
    }
  });

  return { id, billNumber };
}
