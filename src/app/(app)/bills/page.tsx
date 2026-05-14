import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, SelectField } from "@/components/ui/Field";
import { IconFile } from "@/components/ui/Icon";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getBills,
  getCustomers,
  getEntities,
  getVendors,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatMoney, parseAmount } from "@/lib/money";
import { DrillNumber } from "@/components/DrillNumber";
import { duplicateBillAction } from "../duplicate-actions";
import type { Bill, Customer, Entity, Vendor } from "@/lib/types";

function filterBills(
  bills: Bill[],
  vendorsById: Map<string, Vendor>,
  q: string,
  status: string,
  vendor: string,
  client: string,
  entity: string,
): Bill[] {
  const needle = q.trim().toLowerCase();
  return bills.filter((bill) => {
    if (status && bill.status !== status) return false;
    if (vendor && bill.vendorId !== vendor) return false;
    if (client && bill.clientId !== client) return false;
    if (entity && bill.entityId !== entity) return false;
    if (needle) {
      const vend = vendorsById.get(bill.vendorId);
      const hay = `${bill.billNumber} ${vend?.name ?? ""} ${vend?.code ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
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
  }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const status = params.status ?? "";
  const vendorId = params.vendor ?? "";
  const clientId = params.client ?? "";
  const entityId = params.entity ?? "";

  const [allBills, allVendors, allCustomers, allEntities] = await Promise.all([
    getBills(),
    getVendors(),
    getCustomers(),
    getEntities(),
  ]);
  const vendorsById = new Map(allVendors.map((v) => [v.id, v] as const));
  const customersById = new Map<string, Customer>(
    allCustomers.map((c) => [c.id, c] as const),
  );
  const entitiesById = new Map<string, Entity>(
    allEntities.map((e) => [e.id, e] as const),
  );
  const rows = filterBills(
    allBills,
    vendorsById,
    q,
    status,
    vendorId,
    clientId,
    entityId,
  )
    .slice()
    .sort((a, b) => b.billDate.localeCompare(a.billDate));
  const vendors = allVendors.slice().sort((a, b) => a.name.localeCompare(b.name));
  const customers = allCustomers
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const entitiesFiltered = (
    clientId ? allEntities.filter((e) => e.clientId === clientId) : allEntities
  )
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const totalSum = rows.reduce((s, b) => s + parseAmount(b.total), 0);
  const balanceSum = rows.reduce((s, b) => s + parseAmount(b.balanceDue), 0);

  return (
    <>
      <PageHeader
        title="Bills"
        meta={`${rows.length} bills`}
        actions={
          <ButtonLink variant="primary" href="/bills/new">
            + New bill
          </ButtonLink>
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
          <SelectField label="Vendor" name="vendor" defaultValue={vendorId}>
            <option value="">All</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Client" name="client" defaultValue={clientId}>
            <option value="">All</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Entity" name="entity" defaultValue={entityId}>
            <option value="">All</option>
            {entitiesFiltered.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </SelectField>
          <Button variant="primary" type="submit">
            Apply
          </Button>
          <ButtonLink variant="ghost" href="/bills">
            Reset
          </ButtonLink>
        </form>
      </div>

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
                  <TH>Bill #</TH>
                  <TH>Vendor</TH>
                  <TH>Client</TH>
                  <TH>Entity</TH>
                  <TH>Date</TH>
                  <TH>Due</TH>
                  <TH num>Total (USD)</TH>
                  <TH num>Balance (USD)</TH>
                  <TH>Status</TH>
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
                  <TD>Total</TD>
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
        </Card>
      </div>
    </>
  );
}
