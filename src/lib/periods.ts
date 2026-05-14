/**
 * Monthly accounting-period close.
 *
 * Periods are auto-seeded for the current year + next year the first time
 * `/settings/periods` is loaded. A date that falls inside a "closed" period
 * yields a soft warning the caller can override by supplying a reason; a
 * "locked" period hard-blocks any new entry/invoice/bill posting unless a
 * superadmin reopens it.
 */

import "server-only";

import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";

import { getDb, schema } from "@/db";
import type {
  AccountingPeriod,
  AccountingPeriodStatus,
  SessionUser,
} from "./types";
import { logAuditEvent } from "./audit";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function monthRange(year: number, monthIdx: number): { start: string; end: string } {
  const start = `${year}-${pad2(monthIdx + 1)}-01`;
  // End-of-month: take 0th day of next month.
  const eom = new Date(Date.UTC(year, monthIdx + 1, 0));
  const end = `${eom.getUTCFullYear()}-${pad2(eom.getUTCMonth() + 1)}-${pad2(eom.getUTCDate())}`;
  return { start, end };
}

function mapPeriod(
  r: typeof schema.accountingPeriods.$inferSelect,
): AccountingPeriod {
  return {
    id: r.id,
    name: r.name,
    startDate: r.startDate,
    endDate: r.endDate,
    status: (r.status as AccountingPeriodStatus) ?? "open",
    closedAt: r.closedAt ? r.closedAt.toISOString() : null,
    closedBy: r.closedBy,
    lockedAt: r.lockedAt ? r.lockedAt.toISOString() : null,
    lockedBy: r.lockedBy,
    notes: r.notes,
  };
}

/**
 * Seed monthly periods for `year` and `year + 1` if none exist yet. Safe to
 * call repeatedly — only inserts rows missing by name.
 */
export async function ensureAccountingPeriods(referenceYear: number): Promise<void> {
  const db = getDb();
  const existing = await db
    .select({ name: schema.accountingPeriods.name })
    .from(schema.accountingPeriods);
  const have = new Set(existing.map((r) => r.name));

  const rows: Array<typeof schema.accountingPeriods.$inferInsert> = [];
  for (const y of [referenceYear, referenceYear + 1]) {
    for (let m = 0; m < 12; m++) {
      const name = `${MONTH_NAMES[m]} ${y}`;
      if (have.has(name)) continue;
      const { start, end } = monthRange(y, m);
      rows.push({
        id: `ap-${y}-${pad2(m + 1)}`,
        name,
        startDate: start,
        endDate: end,
        status: "open",
      });
    }
  }
  if (rows.length === 0) return;
  await db.insert(schema.accountingPeriods).values(rows).onConflictDoNothing();
}

export async function getAccountingPeriods(): Promise<AccountingPeriod[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.accountingPeriods)
    .orderBy(asc(schema.accountingPeriods.startDate));
  return rows.map(mapPeriod);
}

/**
 * Find the accounting period a given ISO date (YYYY-MM-DD) falls into.
 * Returns null if no matching period (e.g. the year hasn't been seeded yet).
 */
export async function getPeriodForDate(
  date: string,
): Promise<AccountingPeriod | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.accountingPeriods)
    .where(
      and(
        lte(schema.accountingPeriods.startDate, date),
        gte(schema.accountingPeriods.endDate, date),
      ),
    )
    .limit(1);
  return row ? mapPeriod(row) : null;
}

/**
 * For each period id, count how many DRAFT journal entries / invoices /
 * bills currently fall inside its date range. Used by `/settings/periods`
 * to warn before closing a period with pending work.
 */
export async function getDraftCountsByPeriod(
  periodIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (periodIds.length === 0) return out;
  const db = getDb();

  // Pull the periods we need ranges for, then count draft records per period
  // in JS. Three small selects keep this in plain Drizzle without raw SQL.
  const periods = await db
    .select({
      id: schema.accountingPeriods.id,
      startDate: schema.accountingPeriods.startDate,
      endDate: schema.accountingPeriods.endDate,
    })
    .from(schema.accountingPeriods)
    .where(inArray(schema.accountingPeriods.id, periodIds));
  if (periods.length === 0) return out;

  const minStart = periods.reduce((m, p) => (p.startDate < m ? p.startDate : m), periods[0].startDate);
  const maxEnd = periods.reduce((m, p) => (p.endDate > m ? p.endDate : m), periods[0].endDate);

  const [draftJe, draftInv, draftBill] = await Promise.all([
    db
      .select({ entryDate: schema.journalEntries.entryDate })
      .from(schema.journalEntries)
      .where(
        and(
          eq(schema.journalEntries.status, "draft"),
          gte(schema.journalEntries.entryDate, minStart),
          lte(schema.journalEntries.entryDate, maxEnd),
        ),
      ),
    db
      .select({ invoiceDate: schema.invoices.invoiceDate })
      .from(schema.invoices)
      .where(
        and(
          eq(schema.invoices.status, "draft"),
          gte(schema.invoices.invoiceDate, minStart),
          lte(schema.invoices.invoiceDate, maxEnd),
        ),
      ),
    db
      .select({ billDate: schema.bills.billDate })
      .from(schema.bills)
      .where(
        and(
          eq(schema.bills.status, "draft"),
          gte(schema.bills.billDate, minStart),
          lte(schema.bills.billDate, maxEnd),
        ),
      ),
  ]);

  function bucket(date: string) {
    for (const p of periods) {
      if (date >= p.startDate && date <= p.endDate) {
        out.set(p.id, (out.get(p.id) ?? 0) + 1);
        return;
      }
    }
  }
  for (const r of draftJe) bucket(r.entryDate);
  for (const r of draftInv) bucket(r.invoiceDate);
  for (const r of draftBill) bucket(r.billDate);
  return out;
}

