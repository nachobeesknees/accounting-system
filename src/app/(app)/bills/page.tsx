import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, SelectField } from "@/components/ui/Field";
import { SmartSelectField } from "@/components/ui/SmartSelect";
import { IconFile } from "@/components/ui/Icon";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { SortableTH } from "@/components/ui/SortableTH";
import { Pagination } from "@/components/ui/Pagination";
import { parseSort, paginate } from "@/lib/list-params";
import { SavedViews } from "@/components/SavedViews";
import {
  getBills,
  getCustomers,
  getEntities,
  getRegions,
  getSavedViews,
  getVendors,
} from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { formatMoney, parseAmount } from "@/lib/money";
import { DrillNumber } from "@/components/DrillNumber";
import { duplicateBillAction } from "../duplicate-actions";
import type { Bill, Customer, Entity, Vendor } from "@/lib/types";

const PAGE_SIZE = 50;
const BILL_SORT_COLUMNS = [
  "number",
  "vendor",
  "client",
  "entity",
  "date",
  "due",
  "total",
  "balance",
  "status",
] as const;
type BillSortCol = (typeof BILL_SORT_COLUMNS)[number];

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

const BUCKET_LABEL: Record<Bucket, string> = {
  current: "Current",
  d30: "1–30 days overdue",
  d60: "31–60 days overdue",
  d90: "61–90 days overdue",
  d90p: "90+ days overdue",
};

