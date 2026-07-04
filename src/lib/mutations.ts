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

import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { parseAmount, sumCredits, sumDebits, toDecimalString } from "./money";
import type {
  FilingKind,
  FilingRecurrence,
  FilingStatus,
  InvoiceRecurringFrequency,
  JournalEntry,
  KycReviewOutcome,
  KycStatus,
  KycSubjectType,
  RecurringFrequency,
  RiskRating,
  SessionUser,
} from "./types";
import {
  addMonthsIso,
  filingRecurrenceMonths,
  isOpenFilingStatus,
  kycReviewIntervalMonths,
} from "./compliance";
import { getJournalEntryById } from "./data";
import { computeClearedTotal, findOpeningAnchor } from "./reconciliation";
import { getEntityScope } from "./entity-scope";
import {
  checkPeriodForPost,
  getAccountingPeriods,
  stripPeriodErrorPrefix,
} from "./periods";
import { logAuditEvent } from "./audit";
import { hasPermission, requirePermission } from "./permissions";

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

/**
 * Coerce an FX-rate input (number or numeric string) to the
 * 8-decimal-string the DB expects. Returns null for null/undefined/0/1
 * (base currency, no conversion stored). Negative or NaN values become
 * null too so callers don't have to validate.
 */
function serializeFxRate(v: number | string | null | undefined): string | null {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!Number.isFinite(n) || n <= 0) return null;
  // Treat exactly 1.0 as "same as base — don't bother storing"
  if (n === 1) return null;
  return n.toFixed(8);
}

// --------- Number generators ---------

export async function nextEntryNumber(): Promise<string> {
  const db = getDb();
  // Only consider entries on the MAIN sequence "JE-NNNNNN" — the seed
  // also has entity-scoped sequences like "JE-E001-000004" that
  // lex-sort above the main range and would otherwise hijack the next
  // number. Templates ("TPL-NNNNNN") are excluded by isTemplate=false.
  const [row] = await db
    .select({ entryNumber: schema.journalEntries.entryNumber })
    .from(schema.journalEntries)
    .where(
      and(
        eq(schema.journalEntries.isTemplate, false),
        sql`${schema.journalEntries.entryNumber} ~ '^JE-[0-9]+$'`,
      ),
    )
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
  // Exclude templates from the lookup — they live in the parallel
  // "INVTPL-XXXXXX" sequence and would otherwise sort above "INV-".
  const [row] = await db
    .select({ invoiceNumber: schema.invoices.invoiceNumber })
    .from(schema.invoices)
    .where(eq(schema.invoices.isTemplate, false))
    .orderBy(desc(schema.invoices.invoiceNumber))
    .limit(1);
  const n = parseTrailingInt(row?.invoiceNumber) + 1;
  return `INV-${pad(n, 6)}`;
}

export async function nextInvoiceTemplateNumber(): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ invoiceNumber: schema.invoices.invoiceNumber })
    .from(schema.invoices)
    .where(eq(schema.invoices.isTemplate, true))
    .orderBy(desc(schema.invoices.invoiceNumber))
    .limit(1);
  const n = parseTrailingInt(row?.invoiceNumber) + 1;
  return `INVTPL-${pad(n, 6)}`;
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
  source?: "manual" | "invoice" | "bill" | "reconciliation" | "auto_reverse";
  fiscalPeriodId?: string | null;
  /** Legacy: client-entity tag. Reserved; not used for scoping. */
  entityId?: string | null;
  /** Which firm corporate entity issued this entry (drives the topbar scope). */
  firmEntityId?: string | null;
  status?: "draft" | "pending_approval" | "approved" | "posted" | "template";
  /**
   * Auto-reversing accrual. When true and the entry is later POSTED, a
   * mirrored posted entry is generated dated day 1 of the next open period.
   * Ignored for templates.
   */
  autoReverse?: boolean;
  /** Set on a generated reversal — points back to the original entry. */
  reversalEntryId?: string | null;
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
  /**
   * Optional FX snapshot. "1 base currency = fxRate native units" (same
   * convention as fx_rates.ratePerBase). null/undefined → no FX info
   * stored (treat as 1.0 / base currency).
   */
  fxRate?: number | string | null;
};

export async function createJournalEntry(
  user: SessionUser,
  input: CreateJournalEntryInput,
): Promise<JournalEntry> {
  if (input.bypassControlWarning) {
    requirePermission(user, "journal_entry.bypass_control");
  }

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
      fxRate: serializeFxRate(input.fxRate),
      autoReverse: isTemplate ? false : input.autoReverse ?? false,
      reversalEntryId: input.reversalEntryId ?? null,
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
  await logAuditEvent(user, {
    action: isTemplate ? "journal.template_create" : "journal.create",
    resourceType: "journal_entry",
    resourceId: created.id,
    resourceName: created.entryNumber,
    changes: { after: { status: created.status, lines: input.lines.length } },
    metadata: {
      bypassControlWarning: !!input.bypassControlWarning,
      periodOverrideReason: overrideRecorded,
    },
  });
  if (input.bypassControlWarning) {
    await logAuditEvent(user, {
      action: "journal.bypass_control_warning",
      resourceType: "journal_entry",
      resourceId: created.id,
      resourceName: created.entryNumber,
    });
  }
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

/**
 * True when this entry is a free-form MANUAL journal entry that must clear
 * maker-checker approval before posting. System- and generation-created
 * entries are exempt so we never block the invoice/bill/payment/
 * reconciliation/distribution/elimination flows or recurring/auto-reverse
 * generation:
 *   - non-"manual" source (invoice/bill/reconciliation/auto_reverse) → exempt
 *   - templates → exempt (they never post themselves)
 *   - elimination entries (eliminationEntryId set) → exempt (system)
 *   - recurring-generated entries (recurringParentId set) → exempt
 * Everything else keyed by a human on /journal/new needs a different
 * approver's sign-off.
 */
export function journalEntryRequiresApproval(entry: {
  source: JournalEntry["source"];
  isTemplate?: boolean;
  eliminationEntryId?: string | null;
  recurringParentId?: string | null;
}): boolean {
  return (
    entry.source === "manual" &&
    entry.isTemplate !== true &&
    (entry.eliminationEntryId ?? null) == null &&
    (entry.recurringParentId ?? null) == null
  );
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

  // Maker-checker: a free-form manual JE can only be posted once a second
  // person has approved it. draft / pending_approval → block; approved → OK.
  if (journalEntryRequiresApproval(entry) && entry.status !== "approved") {
    throw new Error(
      entry.status === "pending_approval"
        ? "This entry is awaiting approval. A different user must approve it before it can be posted."
        : "This entry must be submitted for approval and approved by a different user before it can be posted.",
    );
  }

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
  await logAuditEvent(user, {
    action: "journal.post",
    resourceType: "journal_entry",
    resourceId: updated.id,
    resourceName: updated.entryNumber,
    changes: { before: { status: entry.status }, after: { status: "posted" } },
    metadata: periodCheck.overrideRecorded
      ? { periodOverrideReason: periodCheck.overrideRecorded }
      : undefined,
  });

  // Auto-reversing accrual: on post, spawn a mirrored posted entry dated
  // day 1 of the next open period. Guarded so we never double-generate.
  if (updated.autoReverse && updated.reversalEntryId == null) {
    try {
      await generateAutoReversal(user, updated);
    } catch (err) {
      // Never let a reversal failure roll back a valid post — surface it in
      // the audit log and leave the original posted so the user can retry.
      await logAuditEvent(user, {
        action: "journal.auto_reverse_failed",
        resourceType: "journal_entry",
        resourceId: updated.id,
        resourceName: updated.entryNumber,
        metadata: {
          error: err instanceof Error ? err.message : "unknown",
        },
      });
    }
    const refreshed = await getJournalEntryById(entryId);
    if (refreshed) return refreshed;
  }
  return updated;
}

/**
 * Pick the entry date for an auto-reversal: day 1 of the next OPEN
 * accounting period after the original entry's period. Falls back to day 1
 * of the next calendar month when the next period doesn't exist or is
 * locked/closed. Returns the ISO date plus a note describing the choice.
 */
async function pickAutoReversalDate(
  entryDate: string,
): Promise<{ date: string; note: string }> {
  const periods = await getAccountingPeriods(); // ascending by startDate
  // First-of-next-calendar-month fallback, computed from the entry date.
  const nextMonthFirst = `${addMonthsIso(`${entryDate.slice(0, 8)}01`, 1).slice(0, 8)}01`;

  // Find the current period, then the first OPEN period that starts after it.
  const current = periods.find(
    (p) => entryDate >= p.startDate && entryDate <= p.endDate,
  );
  if (current) {
    const nextOpen = periods.find(
      (p) => p.startDate > current.endDate && p.status === "open",
    );
    if (nextOpen) {
      return {
        date: nextOpen.startDate,
        note: `Reversal dated first day of next open period (${nextOpen.name}).`,
      };
    }
  }
  return {
    date: nextMonthFirst,
    note: "Reversal dated first day of next calendar month (no open next period found).",
  };
}

/**
 * Generate the auto-reversal for a freshly-posted auto_reverse entry.
 * Creates a POSTED entry with every line's debit/credit swapped, dated day
 * 1 of the next open period, source 'auto_reverse', autoReverse=false so it
 * never recurses. Links the original → reversal via reversalEntryId.
 */
async function generateAutoReversal(
  user: SessionUser,
  original: JournalEntry,
): Promise<JournalEntry> {
  const { date, note } = await pickAutoReversalDate(original.entryDate);

  const reversalLines: DraftJournalLine[] = original.lines.map((l) => ({
    accountId: l.accountId,
    description: l.description,
    // Swap: original debit becomes credit, original credit becomes debit.
    debit: parseAmount(l.credit),
    credit: parseAmount(l.debit),
    dimensions: l.dimensions ?? {},
    intercompanyCounterpartEntityId: l.intercompanyCounterpartEntityId ?? null,
  }));

  // The reversal posts directly (system-generated — never routes through
  // maker-checker). No period-override reason is forced; if the target
  // period is closed/locked, createJournalEntry's period check throws and
  // the caller records the failure without rolling back the original post.
  const reversal = await createJournalEntry(user, {
    entryDate: date,
    description: `Auto-reversal of ${original.entryNumber}`,
    reference: original.entryNumber,
    source: "auto_reverse",
    status: "posted",
    entityId: original.entityId,
    firmEntityId: original.firmEntityId ?? null,
    fiscalPeriodId: null,
    autoReverse: false,
    reversalEntryId: original.id,
    fxRate: original.fxRate ?? null,
    lines: reversalLines,
  });

  const db = getDb();
  await db
    .update(schema.journalEntries)
    .set({ reversalEntryId: reversal.id, updatedAt: new Date() })
    .where(eq(schema.journalEntries.id, original.id));

  await logAuditEvent(user, {
    action: "journal.auto_reverse",
    resourceType: "journal_entry",
    resourceId: original.id,
    resourceName: original.entryNumber,
    metadata: { reversalId: reversal.id, reversalNumber: reversal.entryNumber, note },
  });
  return reversal;
}

// --------- Maker-checker approval (manual JEs) ---------

/**
 * Submit a draft manual JE for approval. Permission: journal_entry.create
 * (the author or any updater can submit). Only draft manual entries that
 * actually require approval can be submitted; system/generated entries are
 * rejected with a clear error. Records submittedAt/By and moves the entry
 * to pending_approval.
 */
export async function submitJournalEntryForApproval(
  user: SessionUser,
  entryId: string,
): Promise<JournalEntry> {
  requirePermission(user, "journal_entry.create");
  const entry = await getJournalEntryById(entryId);
  if (!entry) throw new Error("Entry not found.");
  if (!journalEntryRequiresApproval(entry)) {
    throw new Error(
      "This entry does not go through approval (system-generated or a template).",
    );
  }
  if (entry.status === "pending_approval") return entry;
  if (entry.status !== "draft") {
    throw new Error(`Only draft entries can be submitted (this one is ${entry.status}).`);
  }

  const db = getDb();
  const now = new Date();
  await db
    .update(schema.journalEntries)
    .set({
      status: "pending_approval",
      submittedAt: now,
      submittedBy: user.userId,
      // Clear any stale rejection reason from a previous round-trip.
      approvalRejectionReason: null,
      updatedAt: now,
    })
    .where(eq(schema.journalEntries.id, entryId));

  const updated = await getJournalEntryById(entryId);
  if (!updated) throw new Error("Entry vanished after submit.");
  await logAuditEvent(user, {
    action: "journal.submit_for_approval",
    resourceType: "journal_entry",
    resourceId: updated.id,
    resourceName: updated.entryNumber,
    changes: {
      before: { status: entry.status },
      after: { status: "pending_approval" },
    },
  });
  return updated;
}

/**
 * Approve a pending manual JE. Permission: journal_entry.approve. Enforces
 * segregation of duties: the approver may be neither the submitter nor the
 * original creator. Moves the entry to "approved" (posting becomes allowed).
 */
export async function approveJournalEntry(
  user: SessionUser,
  entryId: string,
): Promise<JournalEntry> {
  requirePermission(user, "journal_entry.approve");
  const entry = await getJournalEntryById(entryId);
  if (!entry) throw new Error("Entry not found.");
  if (!journalEntryRequiresApproval(entry)) {
    throw new Error("This entry does not require approval.");
  }
  if (entry.status === "approved") return entry;
  if (entry.status !== "pending_approval") {
    throw new Error(
      `Only entries awaiting approval can be approved (this one is ${entry.status}).`,
    );
  }
  // Segregation of duties — enforced in the mutation regardless of role.
  if (entry.submittedBy && entry.submittedBy === user.userId) {
    throw new Error(
      "Segregation of duties: the person who submitted this entry cannot approve it. A different user must approve.",
    );
  }
  if (entry.createdBy && entry.createdBy === user.userId) {
    throw new Error(
      "Segregation of duties: the person who created this entry cannot approve it. A different user must approve.",
    );
  }

  const db = getDb();
  const now = new Date();
  await db
    .update(schema.journalEntries)
    .set({
      status: "approved",
      approvedAt: now,
      approvedBy: user.userId,
      approvalRejectionReason: null,
      updatedAt: now,
    })
    .where(eq(schema.journalEntries.id, entryId));

  const updated = await getJournalEntryById(entryId);
  if (!updated) throw new Error("Entry vanished after approve.");
  await logAuditEvent(user, {
    action: "journal.approve",
    resourceType: "journal_entry",
    resourceId: updated.id,
    resourceName: updated.entryNumber,
    changes: {
      before: { status: entry.status },
      after: { status: "approved" },
    },
  });
  return updated;
}

/**
 * Reject a pending manual JE back to draft. Permission:
 * journal_entry.approve. Records the rejection reason and clears the
 * submission trail so the author can amend and resubmit.
 */
export async function rejectJournalEntry(
  user: SessionUser,
  entryId: string,
  reason: string,
): Promise<JournalEntry> {
  requirePermission(user, "journal_entry.approve");
  const entry = await getJournalEntryById(entryId);
  if (!entry) throw new Error("Entry not found.");
  if (entry.status !== "pending_approval") {
    throw new Error(
      `Only entries awaiting approval can be rejected (this one is ${entry.status}).`,
    );
  }
  const trimmed = (reason ?? "").trim();

  const db = getDb();
  const now = new Date();
  await db
    .update(schema.journalEntries)
    .set({
      status: "draft",
      approvalRejectionReason: trimmed === "" ? null : trimmed,
      submittedAt: null,
      submittedBy: null,
      approvedAt: null,
      approvedBy: null,
      updatedAt: now,
    })
    .where(eq(schema.journalEntries.id, entryId));

  const updated = await getJournalEntryById(entryId);
  if (!updated) throw new Error("Entry vanished after reject.");
  await logAuditEvent(user, {
    action: "journal.reject",
    resourceType: "journal_entry",
    resourceId: updated.id,
    resourceName: updated.entryNumber,
    changes: {
      before: { status: entry.status },
      after: { status: "draft" },
    },
    metadata: trimmed ? { reason: trimmed } : undefined,
  });
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
  await logAuditEvent(user, {
    action: "journal.void",
    resourceType: "journal_entry",
    resourceId: updated.id,
    resourceName: updated.entryNumber,
    changes: { before: { status: entry.status }, after: { status: "void" } },
    metadata: reason ? { reason } : undefined,
  });
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

  // Persist the eliminated pair itself (unordered, min|max) in the
  // reference — the source JE may tag lines to OTHER counterparts too, so
  // the pair cannot be reliably re-derived from its lines afterwards.
  // getEliminatedPairKeys parses this.
  const [pairMin, pairMax] =
    entityAId < entityBId ? [entityAId, entityBId] : [entityBId, entityAId];

  return createJournalEntry(user, {
    entryDate: new Date().toISOString().slice(0, 10),
    description: `Intercompany elimination · ${entityAId} ↔ ${entityBId}`,
    reference: `ELIM ${pairMin}|${pairMax}`,
    source: "manual",
    firmEntityId: null,
    status: "posted",
    eliminationEntryId: sourceEntryId,
    lines: eliminationLines,
  });
}

/**
 * Draft (never post) the missing counterpart of a mismatched intercompany
 * pair on the deficient entity's books.
 *
 * The intercompany report reconciles pair (A, B) when A's net tagged
 * position toward B plus B's net tagged position toward A is zero in base
 * currency. When it isn't, this creates a DRAFT JE on `deficientEntityId`
 * (B) dated today with:
 *   - an intercompany line on B's best-guess Due-to / Due-from account for
 *     counterpart A (the account B has historically used with A most
 *     often; fallback: an account whose name matches both /due (from|to)/i
 *     and the counterpart), tagged with counterpart A, and
 *   - a balancing line on a suspense/clearing account (name match;
 *     fallback: B's most-used expense account, flagged for reclass).
 *
 * Amounts are in base currency (no fxRate stored on the draft). The
 * accountant reviews accounts + amounts before posting.
 */
export async function draftIntercompanyCounterpart(
  user: SessionUser,
  deficientEntityId: string,
  counterpartEntityId: string,
): Promise<JournalEntry> {
  requirePermission(user, "journal_entry.create");
  if (deficientEntityId === counterpartEntityId) {
    throw new Error("Pick two distinct firm entities.");
  }
  const db = getDb();

  const offices = await db
    .select({
      id: schema.offices.id,
      code: schema.offices.code,
      name: schema.offices.name,
    })
    .from(schema.offices)
    .where(inArray(schema.offices.id, [deficientEntityId, counterpartEntityId]));
  const deficient = offices.find((o) => o.id === deficientEntityId);
  const counterpart = offices.find((o) => o.id === counterpartEntityId);
  if (!deficient || !counterpart) {
    throw new Error("Both sides of the pair must be firm entities.");
  }

  // Same line universe the reconciliation matrix uses: posted,
  // non-eliminated, tagged in either direction between the pair.
  const rows = await db
    .select({
      fromEntityId: schema.journalEntries.firmEntityId,
      accountId: schema.journalLines.accountId,
      debit: schema.journalLines.debit,
      credit: schema.journalLines.credit,
      fxRate: schema.journalEntries.fxRate,
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
            eq(schema.journalEntries.firmEntityId, counterpartEntityId),
            eq(
              schema.journalLines.intercompanyCounterpartEntityId,
              deficientEntityId,
            ),
          ),
          and(
            eq(schema.journalEntries.firmEntityId, deficientEntityId),
            eq(
              schema.journalLines.intercompanyCounterpartEntityId,
              counterpartEntityId,
            ),
          ),
        ),
      ),
    );
  if (rows.length === 0) {
    throw new Error("No tagged intercompany activity between this pair.");
  }

  // Net BOTH directions in base currency (base = native / fxRate; NULL
  // fxRate = already base). A reconciled pair nets to zero; the draft
  // books the exact offset on the deficient side.
  let netBase = 0;
  const accountUse = new Map<string, number>(); // deficient side's historical accounts
  for (const r of rows) {
    const fx = r.fxRate == null ? 0 : parseAmount(r.fxRate);
    const nat = parseAmount(r.debit) - parseAmount(r.credit);
    netBase += fx > 0 ? nat / fx : nat;
    if (r.fromEntityId === deficientEntityId) {
      accountUse.set(r.accountId, (accountUse.get(r.accountId) ?? 0) + 1);
    }
  }
  const needed = Math.round(-netBase * 100) / 100;
  if (Math.abs(needed) < 0.005) {
    throw new Error("This pair already reconciles — nothing to draft.");
  }

  const accounts = await db
    .select({
      id: schema.accounts.id,
      code: schema.accounts.code,
      name: schema.accounts.name,
      accountType: schema.accounts.accountType,
      isActive: schema.accounts.isActive,
    })
    .from(schema.accounts)
    .where(eq(schema.accounts.isActive, true))
    .orderBy(schema.accounts.code);

  // Intercompany line account: most-used by the deficient entity against
  // this counterpart, else name match on Due from/to + counterpart.
  let icAccountId: string | null = null;
  if (accountUse.size > 0) {
    icAccountId = Array.from(accountUse.entries()).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0][0];
  } else {
    const cpNeedles = [counterpart.name.toLowerCase(), counterpart.code.toLowerCase()];
    const match = accounts.find(
      (a) =>
        /due (from|to)/i.test(a.name) &&
        cpNeedles.some((needle) => a.name.toLowerCase().includes(needle)),
    );
    icAccountId = match?.id ?? null;
  }
  if (!icAccountId) {
    throw new Error(
      `${deficient.code} — ${deficient.name} has no Due-from/Due-to account for ` +
        `${counterpart.name}. Create an account named "Due from ${counterpart.name}" ` +
        `(asset) or "Due to ${counterpart.name}" (liability) in the chart of ` +
        `accounts, then draft again.`,
    );
  }

  // Balancing line: a suspense / clearing account by name, else the
  // deficient entity's most-used expense account (flagged for reclass).
  let balancingAccountId: string | null =
    accounts.find((a) => /suspense|clearing/i.test(a.name))?.id ?? null;
  let balancingIsSuspense = true;
  if (!balancingAccountId) {
    balancingIsSuspense = false;
    const expenseUse = await db
      .select({
        accountId: schema.journalLines.accountId,
        accountType: schema.accounts.accountType,
      })
      .from(schema.journalLines)
      .innerJoin(
        schema.journalEntries,
        eq(schema.journalLines.journalEntryId, schema.journalEntries.id),
      )
      .innerJoin(
        schema.accounts,
        eq(schema.journalLines.accountId, schema.accounts.id),
      )
      .where(
        and(
          eq(schema.journalEntries.status, "posted"),
          eq(schema.journalEntries.firmEntityId, deficientEntityId),
          eq(schema.accounts.accountType, "expense"),
        ),
      );
    const counts = new Map<string, number>();
    for (const r of expenseUse) {
      counts.set(r.accountId, (counts.get(r.accountId) ?? 0) + 1);
    }
    balancingAccountId =
      Array.from(counts.entries()).sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0]?.[0] ??
      accounts.find((a) => a.accountType === "expense")?.id ??
      null;
  }
  if (!balancingAccountId) {
    throw new Error(
      "No suspense/clearing (or expense) account found to balance the draft. " +
        'Create an account named "Suspense" or "Intercompany clearing" and draft again.',
    );
  }

  const amount = Math.abs(needed);
  const icLine: DraftJournalLine = {
    accountId: icAccountId,
    description: `Intercompany with ${counterpart.code} — ${counterpart.name} (base currency)`,
    debit: needed > 0 ? amount : 0,
    credit: needed > 0 ? 0 : amount,
    intercompanyCounterpartEntityId: counterpartEntityId,
  };
  const balancingLine: DraftJournalLine = {
    accountId: balancingAccountId,
    description: balancingIsSuspense
      ? "Suspense/clearing — confirm account before posting"
      : "TEMPORARY balancing line — reclass to the correct account before posting",
    debit: needed > 0 ? 0 : amount,
    credit: needed > 0 ? amount : 0,
  };

  const created = await createJournalEntry(user, {
    entryDate: new Date().toISOString().slice(0, 10),
    description: "Intercompany counterpart draft — review accounts before posting",
    reference: `IC-RECON ${counterpart.code} ↔ ${deficient.code}`,
    source: "manual",
    firmEntityId: deficientEntityId,
    status: "draft",
    lines: [icLine, balancingLine],
  });

  await logAuditEvent(user, {
    action: "intercompany.draft_counterpart",
    resourceType: "journal_entry",
    resourceId: created.id,
    resourceName: created.entryNumber,
    metadata: {
      deficientEntityId,
      counterpartEntityId,
      amountBase: amount,
      direction: needed > 0 ? "debit" : "credit",
    },
  });
  return created;
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
  user: SessionUser,
  input: { key: string; label: string; description?: string | null },
) {
  requirePermission(user, "settings.write");
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

export async function deleteLookupTable(user: SessionUser, key: string) {
  requirePermission(user, "settings.write");
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(schema.lookupValues).where(eq(schema.lookupValues.tableKey, key));
    await tx.delete(schema.lookupTables).where(eq(schema.lookupTables.key, key));
  });
}

