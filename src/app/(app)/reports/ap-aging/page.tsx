import Link from "next/link";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  DEMO_TODAY,
  getBills,
  getCustomers,
  getEntities,
  getKpis,
  getVendors,
} from "@/lib/data";
import { formatMoney, parseAmount } from "@/lib/money";

import { SelectableBillsTable, type SelectableBillRow } from "./SelectableBillsTable";

type Bucket = SelectableBillRow["bucket"];

const BUCKET_HEADERS: Array<{ key: Bucket; label: string }> = [
  { key: "current", label: "Current" },
  { key: "d30", label: "1–30 days" },
  { key: "d60", label: "31–60 days" },
  { key: "d90", label: "61–90 days" },
  { key: "d90p", label: "90+ days" },
];

function bucketFor(daysOverdue: number): Bucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d30";
  if (daysOverdue <= 60) return "d60";
  if (daysOverdue <= 90) return "d90";
  return "d90p";
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export default async function Page() {
  const today = DEMO_TODAY;

  const [bills, vendors, customers, entities, kpis] = await Promise.all([
    getBills(),
    getVendors(),
    getCustomers(),
    getEntities(),
    getKpis(),
  ]);

  const vendorsById = new Map(vendors.map((v) => [v.id, v] as const));
  const customersById = new Map(customers.map((c) => [c.id, c] as const));
  const entitiesById = new Map(entities.map((e) => [e.id, e] as const));

  // Per-vendor bucket totals + a flat list of selectable rows.
  type VendorAgingRow = {
    vendorId: string;
    vendorName: string;
    buckets: Record<Bucket, number>;
    total: number;
  };
  const byVendor = new Map<string, VendorAgingRow>();

  const flatRows: SelectableBillRow[] = [];
  let totalPayable = 0;

  for (const bill of bills) {
    const balance = parseAmount(bill.balanceDue);
    if (balance <= 0) continue;
    if (bill.status === "void" || bill.status === "paid") continue;

    const due = new Date(`${bill.dueDate}T00:00:00Z`);
    const daysOverdue = daysBetween(due, today);
    const bucket = bucketFor(daysOverdue);

    const vendor = vendorsById.get(bill.vendorId);
    const client = bill.clientId ? customersById.get(bill.clientId) : null;
    const entity = bill.entityId ? entitiesById.get(bill.entityId) : null;

    const existing =
      byVendor.get(bill.vendorId) ??
      ({
        vendorId: bill.vendorId,
        vendorName: vendor?.name ?? "—",
        buckets: { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 },
        total: 0,
      } as VendorAgingRow);
    existing.buckets[bucket] += balance;
    existing.total += balance;
    byVendor.set(bill.vendorId, existing);

    totalPayable += balance;

    flatRows.push({
      id: bill.id,
      billNumber: bill.billNumber,
      vendorName: vendor?.name ?? "—",
      vendorId: bill.vendorId,
      clientName: client?.name ?? "—",
      entityName: entity?.name ?? "—",
      billDate: bill.billDate,
      dueDate: bill.dueDate,
      daysOverdue,
      bucket,
      balanceDue: balance,
      status: bill.status,
    });
  }

  // Sort vendors most-overdue-first (90+ buckets descending) then total.
  const vendorRows = Array.from(byVendor.values()).sort((a, b) => {
    if (b.buckets.d90p !== a.buckets.d90p) return b.buckets.d90p - a.buckets.d90p;
    if (b.buckets.d90 !== a.buckets.d90) return b.buckets.d90 - a.buckets.d90;
    return b.total - a.total;
  });

  const totals: Record<Bucket, number> = {
    current: 0,
    d30: 0,
    d60: 0,
    d90: 0,
    d90p: 0,
  };
  for (const r of vendorRows) {
    for (const k of Object.keys(totals) as Bucket[]) totals[k] += r.buckets[k];
  }

  // Sort flat rows for the selectable table: most overdue at top.
  flatRows.sort((a, b) => {
    if (b.daysOverdue !== a.daysOverdue) return b.daysOverdue - a.daysOverdue;
    return a.dueDate.localeCompare(b.dueDate);
  });

  // Funds-in-hand light:
  //   green  → cash >= 1.5x payables
  //   yellow → 0.75x–1.5x
  //   red    → < 0.75x or cash <= 0
  const cash = kpis.cash;
  const ratio = totalPayable === 0 ? Infinity : cash / totalPayable;
  let status: "green" | "yellow" | "red";
  if (cash <= 0 || ratio < 0.75) status = "red";
  else if (ratio < 1.5) status = "yellow";
  else status = "green";

  const statusColor: Record<typeof status, string> = {
    green: "var(--p-active-fg)",
    yellow: "var(--p-pending-fg)",
    red: "var(--p-review-fg)",
  };
  const statusBg: Record<typeof status, string> = {
    green: "var(--p-active-bg)",
    yellow: "var(--p-pending-bg)",
    red: "var(--p-review-bg)",
  };
  const statusLabelMap: Record<typeof status, string> = {
    green: "Comfortable cushion",
    yellow: "Tight but workable",
    red: "Cash crunch",
  };

  return (
    <>
      <PageHeader
        title="AP Aging"
        meta={`As of ${today.toISOString().slice(0, 10)} · ${vendorRows.length} vendors with open payables`}
      />

      <div className="px-6 py-3.5 pb-8 flex flex-col gap-3.5">
        <Card title="Funds in hand vs. payables" bodyPadding>
          <div className="flex flex-col md:flex-row md:items-stretch gap-4">
            <div
              className="flex-1 rounded-md px-4 py-3"
              style={{
                background: "var(--rail)",
                border: "1px solid var(--line)",
              }}
            >
              <div className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                Cash on hand
              </div>
              <div
                className="text-[22px] font-semibold mt-1"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  color: cash >= 0 ? "var(--ink)" : "var(--p-review-fg)",
                }}
              >
                {formatMoney(cash, "USD", { compact: true, paren: true })}
              </div>
            </div>
            <div
              className="flex-1 rounded-md px-4 py-3"
              style={{
                background: "var(--rail)",
                border: "1px solid var(--line)",
              }}
            >
              <div className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                Total payables (open balance)
              </div>
              <div
                className="text-[22px] font-semibold mt-1"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--ink)",
                }}
              >
                {formatMoney(totalPayable, "USD", { compact: true, paren: true })}
              </div>
            </div>
            <div
              className="flex-1 rounded-md px-4 py-3"
              style={{
                background: statusBg[status],
                border: `1px solid ${statusColor[status]}`,
              }}
            >
              <div
                className="text-[11.5px] flex items-center gap-1.5"
                style={{ color: statusColor[status] }}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: statusColor[status] }}
                />
                {statusLabelMap[status]}
              </div>
              <div
                className="text-[22px] font-semibold mt-1"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  color: statusColor[status],
                }}
              >
                {formatMoney(cash - totalPayable, "USD", {
                  compact: true,
                  paren: true,
                })}
              </div>
              <div
                className="text-[11.5px] mt-1"
                style={{ color: statusColor[status] }}
              >
                {totalPayable === 0
                  ? "No open payables"
                  : `Cash covers ${(ratio * 100).toFixed(0)}% of open AP`}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Aging by vendor">
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Vendor</TH>
                {BUCKET_HEADERS.map((h) => (
                  <TH key={h.key} num>
                    {h.label}
                  </TH>
                ))}
                <TH num>Total open</TH>
              </TR>
            </THead>
            <TBody>
              {vendorRows.length === 0 && (
                <TR hover={false}>
                  <TD colSpan={7} style={{ color: "var(--ink-3)" }}>
                    No open vendor payables.
                  </TD>
                </TR>
              )}
              {vendorRows.map((r) => (
                <TR key={r.vendorId} hover={false}>
                  <TD>
                    <Link
                      href={`/vendors/${r.vendorId}`}
                      style={{ color: "var(--ink)", textDecoration: "none" }}
                    >
                      {r.vendorName}
                    </Link>
                  </TD>
                  {BUCKET_HEADERS.map((h) => (
                    <TD key={h.key} num neg={h.key === "d90p" && r.buckets[h.key] > 0}>
                      {r.buckets[h.key] === 0
                        ? "—"
                        : formatMoney(r.buckets[h.key], "USD", {
                            compact: true,
                            paren: true,
                            hideCurrency: true,
                          })}
                    </TD>
                  ))}
                  <TD num>
                    {formatMoney(r.total, "USD", {
                      compact: true,
                      paren: true,
                      hideCurrency: true,
                    })}
                  </TD>
                </TR>
              ))}
              <TR total hover={false}>
                <TD>Totals</TD>
                {BUCKET_HEADERS.map((h) => (
                  <TD key={h.key} num>
                    {formatMoney(totals[h.key], "USD", {
                      compact: true,
                      paren: true,
                      hideCurrency: true,
                    })}
                  </TD>
                ))}
                <TD num>
                  {formatMoney(totalPayable, "USD", {
                    compact: true,
                    paren: true,
                    hideCurrency: true,
                  })}
                </TD>
              </TR>
            </TBody>
          </Table>
        </Card>

        <Card title="Bills to pay">
          <SelectableBillsTable rows={flatRows} />
        </Card>
      </div>
    </>
  );
}
