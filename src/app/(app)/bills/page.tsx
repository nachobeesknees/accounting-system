import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, SelectField } from "@/components/ui/Field";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getBills, getVendorById, getVendors } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatUSD, parseAmount } from "@/lib/money";
import type { Bill } from "@/lib/types";

function filterBills(
  bills: Bill[],
  q: string,
  status: string,
  vendor: string,
): Bill[] {
  const needle = q.trim().toLowerCase();
  return bills.filter((bill) => {
    if (status && bill.status !== status) return false;
    if (vendor && bill.vendorId !== vendor) return false;
    if (needle) {
      const vend = getVendorById(bill.vendorId);
      const hay = `${bill.billNumber} ${vend?.name ?? ""} ${vend?.code ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; vendor?: string; q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const status = params.status ?? "";
  const vendorId = params.vendor ?? "";

  const allBills = getBills();
  const rows = filterBills(allBills, q, status, vendorId).slice().sort(
    (a, b) => b.billDate.localeCompare(a.billDate),
  );
  const vendors = getVendors().slice().sort((a, b) => a.name.localeCompare(b.name));

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
              title="No bills match these filters"
              body="Try clearing the filters or create a new bill."
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
                  <TH>Date</TH>
                  <TH>Due</TH>
                  <TH num>Total</TH>
                  <TH num>Balance</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((bill) => {
                  const vend = getVendorById(bill.vendorId);
                  const bal = parseAmount(bill.balanceDue);
                  const isOverdue = bill.status === "overdue" && bal > 0;
                  return (
                    <TR key={bill.id}>
                      <TD mono>
                        <Link
                          href={`/bills/${bill.id}`}
                          style={{ color: "var(--ink)", textDecoration: "none" }}
                        >
                          {bill.billNumber}
                        </Link>
                      </TD>
                      <TD>{vend?.name ?? "—"}</TD>
                      <TD>{formatDate(bill.billDate)}</TD>
                      <TD>{formatDate(bill.dueDate)}</TD>
                      <TD num>{formatUSD(bill.total, { paren: true })}</TD>
                      <TD num neg={isOverdue}>
                        {formatUSD(bal, { paren: true })}
                      </TD>
                      <TD>
                        <Pill variant={statusVariant(bill.status)}>
                          {statusLabel(bill.status)}
                        </Pill>
                      </TD>
                    </TR>
                  );
                })}
                <TR total hover={false}>
                  <TD>Total</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD num>{formatUSD(totalSum, { paren: true })}</TD>
                  <TD num>{formatUSD(balanceSum, { paren: true })}</TD>
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