export async function createLookupValue(
  user: SessionUser,
  input: { tableKey: string; code: string; label: string; sortOrder?: number },
) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  id: string,
  input: { label?: string; sortOrder?: number; isActive?: boolean },
) {
  requirePermission(user, "settings.write");
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

export async function deleteLookupValue(user: SessionUser, id: string) {
  requirePermission(user, "settings.write");
  const db = getDb();
  await db.delete(schema.lookupValues).where(eq(schema.lookupValues.id, id));
}

export async function createCustomFieldDefinition(
  user: SessionUser,
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
  requirePermission(user, "settings.write");
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
  user: SessionUser,
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
  requirePermission(user, "settings.write");
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

export async function deleteCustomFieldDefinition(user: SessionUser, id: string) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  input: {
    definitionId: string;
    recordId: string;
    valueText?: string | null;
    valueNumber?: number | null;
    valueDate?: string | null;
    valueBoolean?: boolean | null;
  },
) {
  requirePermission(user, "settings.write");
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

export async function createCurrency(user: SessionUser, input: CreateCurrencyInput) {
  requirePermission(user, "settings.write");
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

export async function setBaseCurrency(user: SessionUser, code: string) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  code: string,
  isActive: boolean,
) {
  requirePermission(user, "settings.write");
  const db = getDb();
  await db
    .update(schema.currencies)
    .set({ isActive })
    .where(eq(schema.currencies.code, code.toUpperCase()));
}

export async function deleteCurrency(user: SessionUser, code: string) {
  requirePermission(user, "settings.write");
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

export async function createFxRate(user: SessionUser, input: CreateFxRateInput) {
  requirePermission(user, "settings.write");
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

export async function deleteFxRate(user: SessionUser, id: string) {
  requirePermission(user, "settings.write");
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
  /** 0–100 (percent). NULL = unspecified. */
  ownershipPercent?: number | null;
};

export async function createEntity(user: SessionUser, input: CreateEntityInput) {
  requirePermission(user, "settings.write");
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
      ownershipPercent:
        input.ownershipPercent == null
          ? null
          : toDecimalString(input.ownershipPercent),
    })
    .returning();
  return created;
}

export type UpdateEntityInput = Partial<Omit<CreateEntityInput, "code">> & {
  code?: string;
};

export async function updateEntity(
  user: SessionUser,
  id: string,
  input: UpdateEntityInput,
) {
  requirePermission(user, "settings.write");
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
      ...(input.ownershipPercent !== undefined && {
        ownershipPercent:
          input.ownershipPercent == null
            ? null
            : toDecimalString(input.ownershipPercent),
      }),
      updatedAt: new Date(),
    })
    .where(eq(schema.entities.id, id))
    .returning();
  if (!updated) throw new Error("Entity not found.");
  return updated;
}

export async function deleteEntity(user: SessionUser, id: string) {
  requirePermission(user, "settings.write");
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
    | "bank_account"
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
  valuationDate?: string | null;
  /** Kind-specific fields (see src/lib/asset-fields.ts). */
  details?: Record<string, string>;
  /** kind = bank_account → linked bank_accounts row. */
  bankAccountId?: string | null;
  notes?: string | null;
};

export async function createAsset(user: SessionUser, input: CreateAssetInput) {
  requirePermission(user, "settings.write");
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
      valuationDate: input.valuationDate ?? null,
      details: input.details ?? {},
      bankAccountId: input.bankAccountId ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return created;
}

export type UpdateAssetInput = Partial<CreateAssetInput>;

export async function updateAsset(
  user: SessionUser,
  id: string,
  input: UpdateAssetInput,
) {
  requirePermission(user, "settings.write");
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
      ...(input.valuationDate !== undefined && { valuationDate: input.valuationDate }),
      ...(input.details !== undefined && { details: input.details }),
      ...(input.bankAccountId !== undefined && { bankAccountId: input.bankAccountId }),
      ...(input.notes !== undefined && { notes: input.notes }),
      updatedAt: new Date(),
    })
    .where(eq(schema.assets.id, id))
    .returning();
  if (!updated) throw new Error("Asset not found.");
  return updated;
}

export async function deleteAsset(user: SessionUser, id: string) {
  requirePermission(user, "settings.write");
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
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  input: CreateFeeScheduleInput,
) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  id: string,
  input: UpdateFeeScheduleInput,
) {
  requirePermission(user, "settings.write");
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

export async function deleteFeeSchedule(user: SessionUser, id: string) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  input: CreateEntityFeeInput,
) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  id: string,
  input: UpdateEntityFeeInput,
) {
  requirePermission(user, "settings.write");
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

export async function deleteEntityFee(user: SessionUser, id: string) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  input: CreateEmployeeRateInput,
) {
  requirePermission(user, "settings.write");
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

export async function deleteEmployeeRate(user: SessionUser, id: string) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  input: CreateTimeEntryInput,
) {
  if (input.userId !== user.userId) {
    requirePermission(user, "settings.write");
  }
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
  user: SessionUser,
  id: string,
  input: UpdateTimeEntryInput,
) {
  const db = getDb();
  const [existing] = await db
    .select({ userId: schema.timeEntries.userId })
    .from(schema.timeEntries)
    .where(eq(schema.timeEntries.id, id))
    .limit(1);
  if (!existing) throw new Error("Time entry not found.");
  if (
    existing.userId !== user.userId ||
    (input.userId !== undefined && input.userId !== user.userId)
  ) {
    requirePermission(user, "settings.write");
  }
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

export async function deleteTimeEntry(user: SessionUser, id: string) {
  const db = getDb();
  const [existing] = await db
    .select({ userId: schema.timeEntries.userId })
    .from(schema.timeEntries)
    .where(eq(schema.timeEntries.id, id))
    .limit(1);
  if (!existing) return;
  if (existing.userId !== user.userId) {
    requirePermission(user, "settings.write");
  }
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
  /** Beneficiary register: eligible recipient of entity distributions. */
  isBeneficiary?: boolean;
  customerId?: string | null;
  vendorId?: string | null;
  userId?: string | null;
  /** Raw OCR text indexed by global search. */
  ocrText?: string | null;
};

export async function createContact(user: SessionUser, input: CreateContactInput) {
  requirePermission(user, "settings.write");
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
      isBeneficiary: input.isBeneficiary ?? false,
      customerId: input.customerId ?? null,
      vendorId: input.vendorId ?? null,
      userId: input.userId ?? null,
      isActive: true,
      ocrText: input.ocrText ?? null,
    })
    .returning();
  await logAuditEvent(user, {
    action: "contact.create",
    resourceType: "contact",
    resourceId: id,
    resourceName: created.name,
    changes: { after: { code: created.code, kind: created.kind } },
  });
  return created;
}

export type UpdateContactInput = Partial<CreateContactInput> & { isActive?: boolean };

export async function updateContact(
  user: SessionUser,
  id: string,
  input: UpdateContactInput,
) {
  requirePermission(user, "settings.write");
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
      ...(input.isBeneficiary !== undefined && {
        isBeneficiary: input.isBeneficiary,
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

export async function deleteContact(user: SessionUser, id: string) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  input: CreateContactLinkInput,
) {
  requirePermission(user, "settings.write");
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

export async function deleteContactLink(user: SessionUser, id: string) {
  requirePermission(user, "settings.write");
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
  regionId?: string | null;
};

export async function createOffice(user: SessionUser, input: CreateOfficeInput) {
  requirePermission(user, "settings.write");
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
      regionId: input.regionId ?? null,
      isActive: true,
      notes: input.notes ?? null,
    })
    .returning();
  return created;
}

export type UpdateOfficeInput = Partial<CreateOfficeInput> & { isActive?: boolean };

export async function updateOffice(
  user: SessionUser,
  id: string,
  input: UpdateOfficeInput,
) {
  requirePermission(user, "settings.write");
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

export async function deleteOffice(user: SessionUser, id: string) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  input: CreatePriceListInput,
) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  id: string,
  input: UpdatePriceListInput,
) {
  requirePermission(user, "settings.write");
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

export async function deletePriceList(user: SessionUser, id: string) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  sourceId: string,
  options: { name: string; effectiveDate: string; setCurrent?: boolean } = {
    name: "(cloned)",
    effectiveDate: new Date().toISOString().slice(0, 10),
  },
) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  input: CreatePriceListEntryInput,
) {
  requirePermission(user, "settings.write");
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

export async function deletePriceListEntry(user: SessionUser, id: string) {
  requirePermission(user, "settings.write");
  const db = getDb();
  await db.delete(schema.priceListEntries).where(eq(schema.priceListEntries.id, id));
}

// --------- Customers / Vendors ---------

export async function createCustomer(
  user: SessionUser,
  input: {
    code: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    billingAddress?: string | null;
    paymentTerms: number;
    regionId?: string | null;
  },
) {
  requirePermission(user, "invoice.create");
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
      regionId: input.regionId ?? null,
      isActive: true,
      notes: null,
    })
    .returning();
  return created;
}

