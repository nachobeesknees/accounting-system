import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Card } from "@/components/ui/Card";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { KV, KVGrid } from "@/components/ui/KV";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getAccounts,
  getBankAccounts,
  getCustomerById,
  getInvoiceById,
  getJournalEntryById,
  getUserById,
} from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import type { Customer, Invoice, User } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { formatUSD, parseAmount } from "@/lib/money";
import {
  assignedApproveInvoiceAction,
  cfoApproveInvoiceAction,
  postInvoiceAction,
  recordPaymentAction,
  rejectInvoiceAction,
  setExpectedPaymentDateAction,
  submitInvoiceForApprovalAction,
  voidInvoiceAction,
} from "./actions";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- Approval-workflow field accessors ---------------------------------------
//
// The shared `Invoice` and `Customer` types and the `data.ts` mappers may not
// yet surface the approval-workflow columns (cfoApprovedAt, assignedApprovedAt,
// rejectedAt, etc., and customer.assignedUserId). These accessors widen the
// shape and fall back to null/undefined when the runtime value is missing.
// When the data layer is updated to forward these fields, no change is needed
// here — runtime values just start populating.

type InvoiceWithApproval = Invoice & {
  cfoApprovedAt?: string | null;
  cfoApprovedBy?: string | null;
  assignedApprovedAt?: string | null;
  assignedApprovedBy?: string | null;
  rejectedAt?: string | null;
  rejectedBy?: string | null;
  rejectionReason?: string | null;
};

type CustomerWithAssignment = Customer & { assignedUserId?: string | null };

