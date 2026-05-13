import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { KV, KVGrid } from "@/components/ui/KV";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getCustomerById, getEntitiesByClientId, getInvoices } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatUSD, parseAmount } from "@/lib/money";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await getCustomerById(id);
  if (!customer) notFound();

  const [allInvoices, entities] = await Promise.all([
    getInvoices(),
    getEntitiesByClientId(customer.id),
  ]);
  const customerInvoices = allInvoices
    .filter((inv) => inv.customerId === customer.id)
    .slice()
    .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));

  const totalInvoiced = customerInvoices.reduce(
    (s, inv) => s + parseAmount(inv.total),
    0,
  );
  const totalPaid = customerInvoices.reduce(
    (s, inv) => s + parseAmount(inv.amountPaid),
    0,
  );
  const outstanding = customerInvoices.reduce(
    (s, inv) => s + parseAmount(inv.balanceDue),
    0,
  );
  const lastInvoiceDate = customerInvoices[0]?.invoiceDate ?? null;

  const billingLines = (customer.billingAddress ?? "").split(/,\s*/);

  return (
    <>
      <PageHeader
        title={customer.name}
        meta={customer.code}
        actions={
          <ButtonLink variant="secondary" href="/customers">
            ← All customers
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 px-6 my-3.5">
        <Card title="Contact">
          <KVGrid>
            <KV k="Code" v={customer.code} mono />
            <KV k="Email" v={customer.email ?? "—"} />
            <KV k="Phone" v={customer.phone ?? "—"} mono />
            <KV
              k="Billing address"
              v={
                customer.billingAddress ? (
                  <div className="flex flex-col">
                    {billingLines.map((line, idx) => (
                      <span key={idx}>{line}</span>
                    ))}
                  </div>
                ) : (
                  "—"
                )
              }
            />
            <KV k="Payment terms" v={`Net ${customer.paymentTerms}`} />
          </KVGrid>
        </Card>

        <Card title="Balance summary">
          <KVGrid>
            <KV
              k="Total invoiced"
              v={formatUSD(totalInvoiced, { paren: true })}
              mono
            />
            <KV
              k="Total paid"
              v={formatUSD(totalPaid, { paren: true })}
              mono
            />
            <KV
              k="Outstanding balance"
              v={formatUSD(outstanding, { paren: true })}
              mono
            />
            <KV
              k="Last invoice date"
              v={lastInvoiceDate ? formatDate(lastInvoiceDate) : "—"}
            />
          </KVGrid>
        </Card>
      </div>

      <div className="px-6 mb-3.5">
        <Card
          title="Entities"
          actions={
            <ButtonLink variant="ghost" href={`/entities/new?client=${customer.id}`}>
              + New entity
            </ButtonLink>
          }
        >
          {entities.length === 0 ? (
            <Empty
              title="No entities yet"
              body="Track LLCs, trusts, or other vehicles this client owns."
              cta={
                <ButtonLink
                  variant="primary"
                  href={`/entities/new?client=${customer.id}`}
                >
                  + New entity
                </ButtonLink>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Kind</TH>
                  <TH>Jurisdiction</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {entities.map((e) => (
                  <TR key={e.id}>
                    <TD mono>
                      <Link
                        href={`/entities/${e.id}`}
                        style={{ color: "var(--ink)", textDecoration: "none" }}
                      >
                        {e.code}
                      </Link>
                    </TD>
                    <TD>{e.name}</TD>
                    <TD
                      style={{
                        color: "var(--ink-3)",
                        fontSize: 11.5,
                        textTransform: "uppercase",
                      }}
                    >
                      {e.kind}
                    </TD>
                    <TD style={{ color: "var(--ink-3)" }}>
                      {e.jurisdiction ?? "—"}
                    </TD>
                    <TD>
                      <Pill variant={statusVariant(e.status)}>
                        {statusLabel(e.status)}
                      </Pill>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      <div className="px-6 mb-8">
        <Card title="Invoices">
          {customerInvoices.length === 0 ? (
            <Empty
              title="No invoices yet"
              body="This customer has no invoices on record."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Invoice #</TH>
                  <TH>Date</TH>
                  <TH>Due</TH>
                  <TH num>Total</TH>
                  <TH num>Balance</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {customerInvoices.map((inv) => {
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
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