export async function createVendor(
  user: SessionUser,
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
    /**
     * Approval state at creation. Defaults to "approved" — manual creation
     * is itself the act of approving. The OCR auto-create path overrides
     * to "pending" so a human reviews the row before bills against the
     * new vendor can be approved or paid.
     */
    approvalStatus?: "pending" | "approved";
  },
) {
  requirePermission(user, "bill.create");
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
  const status = input.approvalStatus ?? "approved";
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
      approvalStatus: status,
      // If created already-approved we record the approver immediately so
      // the audit trail has a who/when even for hand-created vendors.
      approvedAt: status === "approved" ? new Date() : null,
      approvedByUserId: status === "approved" ? user.userId : null,
    })
    .returning();
  await logAuditEvent(user, {
    action: status === "approved" ? "vendor.create" : "vendor.create_pending",
    resourceType: "vendor",
    resourceId: id,
    resourceName: input.code,
    metadata: { name: input.name, approvalStatus: status },
  });
  return created;
}

/**
 * Compute the next available vendor code on the `VEND-NNN` ladder. The DB
 * regex filter keeps non-conforming codes (e.g. legacy imports) from
 * skewing the max; everything else parses to an integer and we pick max+1.
 */
async function nextVendorCode(): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ code: schema.vendors.code })
    .from(schema.vendors)
    .where(sql`${schema.vendors.code} ~ '^VEND-[0-9]+$'`)
    .orderBy(desc(schema.vendors.code))
    .limit(1);
  const trailing = row?.code?.match(/^VEND-(\d+)$/)?.[1];
  const next = (trailing ? parseInt(trailing, 10) : 0) + 1;
  return `VEND-${String(next).padStart(3, "0")}`;
}

/**
 * Look up a vendor by name (case-insensitive, trimmed). If none exists,
 * create one with sensible defaults: next sequential `VEND-NNN` code,
 * Net-30 terms, and the rest of the fields left blank for the user to
 * fill in later. Used by the bill-entry OCR path so an extracted vendor
 * name automatically materializes a vendor record instead of being lost
 * to the notes field.
 */
export async function findOrCreateVendorByName(
  user: SessionUser,
  rawName: string,
): Promise<{ vendor: typeof schema.vendors.$inferSelect; created: boolean }> {
  const name = rawName.trim();
  if (!name) throw new Error("Vendor name is required.");
  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.vendors)
    .where(sql`lower(${schema.vendors.name}) = lower(${name})`)
    .limit(1);
  if (existing) return { vendor: existing, created: false };

  const code = await nextVendorCode();
  const vendor = await createVendor(user, {
    code,
    name,
    paymentTerms: 30,
    // OCR-created vendors land pending — a manager / admin must
    // approve them in /vendors/pending before bills can be approved
    // against them. Keeps unattended AP flows from silently posting
    // money to brand-new payees.
    approvalStatus: "pending",
  });
  return { vendor, created: true };
}

/**
 * Mark a pending vendor as approved. Bills against the vendor become
 * postable once this lands. Idempotent — re-approving a vendor refreshes
 * the approver / timestamp but the audit log records every transition.
 */
export async function approveVendor(
  user: SessionUser,
  vendorId: string,
  notes: string | null,
): Promise<void> {
  requirePermission(user, "vendor.approve");
  const db = getDb();
  const [vendor] = await db
    .select()
    .from(schema.vendors)
    .where(eq(schema.vendors.id, vendorId))
    .limit(1);
  if (!vendor) throw new Error("Vendor not found.");
  await db
    .update(schema.vendors)
    .set({
      approvalStatus: "approved",
      approvedAt: new Date(),
      approvedByUserId: user.userId,
      approvalNotes: notes && notes.trim() !== "" ? notes.trim() : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.vendors.id, vendorId));
  await logAuditEvent(user, {
    action: "vendor.approve",
    resourceType: "vendor",
    resourceId: vendorId,
    resourceName: vendor.code,
    metadata: { code: vendor.code, name: vendor.name, notes },
  });
}

/**
 * Reject a pending vendor. The row stays in the table (so historical
 * drafts that reference it still resolve) but bills against it can never
 * be approved. The user can update the row + re-approve later.
 */
export async function rejectVendor(
  user: SessionUser,
  vendorId: string,
  notes: string | null,
): Promise<void> {
  requirePermission(user, "vendor.approve");
  const db = getDb();
  const [vendor] = await db
    .select()
    .from(schema.vendors)
    .where(eq(schema.vendors.id, vendorId))
    .limit(1);
  if (!vendor) throw new Error("Vendor not found.");
  await db
    .update(schema.vendors)
    .set({
      approvalStatus: "rejected",
      approvedAt: new Date(),
      approvedByUserId: user.userId,
      approvalNotes: notes && notes.trim() !== "" ? notes.trim() : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.vendors.id, vendorId));
  await logAuditEvent(user, {
    action: "vendor.reject",
    resourceType: "vendor",
    resourceId: vendorId,
    resourceName: vendor.code,
    metadata: { code: vendor.code, name: vendor.name, notes },
  });
}

export async function updateVendorInvoiceNumberRule(
  user: SessionUser,
  vendorId: string,
  rule: {
    invoiceNumberPrefix?: string | null;
    invoiceNumberPattern?: string | null;
    invoiceNumberLastUsed?: string | null;
  },
) {
  requirePermission(user, "bill.update");
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
  user: SessionUser,
  customerId: string,
  assignedUserId: string | null,
) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  input: { customerId: string; userId: string; isPrimary?: boolean; canApprove?: boolean; role?: string | null },
) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  assignmentId: string,
) {
  requirePermission(user, "settings.write");
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
  /** When true, persisted as a recurring template (status forced to "template"). */
  isTemplate?: boolean;
  recurringFrequency?: InvoiceRecurringFrequency | null;
  recurringDayOfMonth?: number | null;
  recurringNextDate?: string | null;
  recurringEndDate?: string | null;
  recurringParentId?: string | null;
  billingPeriodStart?: string | null;
  billingPeriodEnd?: string | null;
  /** Time entries to mark as billed against the new invoice once created. */
  timeEntryIds?: string[];
  /**
   * Optional FX snapshot at create time. Same convention as
   * fx_rates.ratePerBase: 1 base currency = fxRate native units.
   * Defaults to null (base currency); the UI fills the latest rate
   * when the invoice is in a foreign currency.
   */
  fxRate?: number | string | null;
};

