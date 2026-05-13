import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { KV, KVGrid } from "@/components/ui/KV";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getAccountById,
  getCustomerById,
  getInvoiceById,
  getJournalEntryById,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatUSD, parseAmount } from "@/lib/money";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = getInvoiceById(id);
  if (!invoice) notFound();

  const customer = getCustomerById(invoice.customerId);
  const journalEntry = invoice.journalEntryId
    ? getJournalEntryById(invoice.journalEntryId)
    : undefined;

  const status = invoice.status;
  const balance = parseAmount(invoice.balanceDue);
  const isOverdue = status === "overdue";

  const actionButtons = (
    <>
      <ButtonLink href="/invoices" variant="secondary">
        ← All invoices
      </ButtonLink>
      {status === "draft" && (
        <Button variant="primary" disabled>
          Send
        </Button>
      )}
      {(status === "sent" || status === "partial" || status === "overdue") && (
        <Button variant="primary" disabled>
          Record payment
        </Button>
      )}
      {status !== "paid" && status !== "void" && (
        <Button variant="danger" disabled>
          Void
        </Button>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        title={invoice.invoiceNumber}
        meta={customer?.name ?? "Unknown customer"}
        actions={actionButtons}
      />

      <div className="px-6 my-3.5 flex flex-col gap-3.5 pb-8">
        <Card
          title="Header"
          actions={
            <Pill variant={statusVariant(status)}>{statusLabel(status)}</Pill>
          }
        >
          <KVGrid>
            <KV k="Invoice #" v={invoice.invoiceNumber} mono />
            <KV
              k="Customer"
              v={customer?.name ?? "—"}
              sub={customer?.code}
            />
            <KV
              k="Customer code"
              v={customer?.code ?? "—"}
              mono
            />
            <KV k="Invoice date" v={formatDate(invoice.invoiceDate)} />
            <KV k="Due date" v={formatDate(invoice.dueDate)} />
            <KV
              k="Payment terms"
              v={customer ? `Net ${customer.paymentTerms}` : "—"}
            />
            <KV
              k="Total"
              v={formatUSD(invoice.total, { paren: true })}
              mono
            />
            <KV
              k="Amount paid"
              v={formatUSD(invoice.amountPaid, { paren: true })}
              mono
            />
            <KV
              k="Balance due"
              v={
                <span
                  style={{
                    color: isOverdue && balance > 0
                      ? "var(--p-review-fg)"
                      : undefined,
                  }}
                >
                  {formatUSD(balance, { paren: true })}
                </span>
              }
              mono
            />
            <KV k="Currency" v={invoice.currencyCode} mono />
            <KV k="Notes" v={invoice.notes ?? "—"} />
            {journalEntry && (
              <KV
                k="Linked JE"
                v={
                  <Link
                    href={`/journal/${journalEntry.entryNumber}`}
                    style={{
                      color: "var(--ink)",
                      textDecoration: "none",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {journalEntry.entryNumber}
                  </Link>
                }
              />
            )}
          </KVGrid>
        </Card>

        <Card title="Line items">
          <Table>
            <THead>
              <TR hover={false}>
                <TH>#</TH>
                <TH>Description</TH>
                <TH>Account</TH>
                <TH num>Qty</TH>
                <TH num>Unit price</TH>
                <TH num>Amount</TH>
              </TR>
            </THead>
            <TBody>
              {invoice.lines.map((line) => {
                const account = getAccountById(line.accountId);
                return (
                  <TR key={line.id}>
                    <TD mono>{line.lineNumber}</TD>
                    <TD>{line.description}</TD>
                    <TD>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {account?.code ?? "—"}
                      </span>
                      {account?.name && (
                        <span
                          className="ml-2"
                          style={{ color: "var(--ink-3)" }}
                        >
                          {account.name}
                        </span>
                      )}
                    </TD>
                    <TD num>{line.quantity}</TD>
                    <TD num>{formatUSD(line.unitPrice, { paren: true })}</TD>
                    <TD num>{formatUSD(line.amount, { paren: true })}</TD>
                  </TR>
                );
              })}
              <TR total hover={false}>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD>Subtotal</TD>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD num>{formatUSD(invoice.subtotal, { paren: true })}</TD>
              </TR>
              <TR total hover={false}>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD>Tax</TD>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD num>{formatUSD(invoice.taxAmount, { paren: true })}</TD>
              </TR>
              <TR total hover={false}>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD>Total</TD>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD num>{formatUSD(invoice.total, { paren: true })}</TD>
              </TR>
            </TBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
