/**
 * Cash forecast.
 *
 * Combines:
 *  - Today's cash balance (sum of bank account GL balances)
 *  - Expected inflows: invoices with balanceDue > 0 grouped by their
 *    expectedPaymentDate (or dueDate fallback)
 *  - Expected inflows: entity-fee billing scheduled by nextBillingDate
 *  - Expected outflows: recurring_payments grouped by nextPaymentDate
 *    (expanded across the horizon based on frequency)
 *  - Expected outflows: bills with balanceDue > 0 grouped by dueDate
 *
 * Returns weekly buckets out to `weeks` ahead.
 */

import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { parseAmount } from "./money";
import { getEntityScope } from "./entity-scope";

export type ForecastRow = {
  /** ISO date — Monday of the week */
  weekStart: string;
  inflowsFromInvoices: number;
  inflowsFromEntityFees: number;
  outflowsFromBills: number;
  outflowsFromRecurring: number;
  netDelta: number;
  endingBalance: number;
};

export type ForecastItem = {
  kind: "invoice" | "entity_fee" | "bill" | "recurring";
  /** Cash event date (signed) */
  date: string;
  amount: number;
  description: string;
  /** Detail page URL when applicable */
  href?: string;
  /** True if amount represents an outflow (negative direction). */
  isOutflow: boolean;
};

function startOfWeek(d: Date): Date {
  // Monday as start of week
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = out.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  out.setUTCDate(out.getUTCDate() + diff);
  return out;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addWeeks(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n * 7);
  return out;
}

function addPeriod(d: Date, frequency: string): Date {
  const out = new Date(d);
  switch (frequency) {
    case "weekly":
      out.setUTCDate(out.getUTCDate() + 7);
      return out;
    case "biweekly":
      out.setUTCDate(out.getUTCDate() + 14);
      return out;
    case "monthly":
      out.setUTCMonth(out.getUTCMonth() + 1);
      return out;
    case "quarterly":
      out.setUTCMonth(out.getUTCMonth() + 3);
      return out;
    case "semiannual":
      out.setUTCMonth(out.getUTCMonth() + 6);
      return out;
    case "annual":
      out.setUTCFullYear(out.getUTCFullYear() + 1);
      return out;
    case "one_time":
    default:
      return new Date("9999-12-31");
  }
}

export async function getCashForecast(
  startingCash: number,
  fromDate: Date,
  weeks: number = 13,
): Promise<{ rows: ForecastRow[]; items: ForecastItem[] }> {
  const scope = await getEntityScope();
  const db = getDb();

  const horizonEnd = addWeeks(startOfWeek(fromDate), weeks + 1);
  const horizonEndIso = isoDate(horizonEnd);

  // 1. Outstanding invoices → inflows
  let invoices = await db
    .select({
      id: schema.invoices.id,
      invoiceNumber: schema.invoices.invoiceNumber,
      customerId: schema.invoices.customerId,
      entityId: schema.invoices.entityId,
      balanceDue: schema.invoices.balanceDue,
      dueDate: schema.invoices.dueDate,
      expectedPaymentDate: schema.invoices.expectedPaymentDate,
    })
    .from(schema.invoices);
  invoices = invoices.filter((i) => parseAmount(i.balanceDue) > 0);
  if (scope) invoices = invoices.filter((i) => i.entityId === scope);

  // 2. Outstanding bills → outflows
  let bills = await db
    .select({
      id: schema.bills.id,
      billNumber: schema.bills.billNumber,
      balanceDue: schema.bills.balanceDue,
      dueDate: schema.bills.dueDate,
    })
    .from(schema.bills);
  bills = bills.filter((b) => parseAmount(b.balanceDue) > 0);

  // 3. Recurring payments (expand across horizon)
  const recurring = await db
    .select()
    .from(schema.recurringPayments)
    .where(eq(schema.recurringPayments.isActive, true));

  // 4. Entity fees with next_billing_date → inflows
  let fees = await db
    .select()
    .from(schema.entityFees);
  fees = fees.filter((f) => f.status === "active" || f.status === "draft");
  fees = fees.filter((f) => f.nextBillingDate != null);
  if (scope) fees = fees.filter((f) => f.entityId === scope);

  // Build the item list
  const items: ForecastItem[] = [];

  for (const inv of invoices) {
    const date = inv.expectedPaymentDate ?? inv.dueDate;
    if (date > horizonEndIso) continue;
    items.push({
      kind: "invoice",
      date,
      amount: parseAmount(inv.balanceDue),
      description: `Invoice ${inv.invoiceNumber}`,
      href: `/invoices/${inv.id}`,
      isOutflow: false,
    });
  }

  for (const bill of bills) {
    if (bill.dueDate > horizonEndIso) continue;
    items.push({
      kind: "bill",
      date: bill.dueDate,
      amount: parseAmount(bill.balanceDue),
      description: `Bill ${bill.billNumber}`,
      href: `/bills/${bill.id}`,
      isOutflow: true,
    });
  }

  for (const r of recurring) {
    let cursor = new Date(`${r.nextPaymentDate}T00:00:00Z`);
    while (isoDate(cursor) <= horizonEndIso) {
      items.push({
        kind: "recurring",
        date: isoDate(cursor),
        amount: parseAmount(r.amount),
        description: r.name,
        isOutflow: true,
      });
      cursor = addPeriod(cursor, r.frequency);
      if (r.frequency === "one_time") break;
    }
  }

  for (const f of fees) {
    let cursor = new Date(`${f.nextBillingDate!}T00:00:00Z`);
    while (isoDate(cursor) <= horizonEndIso) {
      const amt = parseAmount(f.perPeriodAmount ?? f.annualFee);
      items.push({
        kind: "entity_fee",
        date: isoDate(cursor),
        amount: amt,
        description: `Scheduled fee — ${f.id}`,
        isOutflow: false,
      });
      cursor = addPeriod(cursor, f.frequency ?? "annual");
      if ((f.frequency ?? "annual") === "one_time") break;
    }
  }

  // Bucket into weeks
  const rows: ForecastRow[] = [];
  let running = startingCash;
  for (let w = 0; w < weeks; w++) {
    const weekStart = addWeeks(startOfWeek(fromDate), w);
    const weekEnd = addWeeks(weekStart, 1);
    const wsIso = isoDate(weekStart);
    const weIso = isoDate(weekEnd);

    let inflowInv = 0, inflowFee = 0, outflowBill = 0, outflowRec = 0;
    for (const it of items) {
      if (it.date < wsIso || it.date >= weIso) continue;
      if (it.kind === "invoice") inflowInv += it.amount;
      else if (it.kind === "entity_fee") inflowFee += it.amount;
      else if (it.kind === "bill") outflowBill += it.amount;
      else if (it.kind === "recurring") outflowRec += it.amount;
    }
    const netDelta = inflowInv + inflowFee - outflowBill - outflowRec;
    running += netDelta;
    rows.push({
      weekStart: wsIso,
      inflowsFromInvoices: inflowInv,
      inflowsFromEntityFees: inflowFee,
      outflowsFromBills: outflowBill,
      outflowsFromRecurring: outflowRec,
      netDelta,
      endingBalance: running,
    });
  }

  return { rows, items };
}