export async function createInvoice(user: SessionUser, input: CreateInvoiceInput) {
  requirePermission(user, "invoice.create");

  if (input.lines.length === 0) throw new Error("Invoice must have at least 1 line.");
  for (const [i, l] of input.lines.entries()) {
    if (!l.accountId) throw new Error(`Line ${i + 1}: account is required.`);
    if (l.quantity <= 0) throw new Error(`Line ${i + 1}: quantity must be > 0.`);
    if (l.unitPrice < 0) throw new Error(`Line ${i + 1}: unit price must be >= 0.`);
    if (!l.description.trim()) throw new Error(`Line ${i + 1}: description is required.`);
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

  // Period close enforcement on the invoice date (see src/lib/periods.ts).
  // Templates never hit the ledger themselves, so skip the check — it'll
  // fire when each generated draft is posted.
  const periodCheck = isTemplate
    ? { overrideRecorded: null as string | null }
    : await checkPeriodForPost(
        input.invoiceDate,
        input.periodOverrideReason,
      );

  const db = getDb();
  const id = uid("i");
  const invoiceNumber = isTemplate
    ? await nextInvoiceTemplateNumber()
    : await nextInvoiceNumber();
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
      status: isTemplate ? "template" : "draft",
      subtotal: toDecimalString(subtotal),
      taxRate: taxRate.toFixed(5),
      taxExempt,
      taxAmount: toDecimalString(taxAmount),
      total: toDecimalString(total),
      amountPaid: "0.00",
      balanceDue: isTemplate ? "0.00" : toDecimalString(total),
      currencyCode,
      firmEntityId,
      notes: input.notes ?? null,
      ocrText: input.ocrText ?? null,
      periodOverrideReason: periodCheck.overrideRecorded,
      journalEntryId: null,
      isTemplate,
      recurringFrequency: isTemplate ? input.recurringFrequency ?? null : null,
      recurringDayOfMonth: isTemplate ? input.recurringDayOfMonth ?? null : null,
      recurringNextDate: isTemplate ? input.recurringNextDate ?? null : null,
      recurringEndDate: isTemplate ? input.recurringEndDate ?? null : null,
      recurringParentId: input.recurringParentId ?? null,
      billingPeriodStart: input.billingPeriodStart ?? null,
      billingPeriodEnd: input.billingPeriodEnd ?? null,
      fxRate: serializeFxRate(input.fxRate),
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
    // Mark selected unbilled time entries as billed to this invoice. Done
    // inside the same txn so a failed insert rolls them back too.
    if (input.timeEntryIds && input.timeEntryIds.length > 0 && !isTemplate) {
      await tx
        .update(schema.timeEntries)
        .set({ invoiceId: id, updatedAt: now })
        .where(inArray(schema.timeEntries.id, input.timeEntryIds));
    }
  });
  await logAuditEvent(user, {
    action: "invoice.create",
    resourceType: "invoice",
    resourceId: id,
    resourceName: invoiceNumber,
    changes: {
      after: { customerId: input.customerId, subtotal, taxAmount, total },
    },
    metadata: periodCheck.overrideRecorded
      ? { periodOverrideReason: periodCheck.overrideRecorded }
      : undefined,
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
  requirePermission(user, "invoice.update");
  return postInvoiceCore(user, invoiceId, options);
}

async function postInvoiceCore(
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
    // Propagate the invoice's FX snapshot to the JE so reports can
    // tell "this entry was booked at a 1 USD = 0.925 EUR rate".
    fxRate: (inv as { fxRate?: string | null }).fxRate ?? null,
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

  await logAuditEvent(user, {
    action: "invoice.post",
    resourceType: "invoice",
    resourceId: invoiceId,
    resourceName: inv.invoiceNumber,
    changes: { before: { status: "draft" }, after: { status: "sent" } },
    metadata: { journalEntryId: je.id },
  });

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
  requirePermission(user, "bank.create_transaction");

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
    if (ba?.accountId) cashAccountId = ba.accountId;
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
  requirePermission(user, "invoice.void");

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
  user: SessionUser,
  invoiceId: string,
) {
  requirePermission(user, "invoice.update");

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
  requirePermission(user, "invoice.approve");

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
  if (!approverIds.has(user.userId) && !hasPermission(user, "invoice.approve")) {
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
  await postInvoiceCore(user, invoiceId);
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
  if (inv.status === "pending_cfo") {
    requirePermission(user, "invoice.approve");
  } else if (!hasPermission(user, "invoice.approve")) {
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
    if (!approverIds.has(user.userId)) {
      throw new Error("Only an assigned approver can reject this invoice.");
    }
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
  /**
   * Split rebill: each line's clientId (or entityId when chargebackSplitBy
   * is 'entity') decides who pays for it (lines with no allocation aren't
   * rebilled). Requires chargebackType cost/markup/included — "fixed" is
   * ambiguous across payers. Mutually exclusive with chargebackClientId /
   * chargebackEntityId.
   */
  chargebackSplit?: boolean;
  chargebackSplitBy?: "client" | "entity";
  chargebackType?: "cost" | "markup" | "fixed" | "included" | null;
  markupPct?: number | null;
  rebillAmount?: number | null;
  chargebackNotes?: string | null;
  /**
   * Optional FX snapshot at create time. Same convention as
   * fx_rates.ratePerBase: 1 base currency = fxRate native units.
   * Defaults to null (base currency).
   */
  fxRate?: number | string | null;
};

export async function createBill(user: SessionUser, input: CreateBillInput) {
  requirePermission(user, "bill.create");

  if (input.lines.length === 0) throw new Error("Bill must have at least 1 line.");
  for (const [i, l] of input.lines.entries()) {
    if (!l.accountId) throw new Error(`Line ${i + 1}: account is required.`);
    if (l.quantity <= 0) throw new Error(`Line ${i + 1}: quantity must be > 0.`);
    if (l.unitPrice < 0) throw new Error(`Line ${i + 1}: unit price must be >= 0.`);
    if (!l.description.trim()) throw new Error(`Line ${i + 1}: description is required.`);
  }

  if (input.chargebackSplit) {
    if (input.chargebackClientId || input.chargebackEntityId) {
      throw new Error("Split chargeback can't also have a single rebill recipient.");
    }
    if (input.chargebackType === "fixed") {
      throw new Error("Fixed-amount rebill can't be split across payers.");
    }
    if (input.chargebackSplitBy === "entity") {
      if (!input.lines.some((l) => l.entityId)) {
        throw new Error("Split chargeback needs at least one line with an entity.");
      }
    } else if (!input.lines.some((l) => l.clientId)) {
      throw new Error("Split chargeback needs at least one line with a client.");
    }
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
      chargebackSplit: input.chargebackSplit ?? false,
      chargebackSplitBy: input.chargebackSplit
        ? (input.chargebackSplitBy ?? "client")
        : null,
      chargebackType: input.chargebackType ?? null,
      markupPct:
        input.markupPct != null ? input.markupPct.toFixed(4) : null,
      rebillAmount:
        input.rebillAmount != null ? toDecimalString(input.rebillAmount) : null,
      chargebackNotes: input.chargebackNotes ?? null,
      fxRate: serializeFxRate(input.fxRate),
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
        // Split rebills: a line with no allocation is deliberately not
        // billed — don't let the header on-behalf-of client/entity leak in
        // as its payer.
        clientId:
          input.chargebackSplit && (input.chargebackSplitBy ?? "client") === "client"
            ? (l.clientId ?? null)
            : (l.clientId ?? input.clientId ?? null),
        entityId:
          input.chargebackSplit && input.chargebackSplitBy === "entity"
            ? (l.entityId ?? null)
            : (l.entityId ?? input.entityId ?? null),
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
  await logAuditEvent(user, {
    action: "bill.create",
    resourceType: "bill",
    resourceId: id,
    resourceName: billNumber,
    changes: { after: { vendorId: input.vendorId, total: subtotal } },
    metadata: periodCheck.overrideRecorded
      ? { periodOverrideReason: periodCheck.overrideRecorded }
      : undefined,
  });
  return { id, billNumber };
}

export async function approveBill(
  user: SessionUser,
  billId: string,
  options: { periodOverrideReason?: string | null } = {},
) {
  requirePermission(user, "bill.approve");

  const db = getDb();
  const [bill] = await db
    .select()
    .from(schema.bills)
    .where(eq(schema.bills.id, billId))
    .limit(1);
  if (!bill) throw new Error("Bill not found.");
  if (bill.status !== "draft") throw new Error(`Bill is already ${bill.status}.`);

  // Vendor approval gate: bills referencing a pending or rejected vendor
  // cannot be approved. The user has to either approve the vendor in
  // /vendors/pending or swap to an already-approved vendor. Drafts are
  // intentionally allowed (so OCR autofill can still save) — this gate
  // only fires when money is about to move.
  const [vendor] = await db
    .select({
      code: schema.vendors.code,
      name: schema.vendors.name,
      approvalStatus: schema.vendors.approvalStatus,
    })
    .from(schema.vendors)
    .where(eq(schema.vendors.id, bill.vendorId))
    .limit(1);
  if (!vendor) throw new Error("Vendor not found.");
  if (vendor.approvalStatus !== "approved") {
    const label =
      vendor.approvalStatus === "rejected" ? "rejected" : "pending approval";
    throw new Error(
      `Vendor ${vendor.code} — ${vendor.name} is ${label}. Approve the vendor in Vendor approvals before approving this bill.`,
    );
  }

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
    // Propagate the bill's FX snapshot to the JE for symmetry with the
    // invoice posting flow.
    fxRate: (bill as { fxRate?: string | null }).fxRate ?? null,
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

  await logAuditEvent(user, {
    action: "bill.approve",
    resourceType: "bill",
    resourceId: billId,
    resourceName: bill.billNumber,
    changes: { before: { status: bill.status }, after: { status: "approved" } },
    metadata: { journalEntryId: je.id },
  });

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
  requirePermission(user, "bank.create_transaction");
  return postBillPayment(user, input);
}

/**
 * The actual bill-payment posting (JE + bill status update), shared by
 * `recordBillPayment` (direct pay, gated on bank.create_transaction) and
 * `releasePaymentRun` (dual-control release, gated on payment.release —
 * releasers don't necessarily hold bank.create_transaction). Callers MUST
 * enforce their own permission before calling.
 */
async function postBillPayment(
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
    if (ba?.accountId) cashAccountId = ba.accountId;
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
  requirePermission(user, "bill.void");

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
  user: SessionUser,
  input: SetBillChargebackInput,
) {
  requirePermission(user, "bill.update");

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
  if (bill.chargebackSplit) {
    // A split bill may already have some clients' shares invoiced at the
    // line level — reconfiguring underneath those would corrupt the trail.
    const [stamped] = await db
      .select({ id: schema.billLines.id })
      .from(schema.billLines)
      .where(
        and(
          eq(schema.billLines.billId, input.billId),
          isNotNull(schema.billLines.chargebackInvoiceId),
        ),
      )
      .limit(1);
    if (stamped) {
      throw new Error(
        "Parts of this split chargeback are already invoiced. Void those invoices before changing it.",
      );
    }
  }

  if (input.type === null) {
    await db
      .update(schema.bills)
      .set({
        chargebackClientId: null,
        chargebackEntityId: null,
        chargebackSplit: false,
        chargebackSplitBy: null,
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
      // Single-recipient config replaces any (un-invoiced) split setup.
      chargebackSplit: false,
      chargebackSplitBy: null,
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

  // For split bills only this client's unbilled lines are rebilled; their
  // ids get stamped with the new invoice below.
  const splitLineIds: string[] = [];
  const wholeBillIds: string[] = [];

  const lines: DraftInvoiceLine[] = [];
  for (const b of bills) {
    if (b.chargebackType === "included" || b.chargebackType == null) {
      throw new Error(`Bill ${b.billNumber} isn't set to rebill.`);
    }
    if (b.chargebackSplit) {
      // Entity splits invoice the entity's owning client — resolve which
      // line allocations belong to input.clientId for this bill's split kind.
      const splitBy =
        ((b as { chargebackSplitBy?: string | null }).chargebackSplitBy ??
          "client") as "client" | "entity";
      let lineFilter;
      if (splitBy === "entity") {
        const owned = await db
          .select({ id: schema.entities.id })
          .from(schema.entities)
          .where(eq(schema.entities.clientId, input.clientId));
        if (owned.length === 0) {
          throw new Error(
            `Bill ${b.billNumber} splits by entity but this client owns none.`,
          );
        }
        lineFilter = inArray(
          schema.billLines.entityId,
          owned.map((e) => e.id),
        );
      } else {
        lineFilter = eq(schema.billLines.clientId, input.clientId);
      }
      const billLines = await db
        .select()
        .from(schema.billLines)
        .where(
          and(
            eq(schema.billLines.billId, b.id),
            lineFilter,
            isNull(schema.billLines.chargebackInvoiceId),
          ),
        );
      if (billLines.length === 0) {
        throw new Error(
          `Bill ${b.billNumber} has no unbilled lines for this client.`,
        );
      }
      const share = billLines.reduce((s, l) => s + parseFloat(l.amount), 0);
      const pct = b.chargebackType === "markup" && b.markupPct ? parseFloat(b.markupPct) : 0;
      const amt = Math.round(share * (1 + pct) * 100) / 100;
      if (amt <= 0) {
        throw new Error(`Bill ${b.billNumber} has no rebillable amount for this client.`);
      }
      splitLineIds.push(...billLines.map((l) => l.id));
      lines.push({
        description: `Reimbursable — ${b.billNumber} (client's share)`,
        quantity: 1,
        unitPrice: amt,
        accountId: SERVICE_REVENUE_ACCOUNT_ID,
      });
      continue;
    }
    if (b.chargebackInvoiceId) {
      throw new Error(`Bill ${b.billNumber} is already billed back.`);
    }
    if (b.chargebackClientId !== input.clientId) {
      throw new Error(`Bill ${b.billNumber} isn't tagged to this client.`);
    }
    const amt = computeRebillAmount(b);
    if (amt == null || amt <= 0) {
      throw new Error(`Bill ${b.billNumber} has no rebillable amount.`);
    }
    wholeBillIds.push(b.id);
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

  // Whole-bill chargebacks stamp the bill; split bills stamp only this
  // client's lines (bill-level stays NULL so other clients' shares remain
  // pending). A split bill is fully billed once every client line is stamped.
  if (wholeBillIds.length > 0) {
    await db
      .update(schema.bills)
      .set({ chargebackInvoiceId: created.id, updatedAt: new Date() })
      .where(inArray(schema.bills.id, wholeBillIds));
  }
  if (splitLineIds.length > 0) {
    await db
      .update(schema.billLines)
      .set({ chargebackInvoiceId: created.id })
      .where(inArray(schema.billLines.id, splitLineIds));
  }

  return created;
}

// --------- Budgets ---------

export type BudgetCell = {
  accountId: string;
  /** 1–12. The editor manages monthly budgets only; annual (month NULL)
   *  rows are left untouched. */
  month: number;
  /** Parsed amount; null/0 = no budget for that cell. */
  amount: number | null;
};

/**
 * Replace the monthly budget grid for one fiscal year. The editor submits
 * every cell, so this deletes the year's monthly rows and re-inserts the
 * non-empty ones in a single transaction. Annual budgets (month IS NULL)
 * are preserved.
 */
export async function setMonthlyBudgets(
  user: SessionUser,
  fiscalYear: number,
  cells: BudgetCell[],
) {
  requirePermission(user, "settings.write");
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
    throw new Error("Invalid fiscal year.");
  }
  const now = new Date();
  const rows = cells
    .filter(
      (c) =>
        c.amount != null &&
        Number.isFinite(c.amount) &&
        c.amount !== 0 &&
        c.month >= 1 &&
        c.month <= 12,
    )
    .map((c) => ({
      id: uid("bud"),
      accountId: c.accountId,
      fiscalYear,
      month: c.month,
      amount: toDecimalString(c.amount as number),
      notes: null,
      createdAt: now,
      updatedAt: now,
    }));
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.budgets)
      .where(
        and(
          eq(schema.budgets.fiscalYear, fiscalYear),
          isNotNull(schema.budgets.month),
        ),
      );
    if (rows.length > 0) {
      await tx.insert(schema.budgets).values(rows);
    }
  });
  await logAuditEvent(user, {
    action: "budget.set",
    resourceType: "budget",
    resourceId: String(fiscalYear),
    resourceName: `FY${fiscalYear} monthly budgets`,
    changes: { after: { cells: rows.length } },
  });
}

// --------- Dashboard preferences ---------

/** Save the caller's OWN dashboard widget visibility. No extra permission
 *  — every signed-in user may customize their dashboard. */
export async function saveDashboardPrefs(user: SessionUser, hidden: string[]) {
  const db = getDb();
  await db
    .update(schema.users)
    .set({ dashboardPrefs: { hidden: hidden.slice(0, 50) } })
    .where(eq(schema.users.id, user.userId));
}

// --------- Variance notes ---------

export type VarianceNoteKey = {
  fiscalYear: number;
  month: number;
  mode: "monthly" | "ytd";
  compare: "budget" | "prior_year";
  accountId: string;
};

/**
 * Upsert one variance explanation. AI regeneration passes source='ai' and
 * must not clobber accountant edits — set `preserveUserEdits` so an
 * existing source='user' row wins.
 */
export async function upsertVarianceNote(
  user: SessionUser,
  key: VarianceNoteKey,
  note: string,
  source: "ai" | "user",
  opts: { preserveUserEdits?: boolean } = {},
) {
  requirePermission(user, "bill.update");
  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.varianceNotes)
    .where(
      and(
        eq(schema.varianceNotes.fiscalYear, key.fiscalYear),
        eq(schema.varianceNotes.month, key.month),
        eq(schema.varianceNotes.mode, key.mode),
        eq(schema.varianceNotes.compare, key.compare),
        eq(schema.varianceNotes.accountId, key.accountId),
      ),
    )
    .limit(1);
  if (existing) {
    if (opts.preserveUserEdits && existing.source === "user") return existing;
    const [updated] = await db
      .update(schema.varianceNotes)
      .set({ note, source, updatedBy: user.userId, updatedAt: new Date() })
      .where(eq(schema.varianceNotes.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(schema.varianceNotes)
    .values({
      id: uid("vn"),
      fiscalYear: key.fiscalYear,
      month: key.month,
      mode: key.mode,
      compare: key.compare,
      accountId: key.accountId,
      note,
      source,
      updatedBy: user.userId,
    })
    .returning();
  return created;
}

// --------- Bank accounts + signers ---------

/** Last four characters of an account number, for masked list display. */
function deriveLastFour(accountNumber: string | null | undefined): string | null {
  const cleaned = (accountNumber ?? "").replace(/[^0-9A-Za-z]/g, "");
  return cleaned.length >= 4 ? cleaned.slice(-4) : cleaned || null;
}

export type CreateBankAccountInput = {
  name: string;
  /** GL account — required for firm accounts; optional when the account
   *  belongs to a client/entity (their money, not firm ledger). */
  accountId?: string | null;
  institution?: string | null;
  accountType?: string | null;
  swiftBic?: string | null;
  iban?: string | null;
  bankAddress?: string | null;
  bankCountry?: string | null;
  /** Full account number — stored whole, always DISPLAYED masked. */
  accountNumber?: string | null;
  /** ABA routing number. */
  routingNumber?: string | null;
  lastFour?: string | null;
  currencyCode?: string;
  entityId?: string | null;
  clientId?: string | null;
  currentBalance?: number | null;
  balanceAsOf?: string | null;
  /** 0–100 (percent). NULL = unspecified. */
  ownershipPercent?: number | null;
};

export async function createBankAccount(
  user: SessionUser,
  input: CreateBankAccountInput,
) {
  requirePermission(user, "settings.write");
  // Firm accounts must post somewhere in the GL; client/entity accounts
  // live on the client's side and may skip the link.
  if (!input.accountId && !input.entityId && !input.clientId) {
    throw new Error("Firm bank accounts need a GL account (or assign the account to a client/entity).");
  }
  const db = getDb();
  const id = uid("ba");
  const [created] = await db
    .insert(schema.bankAccounts)
    .values({
      id,
      name: input.name,
      accountId: input.accountId ?? null,
      institution: input.institution ?? null,
      accountType: input.accountType ?? null,
      swiftBic: input.swiftBic ?? null,
      iban: input.iban ?? null,
      bankAddress: input.bankAddress ?? null,
      bankCountry: input.bankCountry ?? null,
      accountNumber: input.accountNumber ?? null,
      routingNumber: input.routingNumber ?? null,
      // last_four stays derived from the full number when we have one so
      // masked list display never disagrees with the number on file.
      lastFour: input.accountNumber
        ? deriveLastFour(input.accountNumber)
        : (input.lastFour ?? null),
      currencyCode: input.currencyCode ?? "USD",
      isActive: true,
      entityId: input.entityId ?? null,
      clientId: input.clientId ?? null,
      currentBalance:
        input.currentBalance == null ? null : toDecimalString(input.currentBalance),
      balanceAsOf: input.balanceAsOf ?? null,
      ownershipPercent:
        input.ownershipPercent == null
          ? null
          : toDecimalString(input.ownershipPercent),
    })
    .returning();
  return created;
}

export type UpdateBankAccountInput = Partial<CreateBankAccountInput> & {
  isActive?: boolean;
};

export async function updateBankAccount(
  user: SessionUser,
  id: string,
  input: UpdateBankAccountInput,
) {
  requirePermission(user, "settings.write");
  const db = getDb();
  const [updated] = await db
    .update(schema.bankAccounts)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.accountId !== undefined && { accountId: input.accountId }),
      ...(input.institution !== undefined && { institution: input.institution }),
      ...(input.accountType !== undefined && { accountType: input.accountType }),
      ...(input.swiftBic !== undefined && { swiftBic: input.swiftBic }),
      ...(input.iban !== undefined && { iban: input.iban }),
      ...(input.bankAddress !== undefined && { bankAddress: input.bankAddress }),
      ...(input.bankCountry !== undefined && { bankCountry: input.bankCountry }),
      // A new full number re-derives last_four; otherwise honor an explicit
      // lastFour edit (legacy rows that only ever stored the last four).
      ...(input.accountNumber !== undefined && {
        accountNumber: input.accountNumber,
        lastFour: deriveLastFour(input.accountNumber),
      }),
      ...(input.routingNumber !== undefined && { routingNumber: input.routingNumber }),
      ...(input.accountNumber === undefined &&
        input.lastFour !== undefined && { lastFour: input.lastFour }),
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
      ...(input.ownershipPercent !== undefined && {
        ownershipPercent:
          input.ownershipPercent == null
            ? null
            : toDecimalString(input.ownershipPercent),
      }),
    })
    .where(eq(schema.bankAccounts.id, id))
    .returning();
  if (!updated) throw new Error("Bank account not found.");
  return updated;
}

export async function deleteBankAccount(user: SessionUser, id: string) {
  requirePermission(user, "settings.write");
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

export async function createSigner(user: SessionUser, input: CreateSignerInput) {
  requirePermission(user, "settings.write");
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

export async function deleteSigner(user: SessionUser, id: string) {
  requirePermission(user, "settings.write");
  const db = getDb();
  await db.delete(schema.bankAccountSigners).where(eq(schema.bankAccountSigners.id, id));
}

// --------- Reconciliation ---------

export async function reconcileTransaction(
  user: SessionUser,
  txId: string,
  journalEntryId: string | null,
) {
  requirePermission(user, "bank.reconcile");
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

// --------- Bank transactions: manual entry + statement import ---------

export type CreateBankTransactionInput = {
  bankAccountId: string;
  transactionDate: string;
  description: string;
  /** Signed: deposits positive, outflows negative (matches seed + imports). */
  amount: number;
  reference?: string | null;
};

export async function createBankTransaction(
  user: SessionUser,
  input: CreateBankTransactionInput,
) {
  requirePermission(user, "bank.create_transaction");
  if (!input.transactionDate) throw new Error("Transaction date is required.");
  if (!input.description.trim()) throw new Error("Description is required.");
  if (!Number.isFinite(input.amount) || input.amount === 0) {
    throw new Error("Amount must be a non-zero number.");
  }
  const db = getDb();
  const [ba] = await db
    .select({ id: schema.bankAccounts.id, name: schema.bankAccounts.name })
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.id, input.bankAccountId))
    .limit(1);
  if (!ba) throw new Error("Bank account not found.");

  const id = uid("bt");
  const [created] = await db
    .insert(schema.bankTransactions)
    .values({
      id,
      bankAccountId: input.bankAccountId,
      transactionDate: input.transactionDate,
      description: input.description.trim(),
      amount: toDecimalString(input.amount),
      reference: input.reference?.trim() || null,
      isReconciled: false,
      source: "manual",
    })
    .returning();

  await logAuditEvent(user, {
    action: "bank_transaction.create",
    resourceType: "bank_transaction",
    resourceId: id,
    resourceName: `${ba.name} ${input.transactionDate}`,
    changes: { after: { amount: toDecimalString(input.amount), source: "manual" } },
  });
  return created;
}

/** Dedupe key for statement rows: date|amount|reference-or-description. */
function statementDedupeKey(
  transactionDate: string,
  amount: string,
  reference: string | null,
  description: string,
): string {
  const tail = (reference ?? "").trim() || description.trim();
  return `${transactionDate}|${toDecimalString(parseAmount(amount))}|${tail.toLowerCase()}`;
}

export type ImportBankStatementInput = {
  bankAccountId: string;
  fileName: string;
  rows: Array<{
    transactionDate: string;
    description: string;
    /** Signed: deposits positive, outflows negative. */
    amount: number;
    reference: string | null;
  }>;
  notes?: string | null;
};

/**
 * Import a parsed bank-statement CSV. Rows that already exist for the
 * account — same (date, amount, reference-or-description) — are skipped
 * as duplicates, so re-importing an overlapping statement is safe. One
 * statement_imports row records provenance + dedupe stats; created
 * transactions get source='import' and point back at the batch.
 */
export async function importBankStatement(
  user: SessionUser,
  input: ImportBankStatementInput,
) {
  requirePermission(user, "bank.import");
  if (input.rows.length === 0) throw new Error("Nothing to import.");
  const db = getDb();
  const [ba] = await db
    .select({ id: schema.bankAccounts.id, name: schema.bankAccounts.name })
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.id, input.bankAccountId))
    .limit(1);
  if (!ba) throw new Error("Bank account not found.");

  const existing = await db
    .select({
      transactionDate: schema.bankTransactions.transactionDate,
      amount: schema.bankTransactions.amount,
      reference: schema.bankTransactions.reference,
      description: schema.bankTransactions.description,
    })
    .from(schema.bankTransactions)
    .where(eq(schema.bankTransactions.bankAccountId, input.bankAccountId));
  // Dedupe with MULTIPLICITY against what's already in the DB: each
  // existing row absorbs at most one incoming row with the same key, so a
  // statement that legitimately contains two identical lines (same day,
  // same amount, no reference) imports both — only true re-import overlap
  // is skipped.
  const existingCounts = new Map<string, number>();
  for (const t of existing) {
    const key = statementDedupeKey(
      t.transactionDate,
      t.amount,
      t.reference,
      t.description,
    );
    existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
  }

  const importId = uid("si");
  type NewTx = typeof schema.bankTransactions.$inferInsert;
  const inserts: NewTx[] = [];
  let duplicateCount = 0;
  for (const row of input.rows) {
    const amountStr = toDecimalString(row.amount);
    const key = statementDedupeKey(
      row.transactionDate,
      amountStr,
      row.reference,
      row.description,
    );
    const remaining = existingCounts.get(key) ?? 0;
    if (remaining > 0) {
      existingCounts.set(key, remaining - 1);
      duplicateCount += 1;
      continue;
    }
    inserts.push({
      id: uid("bt"),
      bankAccountId: input.bankAccountId,
      transactionDate: row.transactionDate,
      description: row.description,
      amount: amountStr,
      reference: row.reference,
      isReconciled: false,
      source: "import",
      statementImportId: importId,
    });
  }

  await db.transaction(async (tx) => {
    await tx.insert(schema.statementImports).values({
      id: importId,
      bankAccountId: input.bankAccountId,
      fileName: input.fileName,
      importedBy: user.userId,
      rowCount: inserts.length,
      duplicateCount,
      notes: input.notes ?? null,
    });
    if (inserts.length > 0) {
      await tx.insert(schema.bankTransactions).values(inserts);
    }
  });

  await logAuditEvent(user, {
    action: "bank.import_statement",
    resourceType: "statement_import",
    resourceId: importId,
    resourceName: input.fileName,
    metadata: {
      bankAccountId: input.bankAccountId,
      imported: inserts.length,
      duplicates: duplicateCount,
    },
  });
  return { importId, imported: inserts.length, duplicates: duplicateCount };
}

// --------- Reconciliation sessions ---------

export type StartReconciliationSessionInput = {
  bankAccountId: string;
  statementDate: string;
  statementEndingBalance: number;
  notes?: string | null;
};

export async function startReconciliationSession(
  user: SessionUser,
  input: StartReconciliationSessionInput,
) {
  requirePermission(user, "bank.reconcile");
  if (!input.statementDate) throw new Error("Statement date is required.");
  if (!Number.isFinite(input.statementEndingBalance)) {
    throw new Error("Statement ending balance is required.");
  }
  const db = getDb();
  const [ba] = await db
    .select({
      id: schema.bankAccounts.id,
      name: schema.bankAccounts.name,
      accountId: schema.bankAccounts.accountId,
    })
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.id, input.bankAccountId))
    .limit(1);
  if (!ba) throw new Error("Bank account not found.");
  // Client/entity-owned accounts have no GL link and never post to the
  // firm ledger — there's nothing to reconcile against.
  if (!ba.accountId) {
    throw new Error(
      "Only GL-linked firm bank accounts can be reconciled. This account has no GL link.",
    );
  }
  const [open] = await db
    .select({ id: schema.reconciliationSessions.id })
    .from(schema.reconciliationSessions)
    .where(
      and(
        eq(schema.reconciliationSessions.bankAccountId, input.bankAccountId),
        eq(schema.reconciliationSessions.status, "in_progress"),
      ),
    )
    .limit(1);
  if (open) {
    throw new Error(
      "An in-progress reconciliation already exists for this account. Complete or void it first.",
    );
  }

  const id = uid("rs");
  const [created] = await db
    .insert(schema.reconciliationSessions)
    .values({
      id,
      bankAccountId: input.bankAccountId,
      statementDate: input.statementDate,
      statementEndingBalance: toDecimalString(input.statementEndingBalance),
      status: "in_progress",
      startedBy: user.userId,
      notes: input.notes ?? null,
    })
    .returning();

  await logAuditEvent(user, {
    action: "reconciliation.start",
    resourceType: "reconciliation_session",
    resourceId: id,
    resourceName: `${ba.name} @ ${input.statementDate}`,
    metadata: {
      statementEndingBalance: toDecimalString(input.statementEndingBalance),
    },
  });
  return created;
}

