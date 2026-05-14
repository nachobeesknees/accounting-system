import Link from "next/link";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  DEMO_TODAY,
  getBills,
  getCustomers,
  getInvoices,
  getKpis,
  getVendors,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatMoney, parseAmount } from "@/lib/money";

const HORIZON_WEEKS = 12;

type WeekRow = {
  weekIndex: number;
  weekStart: string; // ISO Monday
  weekEnd: string; // ISO Sunday (inclusive)
  opening: number;
  inflows: number;
  outflows: number;
  closing: number;
  arEvents: Array<{
    id: string;
    invoiceNumber: string;
    customerName: string;
    date: string;
    expectedFromDueDate: boolean;
    amount: number;
  }>;
  apEvents: Array<{
    id: string;
    billNumber: string;
    vendorName: string;
    dueDate: string;
    amount: number;
  }>;
};

function startOfWeekMonday(d: Date): Date {
  const out = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = out.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  out.setUTCDate(out.getUTCDate() + diff);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function Page() {
  const today = DEMO_TODAY;
  const startMonday = startOfWeekMonday(today);

  const [kpis, invoices, bills, customers, vendors] = await Promise.all([
    getKpis(),
    getInvoices(),
    getBills(),
    getCustomers(),
    getVendors(),
  ]);

  const customersById = new Map(customers.map((c) => [c.id, c] as const));
  const vendorsById = new Map(vendors.map((v) => [v.id, v] as const));

  // Build the 12 buckets up front so empty weeks still render.
  const rows: WeekRow[] = [];
  for (let i = 0; i < HORIZON_WEEKS; i++) {
    const ws = addDays(startMonday, i * 7);
    const we = addDays(ws, 6);
    rows.push({
      weekIndex: i,
      weekStart: iso(ws),
      weekEnd: iso(we),
      opening: 0,
      inflows: 0,
      outflows: 0,
      closing: 0,
      arEvents: [],
      apEvents: [],
    });
  }
  const lastDay = rows[rows.length - 1].weekEnd;

  function weekIndexFor(dateIso: string): number {
    // Pre-horizon dates roll into week 0 (we want them in the opening week's
    // cash so collections don't get silently dropped). Post-horizon dates
    // fall off the bottom.
    if (dateIso < rows[0].weekStart) return 0;
    if (dateIso > lastDay) return -1;
    for (let i = 0; i < rows.length; i++) {
      if (dateIso >= rows[i].weekStart && dateIso <= rows[i].weekEnd) return i;
    }
    return -1;
  }

  // AR inflows: open invoices, grouped by expectedPaymentDate (or dueDate
  // fallback). Excludes void + paid.
  for (const inv of invoices) {
    const balance = parseAmount(inv.balanceDue);
    if (balance <= 0) continue;
    if (inv.status === "void" || inv.status === "paid") continue;

    const expectedDate = inv.expectedPaymentDate ?? inv.dueDate;
    const idx = weekIndexFor(expectedDate);
    if (idx < 0) continue;
    rows[idx].inflows += balance;
    rows[idx].arEvents.push({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName: customersById.get(inv.customerId)?.name ?? "—",
      date: expectedDate,
      expectedFromDueDate: inv.expectedPaymentDate == null,
      amount: balance,
    });
  }

  // AP outflows: open bills, grouped by dueDate. Excludes void + paid.
  for (const bill of bills) {
    const balance = parseAmount(bill.balanceDue);
    if (balance <= 0) continue;
    if (bill.status === "void" || bill.status === "paid") continue;

    const idx = weekIndexFor(bill.dueDate);
    if (idx < 0) continue;
    rows[idx].outflows += balance;
    rows[idx].apEvents.push({
      id: bill.id,
      billNumber: bill.billNumber,
      vendorName: vendorsById.get(bill.vendorId)?.name ?? "—",
      dueDate: bill.dueDate,
      amount: balance,
    });
  }

  // Roll opening/closing across the horizon. Opening balance = current cash.
  let running = kpis.cash;
  for (const r of rows) {
    r.opening = running;
    r.closing = running + r.inflows - r.outflows;
    running = r.closing;
  }

  // Quick sums for the summary card.
  const totalIn = rows.reduce((s, r) => s + r.inflows, 0);
  const totalOut = rows.reduce((s, r) => s + r.outflows, 0);
  const ending = rows[rows.length - 1].closing;

  // Identify the worst trough — useful for the cash-runway warning.
  let lowestWeek = rows[0];
  for (const r of rows) {
    if (r.closing < lowestWeek.closing) lowestWeek = r;
  }
  const lowestNegative = lowestWeek.closing < 0;

  return (
    <>
      <PageHeader
        title="12-Week Cash Forecast"
        meta={`Week of ${formatDate(rows[0].weekStart)} → ${formatDate(rows[HORIZON_WEEKS - 1].weekEnd)} · opening ${formatMoney(kpis.cash, "USD", { compact: true })}`}
      />

      <div className="px-6 py-3.5 pb-8 flex flex-col gap-3.5">
        <div className="grid gap-3 grid-cols-1 md:grid-cols-4">
          <Card title="Opening cash" bodyPadding>
            <div
              className="text-[20px] font-semibold"
              style={{
                fontFamily: "var(--font-mono)",
                fontVariantNumeric: "tabular-nums",
                color: kpis.cash >= 0 ? "var(--ink)" : "var(--p-review-fg)",
              }}
            >
              {formatMoney(kpis.cash, "USD", { compact: true, paren: true })}
            </div>
          </Card>
          <Card title="Total inflows (AR)" bodyPadding>
            <div
              className="text-[20px] font-semibold"
              style={{
                fontFamily: "var(--font-mono)",
                fontVariantNumeric: "tabular-nums",
                color: "var(--p-active-fg)",
              }}
            >
              {formatMoney(totalIn, "USD", { compact: true })}
            </div>
          </Card>
          <Card title="Total outflows (AP)" bodyPadding>
            <div
              className="text-[20px] font-semibold"
              style={{
                fontFamily: "var(--font-mono)",
                fontVariantNumeric: "tabular-nums",
                color: "var(--p-review-fg)",
              }}
            >
              {formatMoney(totalOut, "USD", { compact: true })}
            </div>
          </Card>
          <Card title="Projected ending" bodyPadding>
            <div
              className="text-[20px] font-semibold"
              style={{
                fontFamily: "var(--font-mono)",
                fontVariantNumeric: "tabular-nums",
                color: ending >= 0 ? "var(--p-active-fg)" : "var(--p-review-fg)",
              }}
            >
              {formatMoney(ending, "USD", { compact: true, paren: true })}
            </div>
            {lowestNegative && (
              <div
                className="text-[11.5px] mt-1"
                style={{ color: "var(--p-review-fg)" }}
              >
                Trough week of {formatDate(lowestWeek.weekStart)} ·{" "}
                {formatMoney(lowestWeek.closing, "USD", {
                  compact: true,
                  paren: true,
                })}
              </div>
            )}
          </Card>
        </div>

        <Card title="Weekly rollup">
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Week</TH>
                <TH num>Opening</TH>
                <TH num>Inflows (AR)</TH>
                <TH num>Outflows (AP)</TH>
                <TH num>Net</TH>
                <TH num>Closing</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => {
                const net = r.inflows - r.outflows;
                return (
                  <TR key={r.weekStart} hover={false}>
                    <TD>
                      <div style={{ color: "var(--ink)" }}>
                        Week of {formatDate(r.weekStart)}
                      </div>
                      <div
                        className="text-[11px]"
                        style={{ color: "var(--ink-3)" }}
                      >
                        {formatDate(r.weekStart)} → {formatDate(r.weekEnd)}
                      </div>
                    </TD>
                    <TD num neg={r.opening < 0}>
                      {formatMoney(r.opening, "USD", {
                        compact: true,
                        paren: true,
                        hideCurrency: true,
                      })}
                    </TD>
                    <TD num>
                      {r.inflows === 0
                        ? "—"
                        : formatMoney(r.inflows, "USD", {
                            compact: true,
                            hideCurrency: true,
                          })}
                    </TD>
                    <TD num>
                      {r.outflows === 0
                        ? "—"
                        : formatMoney(r.outflows, "USD", {
                            compact: true,
                            hideCurrency: true,
                          })}
                    </TD>
                    <TD num neg={net < 0}>
                      {formatMoney(net, "USD", {
                        compact: true,
                        paren: true,
                        hideCurrency: true,
                      })}
                    </TD>
                    <TD num neg={r.closing < 0}>
                      {formatMoney(r.closing, "USD", {
                        compact: true,
                        paren: true,
                        hideCurrency: true,
                      })}
                    </TD>
                  </TR>
                );
              })}
              <TR total hover={false}>
                <TD>Totals</TD>
                <TD>{""}</TD>
                <TD num>
                  {formatMoney(totalIn, "USD", {
                    compact: true,
                    hideCurrency: true,
                  })}
                </TD>
                <TD num>
                  {formatMoney(totalOut, "USD", {
                    compact: true,
                    hideCurrency: true,
                  })}
                </TD>
                <TD num neg={totalIn - totalOut < 0}>
                  {formatMoney(totalIn - totalOut, "USD", {
                    compact: true,
                    paren: true,
                    hideCurrency: true,
                  })}
                </TD>
                <TD num neg={ending < 0}>
                  {formatMoney(ending, "USD", {
                    compact: true,
                    paren: true,
                    hideCurrency: true,
                  })}
                </TD>
              </TR>
            </TBody>
          </Table>
        </Card>

        <Card title="Forecast detail by week">
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Date</TH>
                <TH>Type</TH>
                <TH>Source</TH>
                <TH num>Amount</TH>
              </TR>
            </THead>
            <TBody>
              {rows.flatMap((r) => {
                const events: React.ReactNode[] = [];
                if (r.arEvents.length === 0 && r.apEvents.length === 0) {
                  events.push(
                    <TR key={`${r.weekStart}-empty`} hover={false}>
                      <TD colSpan={4} style={{ color: "var(--ink-3)" }}>
                        Week of {formatDate(r.weekStart)} — no cash events.
                      </TD>
                    </TR>,
                  );
                } else {
                  events.push(
                    <TR key={`${r.weekStart}-heading`} hover={false}>
                      <TD
                        colSpan={4}
                        style={{
                          color: "var(--ink-2)",
                          background: "var(--rail)",
                          fontWeight: 500,
                        }}
                      >
                        Week of {formatDate(r.weekStart)}
                      </TD>
                    </TR>,
                  );
                  for (const e of r.arEvents) {
                    events.push(
                      <TR key={`ar-${e.id}`} hover={false}>
                        <TD>{formatDate(e.date)}</TD>
                        <TD>
                          <span style={{ color: "var(--p-active-fg)" }}>
                            Inflow
                          </span>
                          {e.expectedFromDueDate && (
                            <span
                              className="ml-1.5"
                              style={{ color: "var(--ink-3)", fontSize: 11 }}
                            >
                              (due date)
                            </span>
                          )}
                        </TD>
                        <TD>
                          <Link
                            href={`/invoices/${e.id}`}
                            style={{ color: "var(--ink)", textDecoration: "none" }}
                          >
                            {e.invoiceNumber}
                          </Link>
                          <span
                            className="ml-1.5"
                            style={{ color: "var(--ink-3)" }}
                          >
                            · {e.customerName}
                          </span>
                        </TD>
                        <TD num>
                          {formatMoney(e.amount, "USD", {
                            compact: true,
                            hideCurrency: true,
                          })}
                        </TD>
                      </TR>,
                    );
                  }
                  for (const e of r.apEvents) {
                    events.push(
                      <TR key={`ap-${e.id}`} hover={false}>
                        <TD>{formatDate(e.dueDate)}</TD>
                        <TD>
                          <span style={{ color: "var(--p-review-fg)" }}>
                            Outflow
                          </span>
                        </TD>
                        <TD>
                          <Link
                            href={`/bills/${e.id}`}
                            style={{ color: "var(--ink)", textDecoration: "none" }}
                          >
                            {e.billNumber}
                          </Link>
                          <span
                            className="ml-1.5"
                            style={{ color: "var(--ink-3)" }}
                          >
                            · {e.vendorName}
                          </span>
                        </TD>
                        <TD num neg>
                          {formatMoney(-e.amount, "USD", {
                            compact: true,
                            paren: true,
                            hideCurrency: true,
                          })}
                        </TD>
                      </TR>,
                    );
                  }
                }
                return events;
              })}
            </TBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