function filterBills(
  bills: Bill[],
  vendorsById: Map<string, Vendor>,
  q: string,
  status: string,
  vendor: string,
  client: string,
  entity: string,
  bucket: string,
  today: Date,
  scopedIds: Set<string> | null,
): Bill[] {
  const needle = q.trim().toLowerCase();
  return bills.filter((bill) => {
    if (status && bill.status !== status) return false;
    if (vendor && bill.vendorId !== vendor) return false;
    if (client && bill.clientId !== client) return false;
    if (entity && bill.entityId !== entity) return false;
    if (scopedIds && !scopedIds.has(bill.id)) return false;
    if (bucket && VALID_BUCKETS.has(bucket)) {
      const bal = parseAmount(bill.balanceDue);
      if (bal <= 0) return false;
      if (bill.status === "void" || bill.status === "paid") return false;
      const due = new Date(`${bill.dueDate}T00:00:00Z`);
      const daysOverdue = daysBetween(due, today);
      if (bucketFor(daysOverdue) !== bucket) return false;
    }
    if (needle) {
      const vend = vendorsById.get(bill.vendorId);
      const hay = `${bill.billNumber} ${vend?.name ?? ""} ${vend?.code ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

function sortBills(
  rows: Bill[],
  vendorsById: Map<string, Vendor>,
  customersById: Map<string, Customer>,
  entitiesById: Map<string, Entity>,
  col: BillSortCol,
  dir: "asc" | "desc",
): Bill[] {
  const factor = dir === "asc" ? 1 : -1;
  const vendorName = (b: Bill) => vendorsById.get(b.vendorId)?.name ?? "";
  const clientName = (b: Bill) =>
    b.clientId ? (customersById.get(b.clientId)?.name ?? "") : "";
  const entityName = (b: Bill) =>
    b.entityId ? (entitiesById.get(b.entityId)?.name ?? "") : "";
  const cmp = (a: Bill, b: Bill): number => {
    switch (col) {
      case "number":
        return a.billNumber.localeCompare(b.billNumber);
      case "vendor":
        return vendorName(a).localeCompare(vendorName(b));
      case "client":
        return clientName(a).localeCompare(clientName(b));
      case "entity":
        return entityName(a).localeCompare(entityName(b));
      case "date":
        return a.billDate.localeCompare(b.billDate);
      case "due":
        return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
      case "total":
        return parseAmount(a.total) - parseAmount(b.total);
      case "balance":
        return parseAmount(a.balanceDue) - parseAmount(b.balanceDue);
      case "status":
        return a.status.localeCompare(b.status);
    }
  };
  return rows.slice().sort((a, b) => factor * cmp(a, b));
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    vendor?: string;
    client?: string;
    entity?: string;
    q?: string;
    bucket?: string;
    region?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const status = params.status ?? "";
  const vendorId = params.vendor ?? "";
  const clientId = params.client ?? "";
  const entityId = params.entity ?? "";
  const bucket = params.bucket ?? "";
  const regionId = params.region ?? "";
  const { col: sortCol, dir: sortDir } = parseSort<BillSortCol>(
    params.sort,
    params.dir,
    BILL_SORT_COLUMNS,
  );
  const pageNum = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const user = await getSessionUser();
  const [allBills, allVendors, allCustomers, allEntities, allRegions, savedViews] =
    await Promise.all([
      getBills(),
      getVendors(),
      getCustomers(),
      getEntities(),
      getRegions(),
      user ? getSavedViews(user.userId, "/bills") : Promise.resolve([]),
    ]);
  const vendorsById = new Map(allVendors.map((v) => [v.id, v] as const));
  const customersById = new Map<string, Customer>(
    allCustomers.map((c) => [c.id, c] as const),
  );
  const entitiesById = new Map<string, Entity>(
    allEntities.map((e) => [e.id, e] as const),
  );
  // Region filter for bills: keep bills whose tied client OR entity falls
  // within the chosen region. Without either tie the bill is excluded from
  // a region scope (firm-level vendor bills don't carry geography).
  const scopedBillIds = regionId
    ? new Set(
        allBills
          .filter((b) => {
            const c = b.clientId ? customersById.get(b.clientId) : null;
            const e = b.entityId ? entitiesById.get(b.entityId) : null;
            return (
              (c && (c.regionId ?? null) === regionId) ||
              (e && (e.regionId ?? null) === regionId)
            );
          })
          .map((b) => b.id),
      )
    : null;
  const filtered = filterBills(
    allBills,
    vendorsById,
    q,
    status,
    vendorId,
    clientId,
    entityId,
    bucket,
    new Date(),
    scopedBillIds,
  );
  const sortedRows = sortCol
    ? sortBills(filtered, vendorsById, customersById, entitiesById, sortCol, sortDir)
    : filtered.slice().sort((a, b) => b.billDate.localeCompare(a.billDate));
  const {
    pageRows: rows,
    total: filteredTotal,
    page: currentPage,
  } = paginate(sortedRows, pageNum, PAGE_SIZE);
  const activeBucketLabel =
    bucket && VALID_BUCKETS.has(bucket) ? BUCKET_LABEL[bucket as Bucket] : null;
  const vendors = allVendors.slice().sort((a, b) => a.name.localeCompare(b.name));
  const customers = allCustomers
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const entitiesFiltered = (
    clientId ? allEntities.filter((e) => e.clientId === clientId) : allEntities
  )
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  // Totals are computed over the FULL filtered set, not the current page.
  const totalSum = filtered.reduce((s, b) => s + parseAmount(b.total), 0);
  const balanceSum = filtered.reduce((s, b) => s + parseAmount(b.balanceDue), 0);

  return (
    <>
      <PageHeader
        title="Bills"
        meta={`${filteredTotal} bill${filteredTotal === 1 ? "" : "s"}${
          filteredTotal > PAGE_SIZE
            ? ` · page ${currentPage} of ${Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE))}`
            : ""
        }`}
        actions={
          <>
            <ButtonLink variant="secondary" href="/bills/new?kind=vendor_credit">
              + Vendor credit
            </ButtonLink>
            <ButtonLink variant="primary" href="/bills/new">
              + New bill
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
            placeholder="Bill # or vendor"
            defaultValue={q}
          />
          <SelectField label="Status" name="status" defaultValue={status}>
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="void">Void</option>
          </SelectField>
          <SmartSelectField
            label="Vendor"
            name="vendor"
            defaultValue={vendorId}
            options={vendors.map((v) => ({
              value: v.id,
              label: v.name,
              search: v.code,
            }))}
            emptyLabel="All"
            clearable
          />
          <SmartSelectField
            label="Client"
            name="client"
            defaultValue={clientId}
            options={customers.map((c) => ({
              value: c.id,
              label: c.name,
              search: c.code,
            }))}
            emptyLabel="All"
            clearable
          />
          <SmartSelectField
            label="Entity"
            name="entity"
            defaultValue={entityId}
            options={entitiesFiltered.map((e) => ({
              value: e.id,
              label: e.name,
              search: e.code,
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
          {/* Preserve the active sort when re-applying filters. */}
          {sortCol && <input type="hidden" name="sort" value={sortCol} />}
          {sortCol && <input type="hidden" name="dir" value={sortDir} />}
          <Button variant="primary" type="submit">
            Apply
          </Button>
          <ButtonLink variant="ghost" href="/bills">
            Reset
          </ButtonLink>
        </form>
        {user && <SavedViews route="/bills" views={savedViews} />}
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
          Showing only bills in the <strong>{activeBucketLabel}</strong> bucket
          (open balance, not paid/void).
        </div>
      )}

      <div className="px-6 py-3.5 pb-8">
        <Card title="Bills">
          {rows.length === 0 ? (
            <Empty
              icon={<IconFile size={20} />}
              title={
                allBills.length === 0
                  ? "No bills yet"
                  : "No bills match these filters"
              }
              body={
                allBills.length === 0
                  ? "Track what you owe vendors. Bills hit the books when approved and clear when paid."
                  : "Try clearing the filters or create a new bill."
              }
              cta={
                <ButtonLink variant="primary" href="/bills/new">
                  + New bill
                </ButtonLink>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <SortableTH col="number">Bill #</SortableTH>
                  <SortableTH col="vendor">Vendor</SortableTH>
                  <SortableTH col="client">Client</SortableTH>
                  <SortableTH col="entity">Entity</SortableTH>
                  <SortableTH col="date">Date</SortableTH>
                  <SortableTH col="due">Due</SortableTH>
                  <SortableTH col="total" num>
                    Total (USD)
                  </SortableTH>
                  <SortableTH col="balance" num>
                    Balance (USD)
                  </SortableTH>
                  <SortableTH col="status">Status</SortableTH>
                  <TH>{""}</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((bill) => {
                  const vend = vendorsById.get(bill.vendorId);
                  const client = bill.clientId ? customersById.get(bill.clientId) : null;
                  const ent = bill.entityId ? entitiesById.get(bill.entityId) : null;
                  const bal = parseAmount(bill.balanceDue);
                  const isOverdue = bill.status === "overdue" && bal > 0;
                  return (
                    <TR key={bill.id} href={`/bills/${bill.id}`}>
                      <TD mono>
                        <Link
                          href={`/bills/${bill.id}`}
                          style={{ color: "var(--ink)", textDecoration: "none" }}
                        >
                          {bill.billNumber}
                        </Link>
                      </TD>
                      <TD>{vend?.name ?? "—"}</TD>
                      <TD>{client?.name ?? "—"}</TD>
                      <TD>{ent?.name ?? "—"}</TD>
                      <TD>{formatDate(bill.billDate)}</TD>
                      <TD>{formatDate(bill.dueDate)}</TD>
                      <TD num>
                        <DrillNumber
                          value={bill.total}
                          href={`/bills/${bill.id}`}
                          currencyCode={null}
                          compact
                        />
                      </TD>
                      <TD num neg={isOverdue}>
                        <DrillNumber
                          value={bal}
                          href={`/bills/${bill.id}`}
                          currencyCode={null}
                          compact
                          neg={isOverdue || bal < 0}
                        />
                      </TD>
                      <TD>
                        <Pill variant={statusVariant(bill.status)}>
                          {statusLabel(bill.status)}
                        </Pill>
                      </TD>
                      <TD>
                        <form action={duplicateBillAction}>
                          <input type="hidden" name="billId" value={bill.id} />
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
                  <TD>Total (all pages)</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
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
          <div className="mt-3">
            <Pagination
              page={currentPage}
              pageSize={PAGE_SIZE}
              total={filteredTotal}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