async function getOpenSession(sessionId: string) {
  const db = getDb();
  const [session] = await db
    .select()
    .from(schema.reconciliationSessions)
    .where(eq(schema.reconciliationSessions.id, sessionId))
    .limit(1);
  if (!session) throw new Error("Reconciliation session not found.");
  if (session.status !== "in_progress") {
    throw new Error(`Session is ${session.status} — only in-progress sessions can change.`);
  }
  return session;
}

/**
 * Clear (or unclear) one bank transaction inside a session. Clearing sets
 * is_reconciled + reconciled_at + reconciliation_session_id; unclearing
 * nulls them (and any journal match stamped inside this session).
 */
export async function setReconciliationCleared(
  user: SessionUser,
  input: { sessionId: string; transactionId: string; cleared: boolean },
) {
  requirePermission(user, "bank.reconcile");
  const db = getDb();
  const session = await getOpenSession(input.sessionId);
  const [tx] = await db
    .select()
    .from(schema.bankTransactions)
    .where(eq(schema.bankTransactions.id, input.transactionId))
    .limit(1);
  if (!tx) throw new Error("Transaction not found.");
  if (tx.bankAccountId !== session.bankAccountId) {
    throw new Error("Transaction belongs to a different bank account.");
  }

  if (input.cleared) {
    if (tx.isReconciled) return tx; // idempotent
    if (tx.transactionDate > session.statementDate) {
      throw new Error(
        `Transaction is dated after the statement date (${session.statementDate}).`,
      );
    }
    await db
      .update(schema.bankTransactions)
      .set({
        isReconciled: true,
        reconciledAt: new Date(),
        reconciliationSessionId: session.id,
      })
      .where(eq(schema.bankTransactions.id, tx.id));
  } else {
    if (tx.reconciliationSessionId !== session.id) {
      throw new Error("Transaction was not cleared in this session.");
    }
    await db
      .update(schema.bankTransactions)
      .set({
        isReconciled: false,
        reconciledAt: null,
        reconciliationSessionId: null,
        journalEntryId: null,
      })
      .where(eq(schema.bankTransactions.id, tx.id));
  }
  return { ...tx, isReconciled: input.cleared };
}

/**
 * Accept an auto-match suggestion: stamp the journal entry onto the bank
 * transaction and clear it into the session in one step.
 */
export async function acceptReconciliationMatch(
  user: SessionUser,
  input: { sessionId: string; transactionId: string; journalEntryId: string },
) {
  requirePermission(user, "bank.reconcile");
  const db = getDb();
  const session = await getOpenSession(input.sessionId);
  const [tx] = await db
    .select()
    .from(schema.bankTransactions)
    .where(eq(schema.bankTransactions.id, input.transactionId))
    .limit(1);
  if (!tx) throw new Error("Transaction not found.");
  if (tx.bankAccountId !== session.bankAccountId) {
    throw new Error("Transaction belongs to a different bank account.");
  }
  if (tx.isReconciled) throw new Error("Transaction is already cleared.");
  const [je] = await db
    .select({
      id: schema.journalEntries.id,
      status: schema.journalEntries.status,
      entryNumber: schema.journalEntries.entryNumber,
    })
    .from(schema.journalEntries)
    .where(eq(schema.journalEntries.id, input.journalEntryId))
    .limit(1);
  if (!je) throw new Error("Journal entry not found.");
  if (je.status !== "posted") throw new Error("Only posted journal entries can be matched.");

  // One journal entry explains at most one bank transaction — reject if
  // some other transaction already carries this match (e.g. a stale page
  // or a second tab accepted the same suggestion first).
  const [alreadyMatched] = await db
    .select({ id: schema.bankTransactions.id })
    .from(schema.bankTransactions)
    .where(
      and(
        eq(schema.bankTransactions.journalEntryId, je.id),
        ne(schema.bankTransactions.id, tx.id),
      ),
    )
    .limit(1);
  if (alreadyMatched) {
    throw new Error(
      `${je.entryNumber} is already matched to another bank transaction.`,
    );
  }

  // Recompute the match server-side rather than trusting the form: the
  // entry must have a line on this account's GL link whose signed amount
  // (debit positive — cash is debit-normal) equals the bank amount.
  const [ba] = await db
    .select({ accountId: schema.bankAccounts.accountId })
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.id, session.bankAccountId))
    .limit(1);
  if (!ba?.accountId) {
    throw new Error("This bank account has no GL link — nothing to match against.");
  }
  const lines = await db
    .select({
      debit: schema.journalLines.debit,
      credit: schema.journalLines.credit,
    })
    .from(schema.journalLines)
    .where(
      and(
        eq(schema.journalLines.journalEntryId, je.id),
        eq(schema.journalLines.accountId, ba.accountId),
      ),
    );
  const txAmount = parseAmount(tx.amount);
  const hasMatchingLine = lines.some((l) => {
    const debit = parseAmount(l.debit);
    const signed = debit > 0 ? debit : -parseAmount(l.credit);
    return Math.abs(signed - txAmount) < 0.005;
  });
  if (!hasMatchingLine) {
    throw new Error(
      `${je.entryNumber} has no line on this account's GL link for ${txAmount.toFixed(2)} — it cannot be matched to this transaction.`,
    );
  }

  await db
    .update(schema.bankTransactions)
    .set({
      journalEntryId: je.id,
      isReconciled: true,
      reconciledAt: new Date(),
      reconciliationSessionId: session.id,
    })
    .where(eq(schema.bankTransactions.id, tx.id));

  await logAuditEvent(user, {
    action: "reconciliation.match",
    resourceType: "bank_transaction",
    resourceId: tx.id,
    resourceName: tx.description,
    metadata: { sessionId: session.id, journalEntryId: je.id, entryNumber: je.entryNumber },
  });
  return { transactionId: tx.id, journalEntryId: je.id };
}

/** Complete a session — allowed only when
 *  statement ending − opening anchor − cleared is exactly 0.00.
 *  (Anchor + counting rules live in src/lib/reconciliation.ts, shared with
 *  the session page so screen and server always agree.) */
export async function completeReconciliationSession(
  user: SessionUser,
  sessionId: string,
) {
  requirePermission(user, "bank.reconcile");
  const db = getDb();
  const session = await getOpenSession(sessionId);
  const allSessions = await db
    .select({
      id: schema.reconciliationSessions.id,
      bankAccountId: schema.reconciliationSessions.bankAccountId,
      statementDate: schema.reconciliationSessions.statementDate,
      statementEndingBalance: schema.reconciliationSessions.statementEndingBalance,
      status: schema.reconciliationSessions.status,
    })
    .from(schema.reconciliationSessions)
    .where(eq(schema.reconciliationSessions.bankAccountId, session.bankAccountId));
  const anchor = findOpeningAnchor(session, allSessions);
  const txs = await db
    .select({
      transactionDate: schema.bankTransactions.transactionDate,
      amount: schema.bankTransactions.amount,
      isReconciled: schema.bankTransactions.isReconciled,
      reconciliationSessionId: schema.bankTransactions.reconciliationSessionId,
    })
    .from(schema.bankTransactions)
    .where(
      and(
        eq(schema.bankTransactions.bankAccountId, session.bankAccountId),
        eq(schema.bankTransactions.isReconciled, true),
        lte(schema.bankTransactions.transactionDate, session.statementDate),
      ),
    );
  const cleared = computeClearedTotal(txs, session, anchor.anchorDate);
  const difference =
    parseAmount(session.statementEndingBalance) - anchor.openingBalance - cleared;
  if (Math.abs(difference) >= 0.005) {
    throw new Error(
      `Cannot complete: difference is ${difference.toFixed(2)} — it must be exactly 0.00. Clear or add the missing transactions first.`,
    );
  }
  const now = new Date();
  const [updated] = await db
    .update(schema.reconciliationSessions)
    .set({ status: "completed", completedBy: user.userId, completedAt: now })
    .where(eq(schema.reconciliationSessions.id, sessionId))
    .returning();

  await logAuditEvent(user, {
    action: "reconciliation.complete",
    resourceType: "reconciliation_session",
    resourceId: sessionId,
    resourceName: `${session.bankAccountId} @ ${session.statementDate}`,
    metadata: {
      statementEndingBalance: session.statementEndingBalance,
      openingBalance: toDecimalString(anchor.openingBalance),
      clearedTotal: toDecimalString(cleared),
    },
  });
  return updated;
}

/** Void a session and return every transaction it cleared to unreconciled. */
export async function voidReconciliationSession(
  user: SessionUser,
  sessionId: string,
) {
  requirePermission(user, "bank.reconcile");
  const db = getDb();
  const [session] = await db
    .select()
    .from(schema.reconciliationSessions)
    .where(eq(schema.reconciliationSessions.id, sessionId))
    .limit(1);
  if (!session) throw new Error("Reconciliation session not found.");
  if (session.status === "void") return session;

  await db.transaction(async (tx) => {
    await tx
      .update(schema.bankTransactions)
      .set({
        isReconciled: false,
        reconciledAt: null,
        reconciliationSessionId: null,
        journalEntryId: null,
      })
      .where(eq(schema.bankTransactions.reconciliationSessionId, sessionId));
    await tx
      .update(schema.reconciliationSessions)
      .set({ status: "void" })
      .where(eq(schema.reconciliationSessions.id, sessionId));
  });

  await logAuditEvent(user, {
    action: "reconciliation.void",
    resourceType: "reconciliation_session",
    resourceId: sessionId,
    resourceName: `${session.bankAccountId} @ ${session.statementDate}`,
    changes: { before: { status: session.status }, after: { status: "void" } },
  });
  return { ...session, status: "void" };
}

// --------- Dual-control payment runs ---------

export async function nextPaymentRunNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const db = getDb();
  const [row] = await db
    .select({ runNumber: schema.paymentRuns.runNumber })
    .from(schema.paymentRuns)
    .orderBy(desc(schema.paymentRuns.runNumber))
    .limit(1);
  const n = parseTrailingInt(row?.runNumber) + 1;
  return `PR-${year}-${pad(n, 3)}`;
}

export type PreparePaymentRunInput = {
  billIds: string[];
  bankAccountId: string;
  /** Preparer's intended payment date — recorded in notes for the releaser.
   *  The actual JE date is the release date (money moves at release). */
  requestedPaymentDate?: string | null;
  notes?: string | null;
};

/**
 * Stage a payment run: snapshot the selected bills' balances into
 * payment_run_items and park the batch as pending_release. NO money moves
 * and NO journal entries post here — that happens in `releasePaymentRun`,
 * which a DIFFERENT user must execute (dual control).
 */
export async function preparePaymentRun(
  user: SessionUser,
  input: PreparePaymentRunInput,
) {
  requirePermission(user, "bank.create_transaction");
  const db = getDb();
  if (input.billIds.length === 0) {
    throw new Error("Pick at least one bill to pay.");
  }
  const [ba] = await db
    .select({
      id: schema.bankAccounts.id,
      name: schema.bankAccounts.name,
      accountId: schema.bankAccounts.accountId,
      entityId: schema.bankAccounts.entityId,
      clientId: schema.bankAccounts.clientId,
      currencyCode: schema.bankAccounts.currencyCode,
    })
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.id, input.bankAccountId))
    .limit(1);
  if (!ba) throw new Error("Funding bank account not found.");
  // Same invariant reconciliation enforces: client/entity-owned accounts
  // never post to the firm ledger, so they can't fund firm bill payments.
  if (ba.entityId || ba.clientId || !ba.accountId) {
    throw new Error(
      "Payment runs must be funded from a GL-linked firm bank account — client/entity accounts never post to the firm ledger.",
    );
  }

  const bills = await db
    .select()
    .from(schema.bills)
    .where(inArray(schema.bills.id, input.billIds));
  const payable = bills.filter(
    (b) =>
      parseAmount(b.balanceDue) > 0 &&
      b.status !== "draft" &&
      b.status !== "void" &&
      b.status !== "paid",
  );
  if (payable.length === 0) {
    throw new Error("None of the selected bills are payable.");
  }
  // The run total and the bank payment file are denominated in the funding
  // account's currency — a native-currency bill amount must not be stamped
  // with a different currency code.
  const offCurrency = payable.filter((b) => b.currencyCode !== ba.currencyCode);
  if (offCurrency.length > 0) {
    throw new Error(
      `Currency mismatch: ${offCurrency
        .map((b) => `${b.billNumber} (${b.currencyCode})`)
        .join(", ")} cannot be paid from a ${ba.currencyCode} account.`,
    );
  }

  const total = payable.reduce((s, b) => s + parseAmount(b.balanceDue), 0);
  const runNumber = await nextPaymentRunNumber();
  const id = uid("pr");
  const now = new Date();
  const noteParts: string[] = [];
  if (input.requestedPaymentDate) {
    noteParts.push(`Requested payment date: ${input.requestedPaymentDate}`);
  }
  if (input.notes) noteParts.push(input.notes);

  await db.transaction(async (tx) => {
    await tx.insert(schema.paymentRuns).values({
      id,
      runNumber,
      bankAccountId: input.bankAccountId,
      status: "pending_release",
      preparedBy: user.userId,
      preparedAt: now,
      total: toDecimalString(total),
      itemCount: payable.length,
      notes: noteParts.length > 0 ? noteParts.join("\n") : null,
    });
    await tx.insert(schema.paymentRunItems).values(
      payable.map((b, i) => ({
        id: `${id}-i${i + 1}`,
        paymentRunId: id,
        billId: b.id,
        amount: b.balanceDue,
        status: "pending",
      })),
    );
  });

  await logAuditEvent(user, {
    action: "payment_run.prepare",
    resourceType: "payment_run",
    resourceId: id,
    resourceName: runNumber,
    metadata: {
      bankAccountId: input.bankAccountId,
      itemCount: payable.length,
      total: toDecimalString(total),
    },
  });
  return { id, runNumber, itemCount: payable.length, total };
}