function readStr(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function approvalFields(inv: Invoice) {
  const x = inv as InvoiceWithApproval;
  return {
    cfoApprovedAt: readStr(x.cfoApprovedAt),
    cfoApprovedBy: readStr(x.cfoApprovedBy),
    assignedApprovedAt: readStr(x.assignedApprovedAt),
    assignedApprovedBy: readStr(x.assignedApprovedBy),
    rejectedAt: readStr(x.rejectedAt),
    rejectedBy: readStr(x.rejectedBy),
    rejectionReason: readStr(x.rejectionReason),
  };
}

function readAssignedUserId(c: Customer | undefined): string | null {
  if (!c) return null;
  return readStr((c as CustomerWithAssignment).assignedUserId);
}

function formatStamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    recorded?: string;
    submitted?: string;
    approved?: string;
    rejected?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const invoice = await getInvoiceById(id);
  if (!invoice) notFound();

  const sessionUser = await getSessionUser();

  const [customer, journalEntry, accounts, bankAccounts] = await Promise.all([
    getCustomerById(invoice.customerId),
    invoice.journalEntryId
      ? getJournalEntryById(invoice.journalEntryId)
      : Promise.resolve(undefined),
    getAccounts(),
    getBankAccounts(),
  ]);
  const accountById = new Map(accounts.map((a) => [a.id, a] as const));

  const assignedUserId = readAssignedUserId(customer);
  const approvals = approvalFields(invoice);

  // Resolve users referenced by the approval state.
  const userIdsToLoad = Array.from(
    new Set(
      [
        assignedUserId,
        approvals.cfoApprovedBy,
        approvals.assignedApprovedBy,
        approvals.rejectedBy,
      ].filter((v): v is string => !!v),
    ),
  );
  const userEntries = await Promise.all(
    userIdsToLoad.map(async (uid) => [uid, await getUserById(uid)] as const),
  );
  const usersById = new Map<string, User>();
  for (const [uid, u] of userEntries) {
    if (u) usersById.set(uid, u);
  }
  const assignedUser = assignedUserId ? usersById.get(assignedUserId) : undefined;
  const cfoUser = approvals.cfoApprovedBy
    ? usersById.get(approvals.cfoApprovedBy)
    : undefined;
  const assignedApproverUser = approvals.assignedApprovedBy
    ? usersById.get(approvals.assignedApprovedBy)
    : undefined;
  const rejectorUser = approvals.rejectedBy
    ? usersById.get(approvals.rejectedBy)
    : undefined;

  const status = invoice.status as string;
  const balance = parseAmount(invoice.balanceDue);
  const isOverdue = status === "overdue";

  const isDraft = status === "draft";
  const isPendingCfo = status === "pending_cfo";
  const isPendingAssigned = status === "pending_assigned";
  const isPending = isPendingCfo || isPendingAssigned;
  const canPay = status === "sent" || status === "partial" || status === "overdue";
  const canVoid = status !== "paid" && status !== "void";

  const isCfo =
    !!sessionUser && (sessionUser.role === "CFO" || sessionUser.isSuperuser);
  const isAssignedApprover =
    !!sessionUser &&
    !!assignedUserId &&
    (sessionUser.userId === assignedUserId || sessionUser.isSuperuser);
  const canActOnPending =
    (isPendingCfo && isCfo) || (isPendingAssigned && isAssignedApprover);

  const actionButtons = (
    <>
      <ButtonLink href="/invoices" variant="secondary">
        ← All invoices
      </ButtonLink>
      {isDraft && (
        <form action={submitInvoiceForApprovalAction}>
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <Button variant="primary" type="submit">
            Submit for approval
          </Button>
        </form>
      )}
      {isPendingCfo &&
        (isCfo ? (
          <form action={cfoApproveInvoiceAction}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <Button variant="primary" type="submit">
              CFO Approve
            </Button>
          </form>
        ) : (
          <Button variant="secondary" type="button" disabled>
            Pending CFO approval
          </Button>
        ))}
      {isPendingAssigned &&
        (isAssignedApprover ? (
          <form action={assignedApproveInvoiceAction}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <Button variant="primary" type="submit">
              Final approve & post
            </Button>
          </form>
        ) : (
          <Button variant="secondary" type="button" disabled>
            {assignedUser
              ? `Pending ${assignedUser.fullName}'s approval`
              : "Pending assigned employee's approval"}
          </Button>
        ))}
      {canVoid && (
        <form action={voidInvoiceAction}>
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <input type="hidden" name="reason" value="Voided from detail view" />
          <ConfirmButton
            variant="danger"
            title={`Void invoice ${invoice.invoiceNumber}?`}
            body="This reverses the journal entry and marks the invoice as void. Already-recorded payments stay attached, but no further payments can be applied."
            confirmLabel="Void invoice"
          >
            Void
          </ConfirmButton>
        </form>
      )}
    </>
  );

  const approvedBanner = (() => {
    if (sp.submitted === "1") {
      return "Invoice submitted for CFO approval.";
    }
    if (sp.approved === "cfo") {
      return "CFO approval recorded — pending final approval by the assigned employee.";
    }
    if (sp.approved === "assigned") {
      return "Final approval recorded — invoice posted.";
    }
    return null;
  })();

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Invoices", href: "/invoices" },
          { label: invoice.invoiceNumber },
        ]}
      />
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
        {approvedBanner && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            {approvedBanner}
          </div>
        )}
        {sp.rejected === "1" && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-formation-bg)",
              color: "var(--p-formation-fg)",
              border: "1px solid var(--p-formation-fg)",
            }}
          >
            Invoice rejected — returned to draft.
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
            <KV
              k="Expected payment"
              v={
                <form
                  action={setExpectedPaymentDateAction}
                  className="flex items-center gap-2"
                >
                  <input type="hidden" name="invoiceId" value={invoice.id} />
                  <input
                    type="date"
                    name="expectedPaymentDate"
                    defaultValue={invoice.expectedPaymentDate ?? ""}
                    className="px-2 py-0.5 text-[12.5px] rounded-md outline-none"
                    style={{
                      background: "var(--paper)",
                      border: "1px solid var(--line-2)",
                      color: "var(--ink)",
                      fontFamily: "var(--font-mono)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  />
                  <Button variant="secondary" type="submit">
                    Save
                  </Button>
                </form>
              }
              sub={
                invoice.expectedPaymentDate
                  ? `Currently ${formatDate(invoice.expectedPaymentDate)}`
                  : "Forecast falls back to due date"
              }
            />
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

        <Card title="Approval history">
          <KVGrid>
            <KV
              k="Assigned employee"
              v={
                assignedUser ? (
                  <span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {assignedUser.fullName}
                    </span>
                    <span
                      className="ml-2"
                      style={{ color: "var(--ink-3)", fontSize: 11.5 }}
                    >
                      {assignedUser.role}
                    </span>
                  </span>
                ) : (
                  <span style={{ color: "var(--ink-3)" }}>—</span>
                )
              }
            />
            {approvals.cfoApprovedAt && (
              <KV
                k="CFO approved"
                v={
                  <span>
                    {formatStamp(approvals.cfoApprovedAt)}
                    {cfoUser && (
                      <span
                        className="ml-2"
                        style={{ color: "var(--ink-3)", fontSize: 11.5 }}
                      >
                        by {cfoUser.fullName}
                      </span>
                    )}
                  </span>
                }
              />
            )}
            {approvals.assignedApprovedAt && (
              <KV
                k="Assigned approved"
                v={
                  <span>
                    {formatStamp(approvals.assignedApprovedAt)}
                    {assignedApproverUser && (
                      <span
                        className="ml-2"
                        style={{ color: "var(--ink-3)", fontSize: 11.5 }}
                      >
                        by {assignedApproverUser.fullName}
                      </span>
                    )}
                  </span>
                }
              />
            )}
            {approvals.rejectedAt && (
              <KV
                k="Rejected"
                v={
                  <span>
                    <span style={{ color: "var(--p-review-fg)" }}>
                      {formatStamp(approvals.rejectedAt)}
                    </span>
                    {rejectorUser && (
                      <span
                        className="ml-2"
                        style={{ color: "var(--ink-3)", fontSize: 11.5 }}
                      >
                        by {rejectorUser.fullName}
                      </span>
                    )}
                  </span>
                }
                sub={
                  approvals.rejectionReason ? (
                    <span style={{ color: "var(--ink-3)" }}>
                      {approvals.rejectionReason}
                    </span>
                  ) : undefined
                }
              />
            )}
          </KVGrid>
        </Card>

        {isPending && canActOnPending && (
          <Card title="Reject reason">
            <form action={rejectInvoiceAction}>
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <div className="p-3.5 flex flex-col gap-3">
                <TextareaField
                  label="Reason"
                  name="reason"
                  required
                  placeholder="Explain why you're rejecting this invoice…"
                />
                <div className="flex justify-end">
                  <ConfirmButton
                    variant="danger"
                    title="Reject this invoice?"
                    body="The invoice will be returned to draft and the requester will see your reason. They can revise and resubmit."
                    confirmLabel="Reject invoice"
                  >
                    Reject
                  </ConfirmButton>
                </div>
              </div>
            </form>
          </Card>
        )}

        {canPay && (
          <Card title="Record payment">
            <form action={recordPaymentAction}>
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <div className="p-3.5 flex flex-col gap-3">
                <Row>
                  <MoneyInput
                    label="Amount"
                    name="amount"
                    required
                    defaultValue={balance.toFixed(2)}
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
