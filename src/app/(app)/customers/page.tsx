import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field } from "@/components/ui/Field";
import { IconUsers } from "@/components/ui/Icon";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getCustomers, getInvoices } from "@/lib/data";
import { formatUSD, parseAmount } from "@/lib/money";
import type { Customer } from "@/lib/types";

function filterCustomers(customers: Customer[], q: string): Customer[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return customers;
  return customers.filter((c) => {
    const hay = `${c.code} ${c.name} ${c.email ?? ""}`.toLowerCase();
    return hay.includes(needle);
  });
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";

  const [allCustomers, allInvoices] = await Promise.all([
    getCustomers(),
    getInvoices(),
  ]);
  const rows = filterCustomers(allCustomers, q).slice().sort((a, b) =>
    a.code.localeCompare(b.code),
  );

  const balanceFor = (customerId: string): number =>
    allInvoices
      .filter((inv) => inv.customerId === customerId)
      .reduce((s, inv) => s + parseAmount(inv.balanceDue), 0);

  const balances = new Map(rows.map((c) => [c.id, balanceFor(c.id)] as const));
  const balanceTotal = Array.from(balances.values()).reduce((s, n) => s + n, 0);

  return (
    <>
      <PageHeader
        title="Clients"
        meta={`${rows.length} active`}
        actions={
          <ButtonLink variant="primary" href="/customers/new">
            + New client
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
            placeholder="Code, name, or email"
            defaultValue={q}
          />
          <Button variant="primary" type="submit">
            Apply
          </Button>
          <ButtonLink variant="ghost" href="/customers">
            Reset
          </ButtonLink>
        </form>
      </div>

      <div className="px-6 py-3.5 pb-8">
        <Card title="Clients">
          {rows.length === 0 ? (
            <Empty
              icon={<IconUsers size={20} />}
              title={
                allCustomers.length === 0
                  ? "No clients yet"
                  : "No clients match your search"
              }
              body={
                allCustomers.length === 0
                  ? "Clients are the families or organizations you serve. Each one owns one or more entities you keep books for."
                  : "Try a different query or add a new client."
              }
              cta={
                <ButtonLink variant="primary" href="/customers/new">
                  + New client
                </ButtonLink>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Phone</TH>
                  <TH num>Terms</TH>
                  <TH num>Balance</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((c) => {
                  const balance = balances.get(c.id) ?? 0;
                  const statusKey = c.isActive ? "active" : "inactive";
                  return (
                    <TR key={c.id} href={`/customers/${c.id}`}>
                      <TD mono>
                        <Link
                          href={`/customers/${c.id}`}
                          style={{ color: "var(--ink)", textDecoration: "none" }}
                        >
                          {c.code}
                        </Link>
                      </TD>
                      <TD>{c.name}</TD>
                      <TD style={{ color: "var(--ink-3)" }}>
                        {c.email ?? "—"}
                      </TD>
                      <TD
                        mono
                        style={{ color: "var(--ink-3)" }}
                      >
                        {c.phone ?? "—"}
                      </TD>
                      <TD num>{`Net ${c.paymentTerms}`}</TD>
                      <TD num>{formatUSD(balance, { paren: true })}</TD>
                      <TD>
                        <Pill variant={statusVariant(statusKey)}>
                          {statusLabel(statusKey)}
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
                  <TD>{""}</TD>
                  <TD num>{formatUSD(balanceTotal, { paren: true })}</TD>
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