/**
 * Dual-control release: a user with payment.release — who is NOT the
 * preparer — executes every pending item through the same bill-payment
 * posting logic direct payments use. Items whose bill has since been
 * paid/voided are marked skipped rather than failing the whole run.
 */
export async function releasePaymentRun(user: SessionUser, runId: string) {
  requirePermission(user, "payment.release");
  const db = getDb();
  const [run] = await db
    .select()
    .from(schema.paymentRuns)
    .where(eq(schema.paymentRuns.id, runId))
    .limit(1);
  if (!run) throw new Error("Payment run not found.");
  if (run.status !== "pending_release") {
    throw new Error(`Only pending-release runs can be released (this run is ${run.status}).`);
  }
  if (run.preparedBy && run.preparedBy === user.userId) {
    throw new Error(
      "Dual control: the user who prepared a payment run cannot release it. A second authorized user must release.",
    );
  }

  const items = await db
    .select()
    .from(schema.paymentRunItems)
    .where(eq(schema.paymentRunItems.paymentRunId, runId))
    .orderBy(asc(schema.paymentRunItems.id));

  // Stamp the releaser BEFORE money moves: if the loop below fails partway
  // (items 1..k posted), the run still records who released. The status
  // stays pending_release until every item lands, and voidPaymentRun
  // refuses to void a run with posted items, so a partial release can be
  // retried but never disguised as an untouched batch.
  const now = new Date();
  await db
    .update(schema.paymentRuns)
    .set({ releasedBy: user.userId, releasedAt: now })
    .where(eq(schema.paymentRuns.id, runId));

  // Money moves now — the JE date is the release date.
  const paymentDate = new Date().toISOString().slice(0, 10);
  let paid = 0;
  let skipped = 0;
  let paidTotal = 0;
  for (const item of items) {
    if (item.status !== "pending") {
      if (item.status === "paid") paidTotal += parseAmount(item.amount);
      continue;
    }
    const [bill] = await db
      .select()
      .from(schema.bills)
      .where(eq(schema.bills.id, item.billId))
      .limit(1);
    const balance = bill ? parseAmount(bill.balanceDue) : 0;
    const amount = Math.min(parseAmount(item.amount), balance);
    const payableStatus =
      bill && bill.status !== "draft" && bill.status !== "void" && bill.status !== "paid";
    if (!bill || !payableStatus || amount <= 0) {
      await db
        .update(schema.paymentRunItems)
        .set({ status: "skipped" })
        .where(eq(schema.paymentRunItems.id, item.id));
      skipped += 1;
      continue;
    }
    const result = await postBillPayment(user, {
      billId: bill.id,
      amount,
      paymentDate,
      bankAccountId: run.bankAccountId,
      reference: `${run.runNumber} ${bill.billNumber}`,
    });
    // Write the ACTUALLY POSTED amount back to the item — it can be lower
    // than the staged snapshot if the bill was partially paid between
    // prepare and release. The payment file and run detail must show what
    // posted, not the stale snapshot.
    await db
      .update(schema.paymentRunItems)
      .set({
        status: "paid",
        journalEntryId: result.journalEntryId,
        amount: toDecimalString(amount),
      })
      .where(eq(schema.paymentRunItems.id, item.id));
    paid += 1;
    paidTotal += amount;
  }

  await db
    .update(schema.paymentRuns)
    .set({
      status: "released",
      releasedBy: user.userId,
      releasedAt: now,
      // Run total = what actually posted (skipped items contribute 0).
      total: toDecimalString(paidTotal),
    })
    .where(eq(schema.paymentRuns.id, runId));

  await logAuditEvent(user, {
    action: "payment_run.release",
    resourceType: "payment_run",
    resourceId: runId,
    resourceName: run.runNumber,
    changes: { before: { status: "pending_release" }, after: { status: "released" } },
    metadata: { paid, skipped, paymentDate },
  });
  return { runId, runNumber: run.runNumber, paid, skipped };
}

/** Void a prepared run before release. Nothing was posted, so this just
 *  cancels the staging rows. The preparer may cancel their own run; anyone
 *  else needs payment.release. */
export async function voidPaymentRun(user: SessionUser, runId: string) {
  const db = getDb();
  const [run] = await db
    .select()
    .from(schema.paymentRuns)
    .where(eq(schema.paymentRuns.id, runId))
    .limit(1);
  if (!run) throw new Error("Payment run not found.");
  if (run.preparedBy === user.userId) {
    requirePermission(user, "bank.create_transaction");
  } else {
    requirePermission(user, "payment.release");
  }
  if (run.status !== "pending_release") {
    throw new Error(`Only pending-release runs can be voided (this run is ${run.status}).`);
  }
  // A partially-released run (release failed mid-loop) still carries posted
  // journal entries — voiding it would bury money that already moved.
  const items = await db
    .select({
      status: schema.paymentRunItems.status,
      journalEntryId: schema.paymentRunItems.journalEntryId,
    })
    .from(schema.paymentRunItems)
    .where(eq(schema.paymentRunItems.paymentRunId, runId));
  const posted = items.filter((i) => i.status === "paid" || i.journalEntryId != null);
  if (posted.length > 0) {
    throw new Error(
      `Cannot void: ${posted.length} payment${posted.length === 1 ? " has" : "s have"} already posted from this run. Finish releasing it instead.`,
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.paymentRunItems)
      .set({ status: "skipped" })
      .where(
        and(
          eq(schema.paymentRunItems.paymentRunId, runId),
          eq(schema.paymentRunItems.status, "pending"),
        ),
      );
    await tx
      .update(schema.paymentRuns)
      .set({ status: "void" })
      .where(eq(schema.paymentRuns.id, runId));
  });

  await logAuditEvent(user, {
    action: "payment_run.void",
    resourceType: "payment_run",
    resourceId: runId,
    resourceName: run.runNumber,
    changes: { before: { status: run.status }, after: { status: "void" } },
  });
  return { ...run, status: "void" };
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
  user: SessionUser,
  id: string,
  input: UpdateEntityFeeBillingInput,
) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  input: CreateRecurringPaymentInput,
) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  id: string,
  input: UpdateRecurringPaymentInput,
) {
  requirePermission(user, "settings.write");
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

export async function deleteRecurringPayment(user: SessionUser, id: string) {
  requirePermission(user, "settings.write");
  const db = getDb();
  await db.delete(schema.recurringPayments).where(eq(schema.recurringPayments.id, id));
}

export async function setInvoiceExpectedPaymentDate(
  user: SessionUser,
  invoiceId: string,
  expectedPaymentDate: string | null,
) {
  requirePermission(user, "invoice.update");

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
  user: SessionUser,
  input: CreateRegionGroupInput,
) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  id: string,
  patch: Partial<CreateRegionGroupInput>,
) {
  requirePermission(user, "settings.write");
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.notes !== undefined) set.notes = patch.notes ?? null;
  await db.update(schema.regionGroups).set(set).where(eq(schema.regionGroups.id, id));
}

export async function deleteRegionGroup(user: SessionUser, id: string) {
  requirePermission(user, "settings.write");
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

export async function createRegion(user: SessionUser, input: CreateRegionInput) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  id: string,
  patch: Partial<CreateRegionInput>,
) {
  requirePermission(user, "settings.write");
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.groupId !== undefined) set.groupId = patch.groupId ?? null;
  if (patch.notes !== undefined) set.notes = patch.notes ?? null;
  await db.update(schema.regions).set(set).where(eq(schema.regions.id, id));
}

export async function deleteRegion(user: SessionUser, id: string) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  officeId: string,
  regionId: string | null,
) {
  requirePermission(user, "settings.write");
  const db = getDb();
  await db
    .update(schema.offices)
    .set({ regionId, updatedAt: new Date() })
    .where(eq(schema.offices.id, officeId));
}

export async function setEntityRegion(
  user: SessionUser,
  entityId: string,
  regionId: string | null,
) {
  requirePermission(user, "settings.write");
  const db = getDb();
  await db
    .update(schema.entities)
    .set({ regionId, updatedAt: new Date() })
    .where(eq(schema.entities.id, entityId));
}

export async function setCustomerRegion(
  user: SessionUser,
  customerId: string,
  regionId: string | null,
) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  input: CreateDimensionInput,
) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  id: string,
  patch: Partial<Pick<CreateDimensionInput, "label" | "description"> & { isActive: boolean }>,
) {
  requirePermission(user, "settings.write");
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.label !== undefined) set.label = patch.label;
  if (patch.description !== undefined) set.description = patch.description ?? null;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  await db.update(schema.dimensions).set(set).where(eq(schema.dimensions.id, id));
}

export async function deleteDimension(user: SessionUser, id: string) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  input: CreateDimensionValueInput,
) {
  requirePermission(user, "settings.write");
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
  user: SessionUser,
  id: string,
  patch: Partial<Pick<CreateDimensionValueInput, "code" | "label" | "parentId"> & { isActive: boolean }>,
) {
  requirePermission(user, "settings.write");
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.code !== undefined) set.code = patch.code;
  if (patch.label !== undefined) set.label = patch.label;
  if (patch.parentId !== undefined) set.parentId = patch.parentId ?? null;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  await db.update(schema.dimensionValues).set(set).where(eq(schema.dimensionValues.id, id));
}

export async function deleteDimensionValue(user: SessionUser, id: string) {
  requirePermission(user, "settings.write");
  const db = getDb();
  await db
    .update(schema.dimensionValues)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(schema.dimensionValues.id, id));
}

// --------- Periods ---------

