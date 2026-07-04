import Link from "next/link";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { DrillNumber } from "@/components/DrillNumber";
import { PrintButton } from "@/components/PrintButton";
import { CsvDownloadButton } from "@/components/CsvDownloadButton";
import { GlTieOut, ReconcilingItemsCard } from "@/components/AgingTieOut";
import {
  getBankAccounts,
  getBaseCurrency,
  getBills,
  getCustomers,
  getEntities,
  getKpis,
  getSubledgerReconciliation,
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

const EMPTY_BUCKETS = (): Record<Bucket, number> => ({
  current: 0,
  d30: 0,
  d60: 0,
  d90: 0,
  d90p: 0,
});

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
  const today = new Date();
  const asOf = today.toISOString().slice(0, 10);

  const [bills, vendors, customers, entities, kpis, bankAccounts, base, recon] =
    await Promise.all([
      getBills(),
      getVendors(),
      getCustomers(),
      getEntities(),
      getKpis(),
      getBankAccounts(),
      getBaseCurrency(),
      getSubledgerReconciliation("ap", new Date().toISOString().slice(0, 10)),
    ]);
  const baseCode = base?.code ?? "USD";

  const vendorsById = new Map(vendors.map((v) => [v.id, v] as const));
  const customersById = new Map(customers.map((c) => [c.id, c] as const));
  const entitiesById = new Map(entities.map((e) => [e.id, e] as const));

  // Pick the bank account most likely to fund a given bill: prefer one
  // tied to the bill's on-behalf-of entity, else the on-behalf-of client,
  // else fall back to the first active firm bank account (best-effort —
  // bills don't carry an explicit pay-from field today).
  const activeBanks = bankAccounts.filter((b) => b.isActive);
  const bankByEntity = new Map(
    activeBanks
      .filter((b) => b.entityId)
      .map((b) => [b.entityId as string, b] as const),
  );
  const bankByClient = new Map(
    activeBanks
      .filter((b) => b.clientId && !b.entityId)
      .map((b) => [b.clientId as string, b] as const),
  );
  const fallbackBank = activeBanks.find((b) => !b.entityId && !b.clientId)
    ?? activeBanks[0];
  function pickBank(bill: {
    entityId?: string | null;
    clientId?: string | null;
  }) {
    if (bill.entityId && bankByEntity.has(bill.entityId)) {
      return bankByEntity.get(bill.entityId);
    }
    if (bill.clientId && bankByClient.has(bill.clientId)) {
      return bankByClient.get(bill.clientId);
    }
    return fallbackBank;
  }

  // Per vendor × CURRENCY bucket totals — bills come in NZD/HKD/USD, so
  // each row aggregates a single currency and the totals block shows one
  // native row per currency plus a base-converted grand total using each
  // bill's fxRate snapshot (base = native / fxRate; NULL = already base).
  type VendorAgingRow = {
    vendorId: string;
    vendorName: string;
    currencyCode: string;
    buckets: Record<Bucket, number>;
    total: number;
    totalBase: number;
  };
  const byVendorCurrency = new Map<string, VendorAgingRow>();

  const flatRows: SelectableBillRow[] = [];
  let totalPayableBase = 0;
  // Raw native sum — same units as the raw-GL cash figure below (journal
  // lines are booked native), so the funds-in-hand ratio compares like
  // with like. Mixed currencies at "all" scope, office currency at office
  // scope — exactly mirroring the GL.
  let totalPayableNative = 0;
  const totalsByCurrency = new Map<
    string,
    { buckets: Record<Bucket, number>; total: number }
  >();
  const totalsBase: Record<Bucket, number> = EMPTY_BUCKETS();

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

    const fx = bill.fxRate == null ? null : parseAmount(bill.fxRate);
    const balanceBase = fx != null && fx > 0 ? balance / fx : balance;

    const rowKey = `${bill.vendorId}|${bill.currencyCode}`;
    const existing =
      byVendorCurrency.get(rowKey) ??
      ({
        vendorId: bill.vendorId,
        vendorName: vendor?.name ?? "—",
        currencyCode: bill.currencyCode,
        buckets: EMPTY_BUCKETS(),
        total: 0,
        totalBase: 0,
      } as VendorAgingRow);
    existing.buckets[bucket] += balance;
    existing.total += balance;
    existing.totalBase += balanceBase;
    byVendorCurrency.set(rowKey, existing);

    const curTotals =
      totalsByCurrency.get(bill.currencyCode) ??
      ({ buckets: EMPTY_BUCKETS(), total: 0 });
    curTotals.buckets[bucket] += balance;
    curTotals.total += balance;
    totalsByCurrency.set(bill.currencyCode, curTotals);

    totalsBase[bucket] += balanceBase;
    totalPayableBase += balanceBase;
    totalPayableNative += balance;

    const bank = pickBank(bill);
    flatRows.push({
      id: bill.id,
      billNumber: bill.billNumber,
      vendorName: vendor?.name ?? "—",
      vendorId: bill.vendorId,
      clientName: client?.name ?? "—",
      entityName: entity?.name ?? "—",
      bankAccountName: bank?.name ?? "—",
      billDate: bill.billDate,
      dueDate: bill.dueDate,
      daysOverdue,
      bucket,
      balanceDue: balance,
      currencyCode: bill.currencyCode,
      balanceDueBase: balanceBase,
      status: bill.status,
    });
  }

  // Sort vendors most-overdue-first (90+ buckets descending) then total.
  const vendorRows = Array.from(byVendorCurrency.values()).sort((a, b) => {
    if (b.buckets.d90p !== a.buckets.d90p) return b.buckets.d90p - a.buckets.d90p;
    if (b.buckets.d90 !== a.buckets.d90) return b.buckets.d90 - a.buckets.d90;
    return b.totalBase - a.totalBase;
  });

  const currencyTotalRows = Array.from(totalsByCurrency.entries()).sort(
    ([a], [b]) => a.localeCompare(b),
  );

  // Sort flat rows for the selectable table: most overdue at top.
  flatRows.sort((a, b) => {
    if (b.daysOverdue !== a.daysOverdue) return b.daysOverdue - a.daysOverdue;
    return a.dueDate.localeCompare(b.dueDate);
  });

  // Funds-in-hand light — cash vs payables. kpis.cash is a RAW GL sum of
  // account 1000 (journal lines are booked in native units, payment JEs
  // carry no fx snapshot), so the only unit-consistent comparison is
  // against the raw NATIVE payables total, not the base equivalent:
  //   green  → cash >= 1.5x payables
  //   yellow → 0.75x–1.5x
  //   red    → < 0.75x or cash <= 0
  const cash = kpis.cash;
  const ratio = totalPayableNative === 0 ? Infinity : cash / totalPayableNative;
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

  const distinctVendors = new Set(vendorRows.map((r) => r.vendorId)).size;

  return (
    <>
      <PageHeader
        title="AP Aging"
        meta={`As of ${asOf} · ${distinctVendors} vendors with open payables · totals per currency + ${baseCode} equivalent`}
        actions={
          <>
            <CsvDownloadButton report="ap-aging" />
            <PrintButton />
          </>
        }
      />

      <div className="px-6 py-3.5 pb-8 flex flex-col gap-3.5">
        <GlTieOut
          recon={recon}
          subledgerLabel="AP subledger (open posted bills)"
        />
        <ReconcilingItemsCard recon={recon} />

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
                {formatMoney(cash, null, {
                  compact: true,
                  paren: true,
                  hideCurrency: true,
                })}
              </div>
              <div className="text-[11.5px] mt-1" style={{ color: "var(--ink-3)" }}>
                Raw GL balance at the current scope (native units)
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
                Total payables ({baseCode} equivalent of open balances)
              </div>
              <div
                className="text-[22px] font-semibold mt-1"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--ink)",
                }}
              >
                {formatMoney(totalPayableBase, baseCode, {
                  compact: true,
                  paren: true,
                })}
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
                {formatMoney(cash - totalPayableNative, null, {
                  compact: true,
                  paren: true,
                  hideCurrency: true,
                })}
              </div>
              <div
                className="text-[11.5px] mt-1"
                style={{ color: statusColor[status] }}
              >
                {totalPayableNative === 0
                  ? "No open payables"
                  : `Cash covers ${(ratio * 100).toFixed(0)}% of open AP (native GL units)`}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Aging by vendor · one row per vendor and currency">
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Vendor</TH>
                <TH>Currency</TH>
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
                  <TD colSpan={8} style={{ color: "var(--ink-3)" }}>
                    No open vendor payables.
                  </TD>
                </TR>
              )}
              {vendorRows.map((r) => {
                const vendorBillsHref = `/bills?vendor=${encodeURIComponent(r.vendorId)}`;
                return (
                  <TR key={`${r.vendorId}|${r.currencyCode}`} hover={false}>
                    <TD>
                      <Link
                        href={vendorBillsHref}
                        style={{ color: "var(--ink)", textDecoration: "none" }}
                        title="Show this vendor's bills"
                      >
                        {r.vendorName}
                      </Link>
                    </TD>
                    <TD mono>{r.currencyCode}</TD>
                    {BUCKET_HEADERS.map((h) => {
                      const v = r.buckets[h.key];
                      const href = `/bills?vendor=${encodeURIComponent(r.vendorId)}&bucket=${h.key}`;
                      return (
                        <TD
                          key={h.key}
                          num
                          neg={h.key === "d90p" && v > 0}
                        >
                          {v === 0 ? (
                            "—"
                          ) : (
                            <DrillNumber
                              value={v}
                              href={href}
                              currencyCode={null}
                              compact
                              neg={h.key === "d90p" && v > 0}
                            />
                          )}
                        </TD>
                      );
                    })}
                    <TD num>
                      <DrillNumber
                        value={r.total}
                        href={vendorBillsHref}
                        currencyCode={null}
                        compact
                        title={`≈ ${formatMoney(r.totalBase, baseCode, { compact: true, paren: true })}`}
                      />
                    </TD>
                  </TR>
                );
              })}
              {currencyTotalRows.map(([code, t]) => (
                <TR key={`total-${code}`} total hover={false}>
                  <TD>Totals ({code})</TD>
                  <TD mono>{code}</TD>
                  {BUCKET_HEADERS.map((h) => (
                    <TD key={h.key} num>
                      {t.buckets[h.key] === 0 ? (
                        "—"
                      ) : (
                        <DrillNumber
                          value={t.buckets[h.key]}
                          href={`/bills?bucket=${h.key}`}
                          currencyCode={null}
                          compact
                        />
                      )}
                    </TD>
                  ))}
                  <TD num>
                    <DrillNumber
                      value={t.total}
                      href="/bills"
                      currencyCode={null}
                      compact
                    />
                  </TD>
                </TR>
              ))}
              <TR total hover={false}>
                <TD>Total ({baseCode} equivalent)</TD>
                <TD mono>{baseCode}</TD>
                {BUCKET_HEADERS.map((h) => (
                  <TD key={h.key} num>
                    <DrillNumber
                      value={totalsBase[h.key]}
                      href={`/bills?bucket=${h.key}`}
                      currencyCode={null}
                      compact
                      title="Converted per bill with its fxRate snapshot"
                    />
                  </TD>
                ))}
                <TD num>
                  <DrillNumber
                    value={totalPayableBase}
                    href="/bills"
                    currencyCode={null}
                    compact
                    title="Converted per bill with its fxRate snapshot"
                  />
                </TD>
              </TR>
            </TBody>
          </Table>
        </Card>

        <Card title="Bills to pay">
          <SelectableBillsTable
            rows={flatRows}
            cashOnHand={cash}
            baseCurrencyCode={baseCode}
          />
        </Card>
      </div>
    </>
  );
}
