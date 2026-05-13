import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Field, Row, SelectField } from "@/components/ui/Field";
import { KV, KVGrid } from "@/components/ui/KV";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getAccounts,
  getBankAccounts,
  getBillById,
  getJournalEntryById,
  getVendorById,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatUSD, parseAmount } from "@/lib/money";

import {
  approveBillAction,
  recordBillPaymentAction,
  voidBillAction,
} from "./actions";
import { Attachments } from "@/components/Attachments";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    paid?: string;
    approved?: string;
    voided?: string;
    error?: string;
  }>;
}) {
  const { id } = await params;
  const { paid, approved, voided, error } = await searchParams;
  const bill = await getBillById(id);
  if (!bill) notFound();

  const [vendor, journalEntry, accounts, bankAccounts] = await Promise.all([
    getVendorById(bill.vendorId),
    bill.journalEntryId
      ? getJournalEntryById(bill.journalEntryId)
      : Promise.resolve(undefined),
    getAccounts(),
    getBankAccounts(),
  ]);
  const accountById = new Map(accounts.map((a) => [a.id, a] as const));
  const activeBankAccounts = bankAccounts
    .filter((b) => b.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));

  const status = bill.status;
  const balance = parseAmount(bill.balanceDue);
  const isOverdue = status === "overdue";
  const today = new Date().toISOString().slice(0, 10);

  const canApprove = status === "draft";
  const canPay =
    status === "approved" || status === "partial" || status === "overdue";
  const canVoid =
    status === "draft" ||
    status === "approved" ||
    status === "partial" ||
    status === "overdue";

  const actionButtons = (
    <>
      <ButtonLink href="/bills" variant="secondary">
        ← All bills
      </ButtonLink>
      {canApprove && (
        <form action={approveBillAction} style={{ display: "inline-flex" }}>
          <input type="hidden" name="billId" value={bill.id} />
          <Button variant="primary" type="submit">
            Approve
          </Button>
        </form>
      )}
      {canVoid && (
        <form action={voidBillAction} style={{ display: "inline-flex" }}>
          <input type="hidden" name="billId" value={bill.id} />
          <ConfirmButton
            label="Void"
            title={`Void bill ${bill.billNumber}?`}
            message="Voiding a bill reverses its payable. If posted, a reversing JE will be generated. This cannot be undone."
            confirmText="Void bill"
            requirePhrase={bill.billNumber}
          />
        </form>
      )}
    </>
  );

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Bills", href: "/bills" },
          vendor
            ? { label: vendor.name, href: `/vendors/${vendor.id}` }
            : { label: "—" },
          { label: bill.billNumber },
        ]}
      />
      <PageHeader
        title={bill.billNumber}
        meta={vendor?.name ?? "Unknown vendor"}
        actions={actionButtons}
      />

      <div className="px-6 my-3.5 flex flex-col gap-3.5 pb-8">
        {error && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            {error}
          </div>
        )}
        {paid && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            Payment recorded — journal entry{" "}
            <Link
              href={`/journal/${paid}`}
              style={{
                color: "var(--p-active-fg)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {paid}
            </Link>{" "}
            posted.
          </div>
        )}
        {approved && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            Bill approved — journal entry{" "}
            <Link
              href={`/journal/${approved}`}
              style={{
                color: "var(--p-active-fg)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {approved}
            </Link>{" "}
            posted.
          </div>
        )}
        {voided && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            Bill voided.
          </div>
        )}

        <Card
          title="Header"
          actions={
            <Pill variant={statusVariant(status)}>{statusLabel(status)}</Pill>
          }
        >
          <KVGrid>
            <KV k="Bill #" v={bill.billNumber} mono />
            <KV
              k="Vendor"
              v={vendor?.name ?? "—"}
              sub={vendor?.code}
            />
            <KV
              k="Vendor code"
              v={vendor?.code ?? "—"}
              mono
            />
            <KV k="Bill date" v={formatDate(bill.billDate)} />
            <KV k="Due date" v={formatDate(bill.dueDate)} />
            <KV
              k="Payment terms"
              v={vendor ? `Net ${vendor.paymentTerms}` : "—"}
            />
            <KV
              k="Total"
              v={formatUSD(bill.total, { paren: true })}
              mono
            />
            <KV
              k="Amount paid"
              v={formatUSD(bill.amountPaid, { paren: true })}
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
            <KV k="Currency" v={bill.currencyCode} mono />
            <KV k="Notes" v={bill.notes ?? "—"} />
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
            <form action={recordBillPaymentAction} className="p-3.5">
              <input type="hidden" name="billId" value={bill.id} />
              <div className="flex flex-col gap-3">
                <Row>
                  <Field
                    label="Amount"
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    mono
                    defaultValue={balance.toFixed(2)}
                  />
                  <Field
                    label="Payment date"
                    name="paymentDate"
                    type="date"
                    required
                    defaultValue={today}
                  />
                </Row>
                <Row>
                  <SelectField
                    label="Bank account"
                    name="bankAccountId"
                    defaultValue=""
                  >
                    <option value="">Default cash</option>
                    {activeBankAccounts.map((b) => {
                      const detail = [b.institution, b.lastFour ? `••${b.lastFour}` : null]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <option key={b.id} value={b.id}>
                          {b.name}
                          {detail ? ` — ${detail}` : ""}
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
                <TH>Expense account</TH>
                <TH num>Qty</TH>
                <TH num>Unit price</TH>
                <TH num>Amount</TH>
              </TR>
            </THead>
            <TBody>
              {bill.lines.map((line) => {
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
                <TD num>{formatUSD(bill.subtotal, { paren: true })}</TD>
              </TR>
              <TR total hover={false}>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD>Tax</TD>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD num>{formatUSD(bill.taxAmount, { paren: true })}</TD>
              </TR>
              <TR total hover={false}>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD>Total</TD>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD num>{formatUSD(bill.total, { paren: true })}</TD>
              </TR>
            </TBody>
          </Table>
        </Card>

        <Attachments
          recordType="bill"
          recordId={bill.id}
          redirectPath={`/bills/${bill.id}`}
        />
      </div>
    </>
  );
}