export async function setPeriodStatus(
  user: SessionUser,
  periodId: string,
  status: "open" | "closed",
) {
  requirePermission(user, status === "closed" ? "period.close" : "period.reopen");
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

// --------- Journal-entry CSV import (staging) ---------

export type JournalCsvGroupInput = {
  /** Grouping key (Reference / Group value) — becomes the entry reference. */
  key: string;
  /** Entry date (YYYY-MM-DD). */
  date: string;
  lines: Array<{
    rowNo: number;
    accountToken: string;
    description: string | null;
    debit: number;
    credit: number;
    firmEntityToken: string | null;
  }>;
  /** Row-level parse errors already found for this group (bad date/amount). */
  parseErrors: string[];
};

export type JournalCsvGroupResult =
  | { key: string; ok: true; entryNumber: string; lineCount: number }
  | { key: string; ok: false; error: string };

/**
 * Stage parsed CSV groups as DRAFT manual journal entries. Each group is
 * validated independently — a bad group is reported and skipped without
 * aborting the rest of the file:
 *   - the group must have ≥ 2 usable lines with no parse errors
 *   - debits must equal credits to the cent
 *   - every account token must resolve (by code, then name)
 *   - the entry date must fall in an OPEN period (reuses checkPeriodForPost,
 *     the same gate createJournalEntry applies — closed/locked → rejected)
 * Valid groups land as status="draft", source="manual", so they flow
 * through the maker-checker approval path like any hand-keyed entry.
 */
export async function stageJournalEntriesFromCsv(
  user: SessionUser,
  groups: JournalCsvGroupInput[],
): Promise<{ results: JournalCsvGroupResult[]; staged: number; rejected: number }> {
  requirePermission(user, "journal_entry.create");
  const db = getDb();

  // Resolve accounts (firm-level chart) and firm entities once.
  const accountRows = await db
    .select({
      id: schema.accounts.id,
      code: schema.accounts.code,
      name: schema.accounts.name,
      isActive: schema.accounts.isActive,
    })
    .from(schema.accounts);
  const accountByCode = new Map<string, string>();
  const accountByName = new Map<string, string>();
  for (const a of accountRows) {
    if (!a.isActive) continue;
    accountByCode.set(a.code.toLowerCase(), a.id);
    accountByName.set(a.name.toLowerCase(), a.id);
  }
  function resolveAccount(token: string): string | null {
    const t = token.trim().toLowerCase();
    return accountByCode.get(t) ?? accountByName.get(t) ?? null;
  }

  const officeRows = await db
    .select({
      id: schema.offices.id,
      code: schema.offices.code,
      name: schema.offices.name,
    })
    .from(schema.offices);
  const officeById = new Map(officeRows.map((o) => [o.id, o.id] as const));
  const officeByCode = new Map(
    officeRows.map((o) => [o.code.toLowerCase(), o.id] as const),
  );
  const officeByName = new Map(
    officeRows.map((o) => [o.name.toLowerCase(), o.id] as const),
  );
  function resolveOffice(token: string): string | null {
    const t = token.trim().toLowerCase();
    return (
      officeById.get(token) ??
      officeByCode.get(t) ??
      officeByName.get(t) ??
      null
    );
  }

  const results: JournalCsvGroupResult[] = [];
  let staged = 0;
  let rejected = 0;

  for (const group of groups) {
    const reject = (error: string) => {
      results.push({ key: group.key, ok: false, error });
      rejected += 1;
    };

    if (group.parseErrors.length > 0) {
      reject(group.parseErrors.join(" "));
      continue;
    }
    if (group.lines.length < 2) {
      reject("Entry must have at least 2 lines.");
      continue;
    }
    if (!group.date) {
      reject("Entry has no valid date.");
      continue;
    }

    // Resolve all accounts + firm entities up front.
    const resolvedLines: DraftJournalLine[] = [];
    let firmEntityId: string | null = null;
    let firmError: string | null = null;
    let accountError: string | null = null;
    for (const l of group.lines) {
      const accountId = resolveAccount(l.accountToken);
      if (!accountId) {
        accountError = `Row ${l.rowNo}: account "${l.accountToken}" not found.`;
        break;
      }
      if (l.firmEntityToken) {
        const oid = resolveOffice(l.firmEntityToken);
        if (!oid) {
          firmError = `Row ${l.rowNo}: firm entity "${l.firmEntityToken}" not found.`;
          break;
        }
        // First firm entity seen drives the header; a divergent one is an error.
        if (firmEntityId == null) firmEntityId = oid;
        else if (firmEntityId !== oid) {
          firmError = `Row ${l.rowNo}: all lines of one entry must share the same firm entity.`;
          break;
        }
      }
      resolvedLines.push({
        accountId,
        description: l.description,
        debit: l.debit,
        credit: l.credit,
      });
    }
    if (accountError) {
      reject(accountError);
      continue;
    }
    if (firmError) {
      reject(firmError);
      continue;
    }

    // Balance to the cent.
    const dt = resolvedLines.reduce((s, l) => s + (l.debit ?? 0), 0);
    const ct = resolvedLines.reduce((s, l) => s + (l.credit ?? 0), 0);
    if (Math.abs(dt - ct) > 0.005) {
      reject(
        `Unbalanced: debits ${dt.toFixed(2)} ≠ credits ${ct.toFixed(2)}.`,
      );
      continue;
    }

    // Open-period gate — same check createJournalEntry runs on a draft.
    // A closed period needs an override reason (not supplied here) and a
    // locked period always throws; both surface as a per-group rejection.
    try {
      await checkPeriodForPost(group.date, null);
    } catch (err) {
      reject(stripPeriodErrorPrefix(err instanceof Error ? err.message : "Period is not open."));
      continue;
    }

    try {
      const created = await createJournalEntry(user, {
        entryDate: group.date,
        description: `Imported entry ${group.key}`,
        reference: group.key,
        source: "manual",
        status: "draft",
        firmEntityId,
        lines: resolvedLines,
      });
      results.push({
        key: group.key,
        ok: true,
        entryNumber: created.entryNumber,
        lineCount: resolvedLines.length,
      });
      staged += 1;
    } catch (err) {
      reject(
        stripPeriodErrorPrefix(err instanceof Error ? err.message : "Insert failed."),
      );
    }
  }

  await logAuditEvent(user, {
    action: "journal.csv_import",
    resourceType: "journal_entry",
    resourceId: "batch",
    metadata: { staged, rejected, groups: groups.length },
  });

  return { results, staged, rejected };
}

/**
 * Duplicate an invoice into a new draft. The clone keeps customer, lines,
 * notes (header notes only — append-only invoice_notes log is not copied),
 * and dimensions; it always gets a fresh invoice number and today's date,
 * with the due date offset by the original payment term gap.
 */
export async function duplicateInvoice(
  user: SessionUser,
  sourceId: string,
): Promise<{ id: string; invoiceNumber: string }> {
  requirePermission(user, "invoice.create");
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
 * Advance a yyyy-mm-dd date by one invoice-recurring step. Weekly/biweekly
 * shift by 7/14 days; monthly/quarterly/annually use `dayOfMonth` clamped
 * to the last day of the target month (so a day=31 template against
 * February doesn't overflow into March).
 */
export function advanceInvoiceRecurringDate(
  iso: string,
  frequency: InvoiceRecurringFrequency,
  dayOfMonth?: number | null,
): string {
  const [yStr, mStr, dStr] = iso.split("-");
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10);
  const d = parseInt(dStr, 10);
  if (frequency === "weekly" || frequency === "biweekly") {
    const ms = new Date(Date.UTC(y, m - 1, d)).getTime();
    const days = frequency === "weekly" ? 7 : 14;
    const next = new Date(ms + days * 24 * 60 * 60 * 1000);
    return next.toISOString().slice(0, 10);
  }
  let monthsToAdd = 1;
  if (frequency === "quarterly") monthsToAdd = 3;
  if (frequency === "annually") monthsToAdd = 12;
  m += monthsToAdd;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  const desiredDay = dayOfMonth ?? d;
  const lastDayOfMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const nd = Math.min(desiredDay, lastDayOfMonth);
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(nd, 2)}`;
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatPeriodDate(iso: string): string {
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  return `${MONTH_SHORT[m - 1]} ${d}, ${y}`;
}

/**
 * Compute the billing period that a generated recurring invoice represents,
 * given the new invoice's issue date and the template's frequency. For
 * monthly/quarterly/annually this is the *prior* period (e.g. an invoice
 * generated on Feb 1 monthly bills January 1–31). For weekly it's the
 * preceding 7-day window ending yesterday. Biweekly mirrors weekly but
 * over 14 days.
 */
export function computeBillingPeriod(
  issueDateIso: string,
  frequency: InvoiceRecurringFrequency,
): { start: string; end: string; label: string } {
  const [y, m, d] = issueDateIso.split("-").map((s) => parseInt(s, 10));
  if (frequency === "weekly" || frequency === "biweekly") {
    const days = frequency === "weekly" ? 7 : 14;
    const issueMs = Date.UTC(y, m - 1, d);
    const endMs = issueMs - 24 * 60 * 60 * 1000;
    const startMs = endMs - (days - 1) * 24 * 60 * 60 * 1000;
    const start = new Date(startMs).toISOString().slice(0, 10);
    const end = new Date(endMs).toISOString().slice(0, 10);
    return {
      start,
      end,
      label: `${formatPeriodDate(start)} – ${formatPeriodDate(end)}`,
    };
  }
  let priorMonth = m - 1;
  let priorYear = y;
  let monthsBack = 1;
  if (frequency === "quarterly") monthsBack = 3;
  if (frequency === "annually") monthsBack = 12;
  let startMonth = m - monthsBack;
  let startYear = y;
  while (startMonth < 1) {
    startMonth += 12;
    startYear -= 1;
  }
  // End is the last day of the month immediately before the issue date.
  priorMonth = m - 1;
  priorYear = y;
  while (priorMonth < 1) {
    priorMonth += 12;
    priorYear -= 1;
  }
  const lastDayOfPriorMonth = new Date(
    Date.UTC(priorYear, priorMonth, 0),
  ).getUTCDate();
  const start = `${pad(startYear, 4)}-${pad(startMonth, 2)}-01`;
  const end = `${pad(priorYear, 4)}-${pad(priorMonth, 2)}-${pad(
    lastDayOfPriorMonth,
    2,
  )}`;
  return {
    start,
    end,
    label: `${formatPeriodDate(start)} – ${formatPeriodDate(end)}`,
  };
}

/**
 * Generate the next draft invoice from a recurring template, then advance
 * the template's `recurringNextDate`. The new invoice copies header fields
 * and lines verbatim, is dated `recurringNextDate`, gets a fresh
 * invoice-number, and starts as status="draft" so the user can review
 * before posting. Line descriptions are suffixed with "Services: <period
 * label>" so the generated invoice tells the customer what they're paying
 * for. Returns the new invoice's id + invoiceNumber for redirecting.
 */
export async function generateNextRecurringInvoice(
  user: SessionUser,
  templateId: string,
): Promise<{ id: string; invoiceNumber: string }> {
  requirePermission(user, "invoice.create");
  const db = getDb();
  const [tpl] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, templateId))
    .limit(1);
  if (!tpl) throw new Error("Template not found.");
  if (!tpl.isTemplate) throw new Error("Source invoice is not a template.");
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
    .from(schema.invoiceLines)
    .where(eq(schema.invoiceLines.invoiceId, templateId))
    .orderBy(schema.invoiceLines.lineNumber);
  if (tplLines.length === 0) {
    throw new Error("Template must have at least 1 line.");
  }

  // Customer payment terms drive the due-date offset; fall back to Net 30.
  const [cust] = await db
    .select({ paymentTerms: schema.customers.paymentTerms })
    .from(schema.customers)
    .where(eq(schema.customers.id, tpl.customerId))
    .limit(1);
  const paymentTerms = cust?.paymentTerms ?? 30;

  const issueDate = tpl.recurringNextDate;
  const frequency = tpl.recurringFrequency as InvoiceRecurringFrequency;
  const period = computeBillingPeriod(issueDate, frequency);
  const dueDateMs =
    new Date(`${issueDate}T00:00:00Z`).getTime() +
    paymentTerms * 24 * 60 * 60 * 1000;
  const dueDate = new Date(dueDateMs).toISOString().slice(0, 10);
  const advance = advanceInvoiceRecurringDate(
    issueDate,
    frequency,
    tpl.recurringDayOfMonth ?? null,
  );

  const id = uid("i");
  const invoiceNumber = await nextInvoiceNumber();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(schema.invoices).values({
      id,
      invoiceNumber,
      customerId: tpl.customerId,
      entityId: tpl.entityId,
      clientId: tpl.clientId,
      invoiceDate: issueDate,
      dueDate,
      status: "draft",
      subtotal: tpl.subtotal,
      taxRate: tpl.taxRate,
      taxExempt: tpl.taxExempt,
      taxAmount: tpl.taxAmount,
      total: tpl.total,
      amountPaid: "0.00",
      balanceDue: tpl.total,
      currencyCode: tpl.currencyCode,
      firmEntityId: tpl.firmEntityId,
      notes: tpl.notes,
      journalEntryId: null,
      isTemplate: false,
      recurringParentId: tpl.id,
      billingPeriodStart: period.start,
      billingPeriodEnd: period.end,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(schema.invoiceLines).values(
      tplLines.map((l, i) => ({
        id: `${id}-l${i + 1}`,
        invoiceId: id,
        lineNumber: i + 1,
        description: `${l.description} — Services: ${period.label}`,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        amount: l.amount,
        accountId: l.accountId,
        dimensions: l.dimensions,
        createdAt: now,
      })),
    );
    await tx
      .update(schema.invoices)
      .set({ recurringNextDate: advance, updatedAt: now })
      .where(eq(schema.invoices.id, templateId));
  });

  return { id, invoiceNumber };
}

/**
 * Generate every invoice template that's due today (recurringNextDate <=
 * today AND not past recurringEndDate). Returns counts for the cron route
 * response. Skips templates that fail individually so a single bad row
 * doesn't block the whole run.
 */
export async function generateDueRecurringInvoices(
  user: SessionUser,
  todayIso: string,
): Promise<{ generated: number; skipped: number; errors: string[] }> {
  const db = getDb();
  const templates = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.isTemplate, true));
  const due = templates.filter((t) => {
    if (!t.recurringNextDate) return false;
    if (t.recurringEndDate && t.recurringNextDate > t.recurringEndDate) {
      return false;
    }
    return t.recurringNextDate <= todayIso;
  });
  let generated = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const tpl of due) {
    try {
      await generateNextRecurringInvoice(user, tpl.id);
      generated += 1;
    } catch (err) {
      skipped += 1;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${tpl.invoiceNumber}: ${msg}`);
    }
  }
  return { generated, skipped, errors };
}

/**
 * Duplicate a bill into a new draft. The vendor invoice number reference
 * is intentionally NOT carried over — the user must enter a fresh one. The
 * bill number itself is auto-generated.
 */