/**
 * Most recent N periods by start date, newest first. Used by the dashboard
 * widget.
 */
export async function getRecentPeriods(limit = 3): Promise<AccountingPeriod[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.accountingPeriods)
    .orderBy(desc(schema.accountingPeriods.startDate))
    .limit(limit);
  return rows.map(mapPeriod);
}

/**
 * Check the period for `date` and decide whether posting is allowed.
 *
 *   - no period found → allow (treat as open)
 *   - "open"          → allow
 *   - "closed"        → allow only if `overrideReason` is non-empty;
 *                       throws a tagged error if not
 *   - "locked"        → always throw
 *
 * The thrown error message is what bubbles up to the UI, so it's prefixed
 * with a stable code so client forms can detect the "needs override" case
 * (see `PERIOD_CLOSED_NEEDS_REASON_PREFIX`).
 */
export const PERIOD_CLOSED_NEEDS_REASON_PREFIX = "PERIOD_CLOSED_NEEDS_REASON:";
export const PERIOD_LOCKED_PREFIX = "PERIOD_LOCKED:";

/**
 * Strip our internal sentinel prefixes so error messages surfacing in
 * `?error=` query strings or banner UIs read cleanly without exposing the
 * tag we use to detect the "needs reason" case.
 */
export function stripPeriodErrorPrefix(message: string): string {
  if (message.startsWith(PERIOD_CLOSED_NEEDS_REASON_PREFIX)) {
    return message.slice(PERIOD_CLOSED_NEEDS_REASON_PREFIX.length).trim();
  }
  if (message.startsWith(PERIOD_LOCKED_PREFIX)) {
    return message.slice(PERIOD_LOCKED_PREFIX.length).trim();
  }
  return message;
}

export type PeriodCheckResult =
  | { allowed: true; period: AccountingPeriod | null; overrideRecorded: string | null };

export async function checkPeriodForPost(
  date: string,
  overrideReason: string | null | undefined,
): Promise<PeriodCheckResult> {
  const period = await getPeriodForDate(date);
  if (!period) return { allowed: true, period: null, overrideRecorded: null };
  if (period.status === "open") {
    return { allowed: true, period, overrideRecorded: null };
  }
  if (period.status === "locked") {
    throw new Error(
      `${PERIOD_LOCKED_PREFIX}Period ${period.name} is locked. Contact your administrator.`,
    );
  }
  // closed
  const reason = (overrideReason ?? "").trim();
  if (!reason) {
    throw new Error(
      `${PERIOD_CLOSED_NEEDS_REASON_PREFIX}Period ${period.name} is closed. Provide a reason to post anyway.`,
    );
  }
  return { allowed: true, period, overrideRecorded: reason };
}

// ---------- Mutations ----------

export async function closePeriod(
  user: SessionUser,
  periodId: string,
  notes: string | null,
): Promise<AccountingPeriod> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.accountingPeriods)
    .where(eq(schema.accountingPeriods.id, periodId))
    .limit(1);
  if (!existing) throw new Error("Period not found.");
  if (existing.status === "locked") {
    throw new Error("Locked periods can't be closed (already past close).");
  }
  const [updated] = await db
    .update(schema.accountingPeriods)
    .set({
      status: "closed",
      closedAt: new Date(),
      closedBy: user.userId,
      notes: notes ?? existing.notes,
    })
    .where(eq(schema.accountingPeriods.id, periodId))
    .returning();
  await logAuditEvent(user, {
    action: "period.close",
    resourceType: "accounting_period",
    resourceId: updated.id,
    resourceName: updated.name,
    changes: { before: { status: existing.status }, after: { status: "closed" } },
    metadata: notes ? { notes } : undefined,
  });
  return mapPeriod(updated);
}

export async function lockPeriod(
  user: SessionUser,
  periodId: string,
): Promise<AccountingPeriod> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.accountingPeriods)
    .where(eq(schema.accountingPeriods.id, periodId))
    .limit(1);
  if (!existing) throw new Error("Period not found.");
  if (existing.status !== "closed") {
    throw new Error("Only closed periods can be locked.");
  }
  const [updated] = await db
    .update(schema.accountingPeriods)
    .set({
      status: "locked",
      lockedAt: new Date(),
      lockedBy: user.userId,
    })
    .where(eq(schema.accountingPeriods.id, periodId))
    .returning();
  await logAuditEvent(user, {
    action: "period.lock",
    resourceType: "accounting_period",
    resourceId: updated.id,
    resourceName: updated.name,
    changes: { before: { status: existing.status }, after: { status: "locked" } },
  });
  return mapPeriod(updated);
}

export async function reopenPeriod(
  user: SessionUser,
  periodId: string,
  reason: string,
): Promise<AccountingPeriod> {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A reason is required to reopen a period.");
  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.accountingPeriods)
    .where(eq(schema.accountingPeriods.id, periodId))
    .limit(1);
  if (!existing) throw new Error("Period not found.");
  if (existing.status === "open") return mapPeriod(existing);
  if (existing.status === "locked" && !user.isSuperuser) {
    throw new Error(
      "Locked periods can only be reopened by a superadmin.",
    );
  }
  const existingNotes = existing.notes ? `${existing.notes}\n\n` : "";
  const [updated] = await db
    .update(schema.accountingPeriods)
    .set({
      status: "open",
      closedAt: null,
      closedBy: null,
      lockedAt: null,
      lockedBy: null,
      notes: `${existingNotes}Reopened by ${user.fullName}: ${trimmed}`,
    })
    .where(eq(schema.accountingPeriods.id, periodId))
    .returning();
  return mapPeriod(updated);
}
