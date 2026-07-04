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
  getBaseCurrency,
  getBillById,
  getBillCreditApplicationsByCredit,
  getBillCreditApplicationsForBill,
  getBills,
  getCustomerById,
  getCustomers,
  getDimensionsWithValues,
  getEntities,
  getEntityById,
  getInvoiceById,
  getJournalEntryById,
  getTaxCodeById,
  getVendorById,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatMoney, parseAmount } from "@/lib/money";
import { hasPermission } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";
import type { Bill } from "@/lib/types";

import {
  applyVendorCreditAction,
  approveBillAction,
  recordBillPaymentAction,
  setBillChargebackAction,
  voidBillAction,
} from "./actions";
import { duplicateBillAction } from "../../duplicate-actions";
import { Attachments } from "@/components/Attachments";
import { BillChargebackPanel } from "./BillChargebackPanel";

function computeRebill(bill: Bill): number | null {
  const total = parseAmount(bill.total);
  switch (bill.chargebackType) {
    case "cost":
      return total;
    case "markup": {
      const pct = bill.markupPct ? parseFloat(bill.markupPct) : 0;
      return Math.round(total * (1 + pct) * 100) / 100;
    }
    case "fixed":
      return bill.rebillAmount ? parseFloat(bill.rebillAmount) : null;
    case "included":
      return null;
    default:
      return null;
  }
}

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
    cb?: string;
    applied?: string;
  }>;
}) {
  const { id } = await params;
  const { paid, approved, voided, error, cb, applied } = await searchParams;
  const sessionUser = await getSessionUser();
  const bill = await getBillById(id);
  if (!bill) notFound();

  const [
    vendor,
    journalEntry,
    accounts,
    bankAccounts,
    customers,
    entities,
    chargebackClient,
    chargebackEntity,
    chargebackInvoice,
    dimensionsWithValues,
    base,
  ] = await Promise.all([
    getVendorById(bill.vendorId),
    bill.journalEntryId
      ? getJournalEntryById(bill.journalEntryId)
      : Promise.resolve(undefined),
    getAccounts(),
    getBankAccounts(),
    getCustomers(),
    getEntities(),
    bill.chargebackClientId
      ? getCustomerById(bill.chargebackClientId)
      : Promise.resolve(undefined),
    bill.chargebackEntityId
      ? getEntityById(bill.chargebackEntityId)
      : Promise.resolve(undefined),
    bill.chargebackInvoiceId
      ? getInvoiceById(bill.chargebackInvoiceId)
      : Promise.resolve(undefined),
    getDimensionsWithValues(),
    getBaseCurrency(),
  ]);
  const baseCode = base?.code ?? "USD";

  const isVendorCredit = bill.kind === "vendor_credit";
  const [
    creditAppsFrom,
    creditAppsTo,
    allBills,
    billTaxCodes,
  ] = await Promise.all([
    isVendorCredit
      ? getBillCreditApplicationsByCredit(bill.id)
      : Promise.resolve([]),
    !isVendorCredit
      ? getBillCreditApplicationsForBill(bill.id)
      : Promise.resolve([]),
    isVendorCredit ? getBills() : Promise.resolve([]),
    Promise.all(
      Array.from(
        new Set(bill.lines.map((l) => l.taxCodeId).filter((v): v is string => !!v)),
      ).map(async (tcId) => [tcId, await getTaxCodeById(tcId)] as const),
    ),
  ]);
  const billTaxCodeById = new Map(billTaxCodes.filter(([, c]) => c != null));
  const vcApplied = creditAppsFrom.reduce((s, a) => s + parseAmount(a.amount), 0);
  const vcRemaining = isVendorCredit
    ? Math.abs(parseAmount(bill.total)) - vcApplied
    : 0;
  const openBillTargets = isVendorCredit
    ? allBills.filter(
        (t) =>
          t.vendorId === bill.vendorId &&
          t.kind !== "vendor_credit" &&
          parseAmount(t.balanceDue) > 0.005 &&
          t.status !== "void" &&
          t.status !== "paid" &&
          t.status !== "draft",
      )
    : [];

  // FX snapshot is meaningful only for non-base bills with a real rate
  // ("1.00000000" is also treated as absent).
  const fxRateStr = bill.fxRate;
  const fxRateNum = fxRateStr != null ? parseFloat(fxRateStr) : NaN;
  const hasFxSnapshot =
    bill.currencyCode !== baseCode &&
    Number.isFinite(fxRateNum) &&
    fxRateNum > 0 &&
    fxRateNum !== 1;
  const baseBillTotal = hasFxSnapshot
    ? parseAmount(bill.total) / fxRateNum
    : 0;
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
  const activeCustomers = customers
    .filter((c) => c.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));
  const sortedEntities = entities
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code));
  const billTotal = parseAmount(bill.total);
  const rebillPreview = computeRebill(bill);
  const accountById = new Map(accounts.map((a) => [a.id, a] as const));
  const customerNameById = new Map(customers.map((c) => [c.id, c.name] as const));
  const entityNameById = new Map(entities.map((e) => [e.id, e.name] as const));
  // Split chargebacks show a per-line "Billed to" column.
  const showLineClients = bill.chargebackSplit === true;
  const splitByEntity = bill.chargebackSplitBy === "entity";
  const linePayerName = (l: (typeof bill.lines)[number]) =>
    splitByEntity
      ? l.entityId
        ? (entityNameById.get(l.entityId) ?? "—")
        : null
      : l.clientId
        ? (customerNameById.get(l.clientId) ?? "—")
        : null;
  const activeBankAccounts = bankAccounts
    .filter((b) => b.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));

  const status = bill.status;
  const balance = parseAmount(bill.balanceDue);
  const isOverdue = status === "overdue";
  const today = new Date().toISOString().slice(0, 10);

  const canDuplicate = hasPermission(sessionUser, "bill.create");
  const canApprove =
    status === "draft" && hasPermission(sessionUser, "bill.approve");
  const canPay =
    (status === "approved" || status === "partial" || status === "overdue") &&
    hasPermission(sessionUser, "bank.create_transaction");
  const canVoid =
    (status === "draft" ||
      status === "approved" ||
      status === "partial" ||
      status === "overdue") &&
    hasPermission(sessionUser, "bill.void");

  const actionButtons = (
    <>
      <ButtonLink href="/bills" variant="secondary">
        ← All bills
      </ButtonLink>
      {canDuplicate && (
        <form action={duplicateBillAction} style={{ display: "inline-flex" }}>
          <input type="hidden" name="billId" value={bill.id} />
          <Button variant="secondary" type="submit">
            Duplicate
          </Button>
        </form>
      )}
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
        {applied && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            Vendor credit applied.
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
              k="Vendor invoice #"
              v={bill.vendorInvoiceNumber ?? "—"}
              mono={!!bill.vendorInvoiceNumber}
            />
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
            {(() => {
              const c = bill.clientId
                ? customers.find((x) => x.id === bill.clientId)
                : null;
              return (
                <KV
                  k="Client"
                  v={
                    c ? (
                      <Link
                        href={`/customers/${c.id}`}
                        style={{ color: "var(--ink)", textDecoration: "none" }}
                      >
                        {c.name}
                      </Link>
                    ) : (
                      "—"
                    )
                  }
                />
              );
            })()}
            {(() => {
              const ent = bill.entityId
                ? entities.find((x) => x.id === bill.entityId)
                : null;
              return (
                <KV
                  k="Entity"
                  v={
                    ent ? (
                      <Link
                        href={`/entities/${ent.id}`}
                        style={{ color: "var(--ink)", textDecoration: "none" }}
                      >
                        {ent.name}
                      </Link>
                    ) : (
                      "—"
                    )
                  }
                />
              );
            })()}
            <KV
              k="Total"
              v={formatMoney(bill.total, bill.currencyCode, { compact: true, paren: true })}
              mono
            />
            <KV
              k="Amount paid"
              v={formatMoney(bill.amountPaid, bill.currencyCode, { compact: true, paren: true })}
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
                  {formatMoney(balance, bill.currencyCode, { compact: true, paren: true })}
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

        {isVendorCredit && (
          <Card
            title="Vendor credit"
            actions={
              <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                Remaining {formatMoney(vcRemaining, bill.currencyCode, { compact: true })}
              </span>
            }
          >
            <div className="p-3.5 flex flex-col gap-3">
              {creditAppsFrom.length > 0 && (
                <Table>
                  <THead>
                    <TR hover={false}>
                      <TH>Applied to bill</TH>
                      <TH num>Amount</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {creditAppsFrom.map((a) => (
                      <TR key={a.id}>
                        <TD mono>
                          <Link
                            href={`/bills/${a.targetBillId}`}
                            style={{ color: "var(--ink)", textDecoration: "none" }}
                          >
                            {a.targetBillId}
                          </Link>
                        </TD>
                        <TD num>
                          {formatMoney(a.amount, bill.currencyCode, { compact: true })}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
              {vcRemaining > 0.005 &&
              bill.status !== "draft" &&
              bill.status !== "void" &&
              openBillTargets.length > 0 ? (
                <form
                  action={applyVendorCreditAction}
                  className="flex items-end gap-3 flex-wrap"
                >
                  <input type="hidden" name="creditBillId" value={bill.id} />
                  <SelectField label="Apply to bill" name="targetBillId" required>
                    {openBillTargets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.billNumber} — bal{" "}
                        {formatMoney(t.balanceDue, t.currencyCode, { compact: true })}
                      </option>
                    ))}
                  </SelectField>
                  <Field
                    label="Amount"
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    mono
                    defaultValue={vcRemaining.toFixed(2)}
                  />
                  <Button variant="primary" type="submit">
                    Apply credit
                  </Button>
                </form>
              ) : (
                <div className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                  {bill.status === "draft"
                    ? "Approve the vendor credit to apply it."
                    : vcRemaining <= 0.005
                      ? "Fully applied."
                      : "No open bills for this vendor to apply to."}
                </div>
              )}
            </div>
          </Card>
        )}

        {!isVendorCredit && creditAppsTo.length > 0 && (
          <Card title="Vendor credits applied">
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Vendor credit</TH>
                  <TH num>Amount</TH>
                </TR>
              </THead>
              <TBody>
                {creditAppsTo.map((a) => (
                  <TR key={a.id}>
                    <TD mono>
                      <Link
                        href={`/bills/${a.creditBillId}`}
                        style={{ color: "var(--ink)", textDecoration: "none" }}
                      >
                        {a.creditBillId}
                      </Link>
                    </TD>
                    <TD num>
                      {formatMoney(a.amount, bill.currencyCode, { compact: true })}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}

        <Card title="Line items">
          <Table>
            <THead>
              <TR hover={false}>
                <TH>#</TH>
                <TH>Description</TH>
                <TH>Expense account</TH>
                {showLineClients && <TH>Billed to</TH>}
                <TH num>Qty</TH>
                <TH num>Unit price</TH>
                <TH num>Amount</TH>
              </TR>
            </THead>
            <TBody>
              {bill.lines.map((line) => {
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
                    {showLineClients && (
                      <TD>
                        {linePayerName(line) ? (
                          <span>
                            {linePayerName(line)}
                            {line.chargebackInvoiceId && (
                              <span
                                className="ml-1.5"
                                style={{ color: "var(--ink-4)", fontSize: 11 }}
                              >
                                · invoiced
                              </span>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: "var(--ink-4)" }}>
                            not rebilled
                          </span>
                        )}
                      </TD>
                    )}
                    <TD num>{line.quantity}</TD>
                    <TD num>{formatMoney(line.unitPrice, bill.currencyCode, { compact: true, paren: true })}</TD>
                    <TD num>{formatMoney(line.amount, bill.currencyCode, { compact: true, paren: true })}</TD>
                  </TR>
                );
              })}
              <TR total hover={false}>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD>Subtotal</TD>
                {showLineClients && <TD>{""}</TD>}
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD num>{formatMoney(bill.subtotal, bill.currencyCode, { compact: true, paren: true })}</TD>
              </TR>
              <TR total hover={false}>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD>Tax</TD>
                {showLineClients && <TD>{""}</TD>}
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD num>{formatMoney(bill.taxAmount, bill.currencyCode, { compact: true, paren: true })}</TD>
              </TR>
              <TR total hover={false}>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD>Total</TD>
                {showLineClients && <TD>{""}</TD>}
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD num>{formatMoney(bill.total, bill.currencyCode, { compact: true, paren: true })}</TD>
              </TR>
              {hasFxSnapshot && (
                <TR hover={false}>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD
                    colSpan={showLineClients ? 4 : 3}
                    style={{ color: "var(--ink-3)", fontSize: 11.5 }}
                  >
                    Booked at 1 {baseCode} = {fxRateNum} {bill.currencyCode}
                    {" · "}
                    Base total: {formatMoney(baseBillTotal, baseCode, { compact: true })}
                  </TD>
                  <TD>{""}</TD>
                </TR>
              )}
            </TBody>
          </Table>
        </Card>

        <Card title="Chargeback">
          {cb === "saved" && (
            <div
              className="m-3.5 mb-0 rounded-md px-3 py-2 text-[12.5px]"
              style={{
                background: "var(--p-active-bg)",
                color: "var(--p-active-fg)",
                border: "1px solid var(--p-active-fg)",
              }}
            >
              Chargeback saved.
            </div>
          )}
          {cb === "cleared" && (
            <div
              className="m-3.5 mb-0 rounded-md px-3 py-2 text-[12.5px]"
              style={{
                background: "var(--rail)",
                color: "var(--ink-2)",
                border: "1px solid var(--line)",
              }}
            >
              Chargeback cleared.
            </div>
          )}

          {bill.chargebackSplit ? (
            (() => {
              // Per-payer breakdown from the line allocations (client or
              // entity per chargebackSplitBy). A payer is fully invoiced
              // when every one of their lines is stamped.
              const pct =
                bill.chargebackType === "markup" && bill.markupPct
                  ? parseFloat(bill.markupPct)
                  : 0;
              const byClient = new Map<
                string,
                { share: number; billed: number; invoiceIds: Set<string> }
              >();
              let unassigned = 0;
              for (const l of bill.lines) {
                const amt = parseAmount(l.amount);
                const payer = splitByEntity ? l.entityId : l.clientId;
                if (!payer) {
                  unassigned += amt;
                  continue;
                }
                const agg =
                  byClient.get(payer) ??
                  { share: 0, billed: 0, invoiceIds: new Set<string>() };
                agg.share += amt;
                if (l.chargebackInvoiceId) {
                  agg.billed += amt;
                  agg.invoiceIds.add(l.chargebackInvoiceId);
                }
                byClient.set(payer, agg);
              }
              const anyInvoiced = [...byClient.values()].some(
                (a) => a.invoiceIds.size > 0,
              );
              return (
                <div className="p-3.5 flex flex-col gap-3">
                  <div className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                    Split chargeback —{" "}
                    {bill.chargebackType === "markup"
                      ? `markup ${(pct * 100).toString()}%`
                      : bill.chargebackType === "included"
                        ? "included in annual fee"
                        : "at cost"}
                    , per-line {splitByEntity ? "entities" : "clients"}.
                  </div>
                  <KVGrid>
                    {[...byClient.entries()].map(([cid, agg]) => {
                      const rebill =
                        Math.round(agg.share * (1 + pct) * 100) / 100;
                      const fullyBilled =
                        agg.billed >= agg.share && agg.invoiceIds.size > 0;
                      return (
                        <KV
                          key={cid}
                          k={
                            splitByEntity
                              ? (entityNameById.get(cid) ?? "—")
                              : (customerNameById.get(cid) ?? "—")
                          }
                          v={`${formatMoney(rebill, bill.currencyCode, { paren: true, compact: true })}${
                            bill.chargebackType === "included"
                              ? ""
                              : fullyBilled
                                ? " · invoiced"
                                : " · pending"
                          }`}
                          mono
                        />
                      );
                    })}
                    {unassigned > 0 && (
                      <KV
                        k="Not rebilled"
                        v={formatMoney(unassigned, bill.currencyCode, {
                          paren: true,
                          compact: true,
                        })}
                        mono
                      />
                    )}
                    {bill.chargebackNotes && (
                      <KV k="Notes" v={bill.chargebackNotes} />
                    )}
                  </KVGrid>
                  <div
                    className="text-[11.5px]"
                    style={{ color: "var(--ink-4)" }}
                  >
                    {splitByEntity
                      ? "Pending shares are invoiced from each entity's owning client's page"
                      : "Pending shares are invoiced from each client's page"}{" "}
                    (Pending chargebacks).
                  </div>
                  {!anyInvoiced && (
                    <form action={setBillChargebackAction}>
                      <input type="hidden" name="billId" value={bill.id} />
                      <input type="hidden" name="intent" value="clear" />
                      <Button type="submit" variant="secondary">
                        Clear chargeback
                      </Button>
                    </form>
                  )}
                </div>
              );
            })()
          ) : bill.chargebackInvoiceId && chargebackInvoice ? (
            <div className="p-3.5 flex flex-col gap-2">
              <div className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                Rebilled on invoice{" "}
                <Link
                  href={`/invoices/${chargebackInvoice.id}`}
                  style={{
                    color: "var(--ink)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {chargebackInvoice.invoiceNumber}
                </Link>{" "}
                →
              </div>
              <KVGrid>
                <KV
                  k="Recipient"
                  v={
                    chargebackEntity
                      ? `${chargebackEntity.name}${chargebackClient ? ` · ${chargebackClient.name}` : ""}`
                      : chargebackClient?.name ?? "—"
                  }
                />
                <KV
                  k="Method"
                  v={
                    bill.chargebackType === "markup"
                      ? `Markup ${bill.markupPct ? (parseFloat(bill.markupPct) * 100).toString() : "0"}%`
                      : bill.chargebackType === "fixed"
                        ? "Fixed amount"
                        : bill.chargebackType === "cost"
                          ? "At cost"
                          : bill.chargebackType === "included"
                            ? "Included in annual fee"
                            : "—"
                  }
                />
                <KV
                  k="Rebill amount"
                  v={
                    rebillPreview != null
                      ? formatMoney(rebillPreview, "USD", { paren: true , compact: true })
                      : "—"
                  }
                  mono
                />
                {bill.chargebackNotes && (
                  <KV k="Notes" v={bill.chargebackNotes} />
                )}
              </KVGrid>
            </div>
          ) : (
            <BillChargebackPanel
              bill={bill}
              total={billTotal}
              customers={activeCustomers}
              entities={sortedEntities}
            />
          )}
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