export async function duplicateBill(
  user: SessionUser,
  sourceId: string,
): Promise<{ id: string; billNumber: string }> {
  requirePermission(user, "bill.create");
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

// --------- Compliance calendar (entity filings) ---------

export type CreateEntityFilingInput = {
  entityId: string;
  kind: FilingKind;
  title: string;
  jurisdiction?: string | null;
  dueDate: string;
  recurrence?: FilingRecurrence;
  ownerUserId?: string | null;
  notes?: string | null;
};

export async function createEntityFiling(
  user: SessionUser,
  input: CreateEntityFilingInput,
) {
  requirePermission(user, "filing.write");
  if (!input.title.trim()) throw new Error("Filing title is required.");
  if (!input.dueDate) throw new Error("Due date is required.");

  const db = getDb();
  const [entity] = await db
    .select({ id: schema.entities.id, code: schema.entities.code })
    .from(schema.entities)
    .where(eq(schema.entities.id, input.entityId))
    .limit(1);
  if (!entity) throw new Error("Entity not found.");

  const id = uid("fil");
  const now = new Date();
  const [created] = await db
    .insert(schema.entityFilings)
    .values({
      id,
      entityId: input.entityId,
      kind: input.kind,
      title: input.title.trim(),
      jurisdiction: input.jurisdiction ?? null,
      dueDate: input.dueDate,
      recurrence: input.recurrence ?? "none",
      status: "pending",
      ownerUserId: input.ownerUserId ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await logAuditEvent(user, {
    action: "filing.create",
    resourceType: "entity_filing",
    resourceId: id,
    resourceName: created.title,
    changes: {
      after: {
        entityId: created.entityId,
        kind: created.kind,
        dueDate: created.dueDate,
        recurrence: created.recurrence,
      },
    },
  });
  return created;
}

export type UpdateEntityFilingInput = Partial<CreateEntityFilingInput> & {
  status?: FilingStatus;
};

export async function updateEntityFiling(
  user: SessionUser,
  id: string,
  input: UpdateEntityFilingInput,
) {
  requirePermission(user, "filing.write");
  const db = getDb();
  const [existing] = await db
    .select({
      status: schema.entityFilings.status,
    })
    .from(schema.entityFilings)
    .where(eq(schema.entityFilings.id, id))
    .limit(1);
  if (!existing) throw new Error("Filing not found.");

  // Completing a filing must go through markFilingFiled / waiveEntityFiling —
  // they stamp completed_at / completed_by and (for recurring filings)
  // schedule the next occurrence. A plain edit can't close a filing.
  if (
    input.status !== undefined &&
    input.status !== existing.status &&
    !isOpenFilingStatus(input.status)
  ) {
    throw new Error(
      'Use the "Mark filed" / "Waive" actions to complete a filing — they record who completed it and schedule the next occurrence.',
    );
  }
  // Reopening a completed filing clears the stale completion stamp.
  const reopening =
    input.status !== undefined &&
    isOpenFilingStatus(input.status) &&
    !isOpenFilingStatus(existing.status as FilingStatus);

  const [updated] = await db
    .update(schema.entityFilings)
    .set({
      ...(input.entityId !== undefined && { entityId: input.entityId }),
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.jurisdiction !== undefined && { jurisdiction: input.jurisdiction }),
      ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
      ...(input.recurrence !== undefined && { recurrence: input.recurrence }),
      ...(input.status !== undefined && { status: input.status }),
      ...(reopening && { completedAt: null, completedBy: null }),
      ...(input.ownerUserId !== undefined && { ownerUserId: input.ownerUserId }),
      ...(input.notes !== undefined && { notes: input.notes }),
      updatedAt: new Date(),
    })
    .where(eq(schema.entityFilings.id, id))
    .returning();
  if (!updated) throw new Error("Filing not found.");

  await logAuditEvent(user, {
    action: "filing.update",
    resourceType: "entity_filing",
    resourceId: id,
    resourceName: updated.title,
    changes: { after: { status: updated.status, dueDate: updated.dueDate } },
  });
  return updated;
}

/**
 * Mark a filing as filed. Stamps completed_at / completed_by and — when
 * the filing recurs — automatically creates the NEXT occurrence with the
 * due date advanced by the recurrence interval (status pending), so the
 * calendar never goes silent on a recurring obligation.
 */
export async function markFilingFiled(user: SessionUser, id: string) {
  requirePermission(user, "filing.write");
  const db = getDb();
  const [filing] = await db
    .select()
    .from(schema.entityFilings)
    .where(eq(schema.entityFilings.id, id))
    .limit(1);
  if (!filing) throw new Error("Filing not found.");
  if (!isOpenFilingStatus(filing.status as FilingStatus)) {
    throw new Error(`Filing is already ${filing.status}.`);
  }

  const now = new Date();
  const months = filingRecurrenceMonths(filing.recurrence as FilingRecurrence);
  const nextId = months != null ? uid("fil") : null;

  await db.transaction(async (tx) => {
    await tx
      .update(schema.entityFilings)
      .set({
        status: "filed",
        completedAt: now,
        completedBy: user.userId,
        updatedAt: now,
      })
      .where(eq(schema.entityFilings.id, id));

    if (nextId && months != null) {
      await tx.insert(schema.entityFilings).values({
        id: nextId,
        entityId: filing.entityId,
        kind: filing.kind,
        title: filing.title,
        jurisdiction: filing.jurisdiction,
        dueDate: addMonthsIso(filing.dueDate, months),
        recurrence: filing.recurrence,
        status: "pending",
        ownerUserId: filing.ownerUserId,
        notes: filing.notes,
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  await logAuditEvent(user, {
    action: "filing.file",
    resourceType: "entity_filing",
    resourceId: id,
    resourceName: filing.title,
    changes: { before: { status: filing.status }, after: { status: "filed" } },
    metadata: { nextFilingId: nextId },
  });
  return { filingId: id, nextFilingId: nextId };
}

export async function waiveEntityFiling(user: SessionUser, id: string) {
  requirePermission(user, "filing.write");
  const db = getDb();
  const [filing] = await db
    .select()
    .from(schema.entityFilings)
    .where(eq(schema.entityFilings.id, id))
    .limit(1);
  if (!filing) throw new Error("Filing not found.");
  if (!isOpenFilingStatus(filing.status as FilingStatus)) {
    throw new Error(`Filing is already ${filing.status}.`);
  }
  const now = new Date();
  await db
    .update(schema.entityFilings)
    .set({ status: "waived", completedAt: now, completedBy: user.userId, updatedAt: now })
    .where(eq(schema.entityFilings.id, id));
  await logAuditEvent(user, {
    action: "filing.waive",
    resourceType: "entity_filing",
    resourceId: id,
    resourceName: filing.title,
    changes: { before: { status: filing.status }, after: { status: "waived" } },
  });
}

export async function deleteEntityFiling(user: SessionUser, id: string) {
  requirePermission(user, "filing.write");
  const db = getDb();
  const [filing] = await db
    .select()
    .from(schema.entityFilings)
    .where(eq(schema.entityFilings.id, id))
    .limit(1);
  if (!filing) return;
  await db.delete(schema.entityFilings).where(eq(schema.entityFilings.id, id));
  await logAuditEvent(user, {
    action: "filing.delete",
    resourceType: "entity_filing",
    resourceId: id,
    resourceName: filing.title,
  });
}

// --------- KYC / AML due diligence ---------

export type UpdateKycProfileInput = {
  kycStatus?: KycStatus;
  riskRating?: RiskRating | null;
  pepFlag?: boolean;
  /** yyyy-mm-dd of the last sanctions screening (stored as timestamp). */
  sanctionsCheckedAt?: string | null;
  kycNextReviewDate?: string | null;
  kycNotes?: string | null;
};

/**
 * Update the KYC / due-diligence profile on a customer or client entity.
 * "Overdue" is never stored — it derives from kyc_next_review_date.
 */
export async function updateKycProfile(
  user: SessionUser,
  subjectType: KycSubjectType,
  subjectId: string,
  input: UpdateKycProfileInput,
) {
  requirePermission(user, "kyc.write");
  const db = getDb();

  const sanctionsTs =
    input.sanctionsCheckedAt === undefined
      ? undefined
      : input.sanctionsCheckedAt
        ? new Date(`${input.sanctionsCheckedAt}T00:00:00Z`)
        : null;

  const patch = {
    ...(input.kycStatus !== undefined && { kycStatus: input.kycStatus }),
    ...(input.riskRating !== undefined && { riskRating: input.riskRating }),
    ...(input.pepFlag !== undefined && { pepFlag: input.pepFlag }),
    ...(sanctionsTs !== undefined && { sanctionsCheckedAt: sanctionsTs }),
    ...(input.kycNextReviewDate !== undefined && {
      kycNextReviewDate: input.kycNextReviewDate,
    }),
    ...(input.kycNotes !== undefined && { kycNotes: input.kycNotes }),
    updatedAt: new Date(),
  };

  let resourceName: string;
  if (subjectType === "customer") {
    const [updated] = await db
      .update(schema.customers)
      .set(patch)
      .where(eq(schema.customers.id, subjectId))
      .returning();
    if (!updated) throw new Error("Client not found.");
    resourceName = updated.name;
  } else {
    const [updated] = await db
      .update(schema.entities)
      .set(patch)
      .where(eq(schema.entities.id, subjectId))
      .returning();
    if (!updated) throw new Error("Entity not found.");
    resourceName = updated.name;
  }

  await logAuditEvent(user, {
    action: "kyc.update",
    resourceType: subjectType,
    resourceId: subjectId,
    resourceName,
    changes: {
      after: {
        kycStatus: input.kycStatus,
        riskRating: input.riskRating,
        pepFlag: input.pepFlag,
        kycNextReviewDate: input.kycNextReviewDate,
      },
    },
  });
}

export type LogKycReviewInput = {
  subjectType: KycSubjectType;
  subjectId: string;
  reviewDate: string;
  outcome: KycReviewOutcome;
  riskRatingAfter?: RiskRating | null;
  notes?: string | null;
};

/**
 * Record a periodic due-diligence review and roll the subject forward:
 *   - outcome "cleared" → kyc_status becomes "verified"
 *   - kyc_next_review_date advances from review_date by the risk cadence
 *     (12mo low / 6mo medium / 3mo high — using the post-review rating)
 *   - risk_rating syncs to riskRatingAfter when given
 */
export async function logKycReview(user: SessionUser, input: LogKycReviewInput) {
  requirePermission(user, "kyc.write");
  if (!input.reviewDate) throw new Error("Review date is required.");
  const db = getDb();

  let subjectName: string;
  let currentRisk: RiskRating | null = null;
  if (input.subjectType === "customer") {
    const [row] = await db
      .select({ name: schema.customers.name, riskRating: schema.customers.riskRating })
      .from(schema.customers)
      .where(eq(schema.customers.id, input.subjectId))
      .limit(1);
    if (!row) throw new Error("Client not found.");
    subjectName = row.name;
    currentRisk =
      row.riskRating === "low" || row.riskRating === "medium" || row.riskRating === "high"
        ? row.riskRating
        : null;
  } else {
    const [row] = await db
      .select({ name: schema.entities.name, riskRating: schema.entities.riskRating })
      .from(schema.entities)
      .where(eq(schema.entities.id, input.subjectId))
      .limit(1);
    if (!row) throw new Error("Entity not found.");
    subjectName = row.name;
    currentRisk =
      row.riskRating === "low" || row.riskRating === "medium" || row.riskRating === "high"
        ? row.riskRating
        : null;
  }

  const effectiveRisk = input.riskRatingAfter ?? currentRisk;
  const nextReviewDate = addMonthsIso(
    input.reviewDate,
    kycReviewIntervalMonths(effectiveRisk),
  );

  const reviewId = uid("kyr");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(schema.kycReviews).values({
      id: reviewId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      reviewDate: input.reviewDate,
      outcome: input.outcome,
      riskRatingAfter: input.riskRatingAfter ?? null,
      reviewerUserId: user.userId,
      notes: input.notes ?? null,
      createdAt: now,
    });

    const subjectPatch = {
      ...(input.outcome === "cleared" && { kycStatus: "verified" }),
      ...(input.riskRatingAfter != null && { riskRating: input.riskRatingAfter }),
      kycNextReviewDate: nextReviewDate,
      updatedAt: now,
    };
    if (input.subjectType === "customer") {
      await tx
        .update(schema.customers)
        .set(subjectPatch)
        .where(eq(schema.customers.id, input.subjectId));
    } else {
      await tx
        .update(schema.entities)
        .set(subjectPatch)
        .where(eq(schema.entities.id, input.subjectId));
    }
  });

  await logAuditEvent(user, {
    action: "kyc.review",
    resourceType: input.subjectType,
    resourceId: input.subjectId,
    resourceName: subjectName,
    changes: {
      after: {
        outcome: input.outcome,
        riskRatingAfter: input.riskRatingAfter ?? null,
        nextReviewDate,
      },
    },
    metadata: { kycReviewId: reviewId },
  });
  return { reviewId, nextReviewDate };
}

// --------- Distributions (beneficiary payouts, dual approval) ---------

export async function nextDistributionNumber(): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ distributionNumber: schema.distributions.distributionNumber })
    .from(schema.distributions)
    .orderBy(desc(schema.distributions.distributionNumber))
    .limit(1);
  const n = parseTrailingInt(row?.distributionNumber) + 1;
  return `DIST-${pad(n, 6)}`;
}

export type CreateDistributionInput = {
  entityId: string;
  beneficiaryContactId: string;
  amount: number;
  currencyCode?: string;
  bankAccountId?: string | null;
  resolutionReference?: string | null;
  notes?: string | null;
};

export async function createDistribution(
  user: SessionUser,
  input: CreateDistributionInput,
) {
  requirePermission(user, "distribution.create");
  if (!(input.amount > 0)) throw new Error("Amount must be greater than zero.");

  const db = getDb();
  const [entity] = await db
    .select({ id: schema.entities.id, currencyCode: schema.entities.currencyCode })
    .from(schema.entities)
    .where(eq(schema.entities.id, input.entityId))
    .limit(1);
  if (!entity) throw new Error("Entity not found.");

  const [beneficiary] = await db
    .select({
      id: schema.contacts.id,
      name: schema.contacts.name,
      isBeneficiary: schema.contacts.isBeneficiary,
    })
    .from(schema.contacts)
    .where(eq(schema.contacts.id, input.beneficiaryContactId))
    .limit(1);
  if (!beneficiary) throw new Error("Beneficiary contact not found.");
  if (!beneficiary.isBeneficiary) {
    throw new Error(
      `${beneficiary.name} is not flagged as a beneficiary. Tag the contact as Beneficiary first.`,
    );
  }

  // Distribution currency defaults to the paying entity's currency.
  const currencyCode = input.currencyCode ?? entity.currencyCode ?? "USD";

  // Funding account must be owned by the paying entity, or be a firm
  // account (no owner, GL-linked). An account with an owning entity or
  // client is that owner's money even when it also carries a GL link —
  // ownership, not GL-linkage, decides. Anything else risks paying from
  // another client's structure.
  if (input.bankAccountId) {
    const [ba] = await db
      .select({
        id: schema.bankAccounts.id,
        entityId: schema.bankAccounts.entityId,
        clientId: schema.bankAccounts.clientId,
        accountId: schema.bankAccounts.accountId,
        currencyCode: schema.bankAccounts.currencyCode,
      })
      .from(schema.bankAccounts)
      .where(eq(schema.bankAccounts.id, input.bankAccountId))
      .limit(1);
    if (!ba) throw new Error("Funding bank account not found.");
    const isFirmAccount =
      ba.entityId == null && ba.clientId == null && ba.accountId != null;
    if (ba.entityId !== input.entityId && !isFirmAccount) {
      throw new Error(
        "Funding account must belong to the paying entity or be a firm (GL-linked) account.",
      );
    }
    // No FX conversion happens at payment time — the amount posts raw to
    // the ledger / bank transaction, so the currencies must match.
    if (ba.currencyCode !== currencyCode) {
      throw new Error(
        `Funding account is denominated in ${ba.currencyCode} but the distribution is in ${currencyCode}. Match the distribution currency to the funding account.`,
      );
    }
  }

  const id = uid("dist");
  const distributionNumber = await nextDistributionNumber();
  const now = new Date();
  const [created] = await db
    .insert(schema.distributions)
    .values({
      id,
      distributionNumber,
      entityId: input.entityId,
      beneficiaryContactId: input.beneficiaryContactId,
      amount: toDecimalString(input.amount),
      currencyCode,
      bankAccountId: input.bankAccountId ?? null,
      status: "requested",
      requestedBy: user.userId,
      requestedAt: now,
      resolutionReference: input.resolutionReference ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await logAuditEvent(user, {
    action: "distribution.create",
    resourceType: "distribution",
    resourceId: id,
    resourceName: distributionNumber,
    changes: {
      after: {
        entityId: input.entityId,
        beneficiaryContactId: input.beneficiaryContactId,
        amount: toDecimalString(input.amount),
        status: "requested",
      },
    },
  });
  return created;
}

/**
 * Dual approval. First approval: any distribution.approve holder other
 * than the requester. Second approval: another distinct approver (not
 * the requester, not the first approver). Both checks are enforced here
 * regardless of role — the UI only hides buttons.
 */
export async function approveDistribution(user: SessionUser, id: string) {
  requirePermission(user, "distribution.approve");
  const db = getDb();
  const [dist] = await db
    .select()
    .from(schema.distributions)
    .where(eq(schema.distributions.id, id))
    .limit(1);
  if (!dist) throw new Error("Distribution not found.");

  const now = new Date();
  if (dist.status === "requested") {
    if (dist.requestedBy && dist.requestedBy === user.userId) {
      throw new Error("The requester cannot give the first approval.");
    }
    await db
      .update(schema.distributions)
      .set({
        status: "first_approved",
        firstApprovedBy: user.userId,
        firstApprovedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.distributions.id, id));
    await logAuditEvent(user, {
      action: "distribution.approve_first",
      resourceType: "distribution",
      resourceId: id,
      resourceName: dist.distributionNumber,
      changes: { before: { status: "requested" }, after: { status: "first_approved" } },
    });
    return { stage: "first" as const };
  }

  if (dist.status === "first_approved") {
    if (dist.requestedBy && dist.requestedBy === user.userId) {
      throw new Error("The requester cannot approve their own distribution.");
    }
    if (dist.firstApprovedBy && dist.firstApprovedBy === user.userId) {
      throw new Error("Second approval must come from a different approver.");
    }
    await db
      .update(schema.distributions)
      .set({
        status: "approved",
        secondApprovedBy: user.userId,
        secondApprovedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.distributions.id, id));
    await logAuditEvent(user, {
      action: "distribution.approve_second",
      resourceType: "distribution",
      resourceId: id,
      resourceName: dist.distributionNumber,
      changes: { before: { status: "first_approved" }, after: { status: "approved" } },
    });
    return { stage: "second" as const };
  }

  throw new Error(`Distribution is ${dist.status} — nothing to approve.`);
}

export async function rejectDistribution(
  user: SessionUser,
  id: string,
  reason: string,
) {
  requirePermission(user, "distribution.approve");
  if (!reason.trim()) throw new Error("A rejection reason is required.");
  const db = getDb();
  const [dist] = await db
    .select()
    .from(schema.distributions)
    .where(eq(schema.distributions.id, id))
    .limit(1);
  if (!dist) throw new Error("Distribution not found.");
  if (!["requested", "first_approved", "approved"].includes(dist.status)) {
    throw new Error(`Distribution is ${dist.status} — it can no longer be rejected.`);
  }
  const now = new Date();
  await db
    .update(schema.distributions)
    .set({
      status: "rejected",
      rejectedBy: user.userId,
      rejectedAt: now,
      rejectionReason: reason.trim(),
      updatedAt: now,
    })
    .where(eq(schema.distributions.id, id));
  await logAuditEvent(user, {
    action: "distribution.reject",
    resourceType: "distribution",
    resourceId: id,
    resourceName: dist.distributionNumber,
    changes: { before: { status: dist.status }, after: { status: "rejected" } },
    metadata: { reason: reason.trim() },
  });
}

/**
 * Mark a fully-approved distribution as paid.
 *
 * Ledger rule: ONLY when the funding bank account is a FIRM account
 * (no owning entity/client, GL-linked) does this post a JE — Dr the
 * equity distributions account (an equity account named like
 * "distribution", else Owner's Equity 3000), Cr the bank GL account —
 * and record a matching bank_transactions row (source "system",
 * negative amount), mirroring the bill-payment posting flow. Accounts
 * owned by a client or entity are operational records only, even when
 * they happen to carry a GL link — client entities NEVER report in
 * firm financials.
 */
export async function markDistributionPaid(user: SessionUser, id: string) {
  requirePermission(user, "distribution.approve");
  const db = getDb();
  const [dist] = await db
    .select()
    .from(schema.distributions)
    .where(eq(schema.distributions.id, id))
    .limit(1);
  if (!dist) throw new Error("Distribution not found.");
  if (dist.status !== "approved") {
    throw new Error("Only a fully approved distribution can be marked paid.");
  }

  const amount = parseAmount(dist.amount);
  const now = new Date();
  const paymentDate = now.toISOString().slice(0, 10);

  // Claim the row FIRST with a conditional update so two concurrent
  // mark-paid submissions can't both post the ledger side — only the
  // request that flips approved → paid proceeds.
  const claimed = await db
    .update(schema.distributions)
    .set({ status: "paid", paidAt: now, updatedAt: now })
    .where(
      and(
        eq(schema.distributions.id, id),
        eq(schema.distributions.status, "approved"),
      ),
    )
    .returning();
  if (claimed.length === 0) {
    throw new Error("Only a fully approved distribution can be marked paid.");
  }

  let journalEntryId: string | null = null;
  let entryNumber: string | null = null;

  try {
    if (dist.bankAccountId) {
      const [ba] = await db
        .select({
          id: schema.bankAccounts.id,
          name: schema.bankAccounts.name,
          accountId: schema.bankAccounts.accountId,
          entityId: schema.bankAccounts.entityId,
          clientId: schema.bankAccounts.clientId,
        })
        .from(schema.bankAccounts)
        .where(eq(schema.bankAccounts.id, dist.bankAccountId))
        .limit(1);
      if (!ba) throw new Error("Funding bank account not found.");

      if (ba.accountId && ba.entityId == null && ba.clientId == null) {
        // Firm account (unowned, GL-linked) → post the ledger side.
        // Client/entity-owned accounts never touch the firm ledger.
        const [distAccount] = await db
          .select({ id: schema.accounts.id })
          .from(schema.accounts)
          .where(
            and(
              isNull(schema.accounts.entityId),
              eq(schema.accounts.accountType, "equity"),
              eq(schema.accounts.isActive, true),
              sql`lower(${schema.accounts.name}) LIKE '%distribution%'`,
            ),
          )
          .orderBy(schema.accounts.code)
          .limit(1);
        let equityAccountId = distAccount?.id ?? null;
        if (!equityAccountId) {
          const [ownersEquity] = await db
            .select({ id: schema.accounts.id })
            .from(schema.accounts)
            .where(
              and(
                isNull(schema.accounts.entityId),
                eq(schema.accounts.code, "3000"),
              ),
            )
            .limit(1);
          equityAccountId = ownersEquity?.id ?? null;
        }
        if (!equityAccountId) {
          throw new Error(
            "No equity account found to post the distribution against (looked for an equity account named like 'Distributions', then code 3000).",
          );
        }

        const [beneficiary] = await db
          .select({ name: schema.contacts.name })
          .from(schema.contacts)
          .where(eq(schema.contacts.id, dist.beneficiaryContactId))
          .limit(1);
        const beneficiaryName = beneficiary?.name ?? dist.beneficiaryContactId;

        const { firmEntityId } = await getFirmIssuingCurrency();
        const je = await createJournalEntry(user, {
          entryDate: paymentDate,
          description: `Distribution paid (${dist.distributionNumber}) — ${beneficiaryName}`,
          reference: dist.resolutionReference ?? dist.distributionNumber,
          source: "manual",
          status: "posted",
          firmEntityId,
          lines: [
            {
              accountId: equityAccountId,
              description: `Distribution to ${beneficiaryName}`,
              debit: amount,
              credit: 0,
            },
            {
              accountId: ba.accountId,
              description: "Bank out",
              debit: 0,
              credit: amount,
            },
          ],
        });
        journalEntryId = je.id;
        entryNumber = je.entryNumber;

        await db.insert(schema.bankTransactions).values({
          id: uid("bt"),
          bankAccountId: ba.id,
          transactionDate: paymentDate,
          description: `Distribution ${dist.distributionNumber} — ${beneficiaryName}`,
          amount: toDecimalString(-amount),
          reference: dist.distributionNumber,
          isReconciled: false,
          journalEntryId: je.id,
          source: "system",
        });
      }
    }

    if (journalEntryId) {
      await db
        .update(schema.distributions)
        .set({ journalEntryId, updatedAt: new Date() })
        .where(eq(schema.distributions.id, id));
    }
  } catch (err) {
    // Posting failed after the claim — release it so the distribution
    // isn't stuck at "paid" without its ledger side.
    await db
      .update(schema.distributions)
      .set({ status: "approved", paidAt: null, updatedAt: new Date() })
      .where(eq(schema.distributions.id, id));
    throw err;
  }

  await logAuditEvent(user, {
    action: "distribution.pay",
    resourceType: "distribution",
    resourceId: id,
    resourceName: dist.distributionNumber,
    changes: { before: { status: "approved" }, after: { status: "paid" } },
    metadata: { journalEntryId, entryNumber },
  });
  return { distributionId: id, journalEntryId, entryNumber };
}
