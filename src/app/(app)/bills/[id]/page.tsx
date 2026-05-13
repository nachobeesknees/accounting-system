import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { KV, KVGrid } from "@/components/ui/KV";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getAccounts,
  getBillById,
  getJournalEntryById,
  getVendorById,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatUSD, parseAmount } from "@/lib/money";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bill = await getBillById(id);
  if (!bill) notFound();

  const [vendor, journalEntry, accounts] = await Promise.all([
    getVendorById(bill.vendorId),
    bill.journalEntryId
      ? getJournalEntryById(bill.journalEntryId)
      : Promise.resolve(undefined),
    getAccounts(),
  ]);
  const accountById = new Map(accounts.map((a) => [a.id, a] as const));

  const status = bill.status;
  const balance = parseAmount(bill.balanceDue);
  const isOverdue = status === "overdue";

  const actionButtons = (
    <>
      <ButtonLink href="/bills" variant="secondary">
        ← All bills
      </ButtonLink>
      {status === "draft" && (
        <Button variant="primary" disabled>
          Approve
        </Button>
      )}
      {(status === "approved" || status === "partial" || status === "overdue") && (
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
        title={bill.billNumber}
        meta={vendor?.name ?? "Unknown vendor"}
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
      </div>
    </>
  );
}
