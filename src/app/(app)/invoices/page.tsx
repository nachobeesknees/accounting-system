import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, SelectField } from "@/components/ui/Field";
import { SmartSelectField } from "@/components/ui/SmartSelect";
import { IconReceipt } from "@/components/ui/Icon";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  DEMO_TODAY,
  getCustomers,
  getInvoices,
  getRegions,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatMoney, parseAmount } from "@/lib/money";
import { DrillNumber } from "@/components/DrillNumber";
import { duplicateInvoiceAction } from "../duplicate-actions";
import type { Customer, Invoice } from "@/lib/types";

type Bucket = "current" | "d30" | "d60" | "d90" | "d90p";

const VALID_BUCKETS: ReadonlySet<string> = new Set([
  "current",
  "d30",
  "d60",
  "d90",
  "d90p",
]);

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

function filterInvoices(
  invoices: Invoice[],
  customersById: Map<string, Customer>,
  q: string,
  status: string,
  customer: string,
  bucket: string,
  today: Date,
  customerIdsInRegion: Set<string> | null,
): Invoice[] {
  const needle = q.trim().toLowerCase();
  return invoices.filter((inv) => {
    if (status && inv.status !== status) return false;
    if (customer && inv.customerId !== customer) return false;
    if (customerIdsInRegion && !customerIdsInRegion.has(inv.customerId)) {
      return false;
    }
    if (bucket && VALID_BUCKETS.has(bucket)) {
      const bal = parseAmount(inv.balanceDue);
      if (bal <= 0) return false;
      if (inv.status === "void" || inv.status === "paid") return false;
      const due = new Date(`${inv.dueDate}T00:00:00Z`);
      const daysOverdue = daysBetween(due, today);
      if (bucketFor(daysOverdue) !== bucket) return false;
    }
    if (needle) {
      const cust = customersById.get(inv.customerId);
      const hay = `${inv.invoiceNumber} ${cust?.name ?? ""} ${cust?.code ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

const BUCKET_LABEL: Record<Bucket, string> = {
  current: "Current",
  d30: "1–30 days overdue",
  d60: "31–60 days overdue",
  d90: "61–90 days overdue",
  d90p: "90+ days overdue",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    customer?: string;
    q?: string;
    bucket?: string;
    region?: string;
  }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const status = params.status ?? "";
  const customerId = params.customer ?? "";
  const bucket = params.bucket ?? "";
  const regionId = params.region ?? "";

  const [allInvoices, allCustomers, allRegions] = await Promise.all([
    getInvoices(),
    getCustomers(),
    getRegions(),
  ]);
  const customersById = new Map(allCustomers.map((c) => [c.id, c] as const));
  const customerIdsInRegion = regionId
    ? new Set(
        allCustomers
          .filter((c) => (c.regionId ?? null) === regionId)
          .map((c) => c.id),
      )
    : null;
  const rows = filterInvoices(
    allInvoices,
    customersById,
    q,
    status,
    customerId,
    bucket,
    DEMO_TODAY,
    customerIdsInRegion,
  )
    .slice()
    .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
  const customers = allCustomers
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const activeBucketLabel =
    bucket && VALID_BUCKETS.has(bucket) ? BUCKET_LABEL[bucket as Bucket] : null;

  const totalSum = rows.reduce((s, inv) => s + parseAmount(inv.total), 0);
  const balanceSum = rows.reduce((s, inv) => s + parseAmount(inv.balanceDue), 0);

  return (
    <>
      <PageHeader
        title="Invoices"
        meta={`${rows.length} invoices`}
        actions={
          <>
            <ButtonLink variant="secondary" href="/invoices/generate">
              Generate from fees
            </ButtonLink>
            <ButtonLink variant="primary" href="/invoices/new">
              + New invoice
            </ButtonLink>
          </>
        }
      />

      <div
        className="px-6 py-2 flex gap-2 flex-wrap items-end"
        style={{
          background: "var(--rail)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <form method="GET" className="flex gap-2 flex-wrap items-end">
          <Field
            label="Search"
            name="q"
            placeholder="Invoice # or customer"
            defaultValue={q}
          />
          <SelectField label="Status" name="status" defaultValue={status}>
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="void">Void</option>
          </SelectField>
          <SmartSelectField
            label="Customer"
            name="customer"
            defaultValue={customerId}
            options={customers.map((c) => ({
              value: c.id,
              label: c.name,
              search: c.code,
            }))}
            emptyLabel="All"
            clearable
          />
          <SelectField label="Aging bucket" name="bucket" defaultValue={bucket}>
            <option value="">All</option>
            <option value="current">Current (not overdue)</option>
            <option value="d30">1–30 days overdue</option>
            <option value="d60">31–60 days overdue</option>
            <option value="d90">61–90 days overdue</option>
            <option value="d90p">90+ days overdue</option>
          </SelectField>
          <SmartSelectField
            label="Region"
            name="region"
            defaultValue={regionId}
            options={allRegions.map((r) => ({
              value: r.id,
              label: r.name,
            }))}
            emptyLabel="All"
            clearable
          />
          <Button variant="primary" type="submit">
            Apply
          </Button>
          <ButtonLink variant="ghost" href="/invoices">
            Reset
          </ButtonLink>
        </form>
      </div>
      {activeBucketLabel && (
        <div
          className="px-6 py-1 text-[11.5px]"
          style={{
            background: "var(--rail)",
            color: "var(--ink-3)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          Showing only invoices in the <strong>{activeBucketLabel}</strong> bucket
          (open balance, not paid/void).
        </div>
      )}

      <div className="px-6 py-3.5 pb-8">
        <Card title="Invoices">
          {rows.length === 0 ? (
            <Empty
              icon={<IconReceipt size={20} />}
              title={
                allInvoices.length === 0
                  ? "No invoices yet"
                  : "No invoices match these filters"
              }
              body={
                allInvoices.length === 0
                  ? "Bill a client by hand, or auto-generate invoices from your fee schedules."
                  : "Try clearing the filters or create a new invoice."
              }
              cta={
                <ButtonLink variant="primary" href="/invoices/new">
                  + New invoice
                </ButtonLink>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Invoice #</TH>
                  <TH>Customer</TH>
                  <TH>Date</TH>
                  <TH>Due</TH>
                  <TH num>Total (USD)</TH>
                  <TH num>Balance (USD)</TH>
                  <TH>Status</TH>
                  <TH>{""}</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((inv) => {
                  const cust = customersById.get(inv.customerId);
                  const bal = parseAmount(inv.balanceDue);
                  const isOverdue = inv.status === "overdue" && bal > 0;
                  return (
                    <TR key={inv.id} href={`/invoices/${inv.id}`}>
                      <TD mono>
                        <Link
                          href={`/invoices/${inv.id}`}
                          style={{ color: "var(--ink)", textDecoration: "none" }}
                        >
                          {inv.invoiceNumber}
                        </Link>
                      </TD>
                      <TD>{cust?.name ?? "—"}</TD>
                      <TD>{formatDate(inv.invoiceDate)}</TD>
                      <TD>{formatDate(inv.dueDate)}</TD>
                      <TD num>
                        <DrillNumber
                          value={inv.total}
                          href={`/invoices/${inv.id}`}
                          currencyCode={null}
                          compact
                        />
                      </TD>
                      <TD num neg={isOverdue}>
                        <DrillNumber
                          value={bal}
                          href={`/invoices/${inv.id}`}
                          currencyCode={null}
                          compact
                          neg={isOverdue || bal < 0}
                        />
                      </TD>
                      <TD>
                        <Pill variant={statusVariant(inv.status)}>
                          {statusLabel(inv.status)}
                        </Pill>
                      </TD>
                      <TD>
                        <form action={duplicateInvoiceAction}>
                          <input type="hidden" name="invoiceId" value={inv.id} />
                          <button
                            type="submit"
                            title="Duplicate as draft"
                            style={{
                              background: "transparent",
                              border: "1px solid var(--line-2)",
                              borderRadius: 4,
                              color: "var(--ink-3)",
                              cursor: "pointer",
                              fontSize: 11,
                              padding: "1px 6px",
                            }}
                          >
                            Duplicate
                          </button>
                        </form>
                      </TD>
                    </TR>
                  );
                })}
                <TR total hover={false}>
                  <TD>Total</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD num>{formatMoney(totalSum, "USD", { paren: true, compact: true, hideCurrency: true })}</TD>
                  <TD num>{formatMoney(balanceSum, "USD", { paren: true, compact: true, hideCurrency: true })}</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                </TR>
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
