import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, SelectField } from "@/components/ui/Field";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getCustomers, getInvoices } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatUSD, parseAmount } from "@/lib/money";
import type { Customer, Invoice } from "@/lib/types";

function filterInvoices(
  invoices: Invoice[],
  customersById: Map<string, Customer>,
  q: string,
  status: string,
  customer: string,
): Invoice[] {
  const needle = q.trim().toLowerCase();
  return invoices.filter((inv) => {
    if (status && inv.status !== status) return false;
    if (customer && inv.customerId !== customer) return false;
    if (needle) {
      const cust = customersById.get(inv.customerId);
      const hay = `${inv.invoiceNumber} ${cust?.name ?? ""} ${cust?.code ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; customer?: string; q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const status = params.status ?? "";
  const customerId = params.customer ?? "";

  const [allInvoices, allCustomers] = await Promise.all([
    getInvoices(),
    getCustomers(),
  ]);
  const customersById = new Map(allCustomers.map((c) => [c.id, c] as const));
  const rows = filterInvoices(allInvoices, customersById, q, status, customerId)
    .slice()
    .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
  const customers = allCustomers
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

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
          <SelectField label="Customer" name="customer" defaultValue={customerId}>
            <option value="">All</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <Button variant="primary" type="submit">
            Apply
          </Button>
          <ButtonLink variant="ghost" href="/invoices">
            Reset
          </ButtonLink>
        </form>
      </div>

      <div className="px-6 py-3.5 pb-8">
        <Card title="Invoices">
          {rows.length === 0 ? (
            <Empty
              title="No invoices match these filters"
              body="Try clearing the filters or create a new invoice."
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
                  <TH num>Total</TH>
                  <TH num>Balance</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((inv) => {
                  const cust = customersById.get(inv.customerId);
                  const bal = parseAmount(inv.balanceDue);
                  const isOverdue = inv.status === "overdue" && bal > 0;
                  return (
                    <TR key={inv.id}>
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
                      <TD num>{formatUSD(inv.total, { paren: true })}</TD>
                      <TD num neg={isOverdue}>
                        {formatUSD(bal, { paren: true })}
                      </TD>
                      <TD>
                        <Pill variant={statusVariant(inv.status)}>
                          {statusLabel(inv.status)}
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
