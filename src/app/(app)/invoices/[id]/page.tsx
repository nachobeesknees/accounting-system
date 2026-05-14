import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { KV, KVGrid } from "@/components/ui/KV";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getAccounts,
  getBankAccounts,
  getCustomerAssignments,
  getCustomerById,
  getDimensionsWithValues,
  getInvoiceById,
  getJournalEntryById,
  getUserById,
} from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import type { Customer, Invoice, User } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { formatMoney, parseAmount } from "@/lib/money";
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
import { Attachments } from "@/components/Attachments";

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

  const [
    customer,
    journalEntry,
    accounts,
    bankAccounts,
    assignments,
    dimensionsWithValues,
  ] = await Promise.all([
    getCustomerById(invoice.customerId),
    invoice.journalEntryId
      ? getJournalEntryById(invoice.journalEntryId)
      : Promise.resolve(undefined),
    getAccounts(),
    getBankAccounts(),
    getCustomerAssignments(invoice.customerId),
    getDimensionsWithValues(),
  ]);
  const accountById = new Map(accounts.map((a) => [a.id, a] as const));

  const dimensionByKey = new Map(
    dimensionsWithValues.map((d) => [d.dimension.key, d.dimension] as const),
  );
  const dimensionValueById = new Map(
    dimensionsWithValues.flatMap((d) =>
      d.values.map((v) => [v.id, v] as const),
    ),
  );
  function renderDimensions(
    dims: Record<string, string> | undefined,
  ): string | null {
    if (!dims) return null;
    const parts: string[] = [];
    for (const [key, valueId] of Object.entries(dims)) {
      if (!valueId) continue;
      const dim = dimensionByKey.get(key);
      const val = dimensionValueById.get(valueId);
      if (!dim || !val) continue;
      parts.push(`${dim.label}: ${val.label}`);
    }
    return parts.length === 0 ? null : parts.join(" · ");
  }

  const assignedUserId = readAssignedUserId(customer);
  const approvals = approvalFields(invoice);
  // Anyone marked can_approve in customer_assignments may grant the final
  // approval — plus the legacy single assignee for backwards compat.
  const approverIds = new Set<string>(
    assignments.filter((a) => a.canApprove).map((a) => a.userId),
  );
  if (assignedUserId) approverIds.add(assignedUserId);

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
    (sessionUser.isSuperuser || approverIds.has(sessionUser.userId));
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
            label="Void"
            title={`Void invoice ${invoice.invoiceNumber}?`}
            message="Voiding an invoice reverses its receivable. If the invoice was already posted, a reversing JE will be generated. This cannot be undone."
            confirmText="Void invoice"
            requirePhrase={invoice.invoiceNumber}
          />
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
          customer
            ? { label: customer.name, href: `/customers/${customer.id}` }
            : { label: "—" },
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
              v={formatMoney(invoice.total, invoice.currencyCode, { paren: true })}
              mono
            />
            <KV
              k="Amount paid"
              v={formatMoney(invoice.amountPaid, invoice.currencyCode, { paren: true })}
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
                  {formatMoney(balance, invoice.currencyCode, { paren: true })}
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
                  <Button variant="danger" type="submit">
                    Reject
                  </Button>
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
                const dimText = renderDimensions(line.dimensions);
                return (
                  <TR key={line.id}>
                    <TD mono>{line.lineNumber}</TD>
                    <TD>
                      <div>{line.description}</div>
                      {dimText && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--ink-4)",
                            marginTop: 2,
                          }}
                        >
                          {dimText}
                        </div>
                      )}
                    </TD>
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
                    <TD num>{formatMoney(line.unitPrice, invoice.currencyCode, { paren: true })}</TD>
                    <TD num>{formatMoney(line.amount, invoice.currencyCode, { paren: true })}</TD>
                  </TR>
                );
              })}
              <TR total hover={false}>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD>Subtotal</TD>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD num>{formatMoney(invoice.subtotal, invoice.currencyCode, { paren: true })}</TD>
              </TR>
              <TR total hover={false}>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD>Tax</TD>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD num>{formatMoney(invoice.taxAmount, invoice.currencyCode, { paren: true })}</TD>
              </TR>
              <TR total hover={false}>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD>Total</TD>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD num>{formatMoney(invoice.total, invoice.currencyCode, { paren: true })}</TD>
              </TR>
            </TBody>
          </Table>
        </Card>

        <Attachments
          recordType="invoice"
          recordId={invoice.id}
          redirectPath={`/invoices/${invoice.id}`}
        />
      </div>
    </>
  );
}
