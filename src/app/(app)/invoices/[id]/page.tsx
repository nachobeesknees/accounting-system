import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, SelectField } from "@/components/ui/Field";
import { KV, KVGrid } from "@/components/ui/KV";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getAccounts,
  getBankAccounts,
  getCustomerById,
  getInvoiceById,
  getJournalEntryById,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatUSD, parseAmount } from "@/lib/money";
import {
  postInvoiceAction,
  recordPaymentAction,
  voidInvoiceAction,
} from "./actions";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; recorded?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const invoice = await getInvoiceById(id);
  if (!invoice) notFound();

  const [customer, journalEntry, accounts, bankAccounts] = await Promise.all([
    getCustomerById(invoice.customerId),
    invoice.journalEntryId
      ? getJournalEntryById(invoice.journalEntryId)
      : Promise.resolve(undefined),
    getAccounts(),
    getBankAccounts(),
  ]);
  const accountById = new Map(accounts.map((a) => [a.id, a] as const));

  const status = invoice.status;
  const balance = parseAmount(invoice.balanceDue);
  const isOverdue = status === "overdue";

  const canPost = status === "draft";
  const canPay =
    status === "sent" || status === "partial" || status === "overdue";
  const canVoid = status !== "paid" && status !== "void";

  const actionButtons = (
    <>
      <ButtonLink href="/invoices" variant="secondary">
        ← All invoices
      </ButtonLink>
      {canPost && (
        <form action={postInvoiceAction}>
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <Button variant="primary" type="submit">
            Post
          </Button>
        </form>
      )}
      {canVoid && (
        <form action={voidInvoiceAction}>
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <input type="hidden" name="reason" value="Voided from detail view" />
          <Button variant="danger" type="submit">
            Void
          </Button>
        </form>
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
        {sp.recorded && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            Payment recorded — created journal entry{" "}
            <Link
              href={`/journal/${sp.recorded}`}
              style={{
                color: "inherit",
                fontFamily: "var(--font-mono)",
                textDecoration: "underline",
              }}
            >
              {sp.recorded}
            </Link>
            .
          </div>
        )}
        {sp.error && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            {sp.error}
          </div>
        )}

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

        {canPay && (
          <Card title="Record payment">
            <form action={recordPaymentAction}>
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <div className="p-3.5 flex flex-col gap-3">
                <Row>
                  <Field
                    label="Amount"
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    defaultValue={balance.toFixed(2)}
                    mono
                  />
                  <Field
                    label="Payment date"
                    name="paymentDate"
                    type="date"
                    required
                    defaultValue={todayISO()}
                  />
                </Row>
                <Row>
                  <SelectField
                    label="Bank account"
                    name="bankAccountId"
                    defaultValue=""
                  >
                    <option value="">Default cash</option>
                    {bankAccounts.map((b) => {
                      const suffix = [b.institution, b.lastFour ? `••${b.lastFour}` : null]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <option key={b.id} value={b.id}>
                          {b.name}
                          {suffix ? ` — ${suffix}` : ""}
                        </option>
                      );
                    })}
                  </SelectField>
                  <Field
                    label="Reference"
                    name="reference"
                    placeholder="Check #, wire ref, etc."
                  />
                </Row>
                <div className="flex justify-end">
                  <Button variant="primary" type="submit">
                    Record payment
                  </Button>
                </div>
              </div>
            </form>
          </Card>
        )}

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
                const account = accountById.get(line.accountId);
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
