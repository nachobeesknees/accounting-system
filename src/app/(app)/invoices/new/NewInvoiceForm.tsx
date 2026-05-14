"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, TextareaField } from "@/components/ui/Field";
import {
  SmartSelect,
  SmartSelectField,
  type SmartSelectOption,
} from "@/components/ui/SmartSelect";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { OcrUpload, ReviewBanner } from "@/components/OcrUpload";
import { formatMoneyInput, formatMoney, parseAmount } from "@/lib/money";
import type { OcrExtraction } from "@/lib/ocr";
import type {
  Account,
  AccountingPeriod,
  Customer,
  Dimension,
  DimensionValue,
} from "@/lib/types";
import { PeriodStatusBanner } from "@/components/PeriodStatusBanner";
import {
  createInvoiceAction,
  type CreateInvoiceState,
} from "./actions";

const SERVICE_REVENUE_ACCOUNT_ID = "a-4000";

export type ChargebackRow = {
  billId: string;
  billNumber: string;
  vendorName: string;
  total: number;
  rebillAmount: number;
  method: "cost" | "markup" | "fixed";
  methodLabel: string;
  description: string;
};

export type PriceListEntryRow = {
  id: string;
  label: string;
  code: string;
  unitPrice: number;
  includedQuantity: number | null;
};

type Line = {
  description: string;
  accountId: string;
  quantity: string;
  unitPrice: string;
  dimensions: Record<string, string>;
};

function blankLine(): Line {
  return {
    description: "",
    accountId: "",
    quantity: "1",
    unitPrice: "",
    dimensions: {},
  };
}

const INITIAL_STATE: CreateInvoiceState = { error: null };

export function NewInvoiceForm({
  customers,
  revenueAccounts,
  today,
  dueDefault,
  dimensionsWithValues,
  accountingPeriods,
  chargebacksByCustomer,
  priceListEntries,
}: {
  customers: Customer[];
  revenueAccounts: Account[];
  today: string;
  dueDefault: string;
  dimensionsWithValues: Array<{ dimension: Dimension; values: DimensionValue[] }>;
  accountingPeriods: AccountingPeriod[];
  chargebacksByCustomer: Record<string, ChargebackRow[]>;
  priceListEntries: PriceListEntryRow[];
}) {
  const [state, formAction] = useFormState(createInvoiceAction, INITIAL_STATE);
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [customerId, setCustomerId] = useState<string>("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDateState, setDueDateState] = useState(dueDefault);
  const [notes, setNotes] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [showReview, setShowReview] = useState(false);
  // Tax: rate is held as a percent string ("8.75") for input UX; the
  // server action converts back to decimal. Defaults to whatever the
  // selected customer carries.
  const [taxRatePct, setTaxRatePct] = useState<string>("0");
  const [taxExempt, setTaxExempt] = useState<boolean>(false);
  const [taxTouched, setTaxTouched] = useState<boolean>(false);

  // Selection state for the two new widgets.
  const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
  const [selectedPriceEntryIds, setSelectedPriceEntryIds] = useState<Set<string>>(
    new Set(),
  );
  // Bill IDs already added to the invoice (sent to server action).
  const [chargebackBillIds, setChargebackBillIds] = useState<string[]>([]);

  const customerOptions = useMemo<SmartSelectOption[]>(
    () =>
      customers.map((c) => ({
        value: c.id,
        label: c.name,
        description: `(${c.code})`,
        search: c.code,
      })),
    [customers],
  );
  const revenueAccountOptions = useMemo<SmartSelectOption[]>(
    () =>
      revenueAccounts.map((a) => ({
        value: a.id,
        label: `${a.code} — ${a.name}`,
        search: a.code,
      })),
    [revenueAccounts],
  );
  const dimensionOptions = useMemo(() => {
    const m = new Map<string, SmartSelectOption[]>();
    for (const { dimension, values } of dimensionsWithValues) {
      m.set(
        dimension.key,
        values.map((v) => ({ value: v.id, label: v.label, search: v.code })),
      );
    }
    return m;
  }, [dimensionsWithValues]);

  // Filter chargebacks by selected customer, excluding any already added.
  const pendingChargebacks: ChargebackRow[] = useMemo(() => {
    if (!customerId) return [];
    const rows = chargebacksByCustomer[customerId] ?? [];
    return rows.filter((r) => !chargebackBillIds.includes(r.billId));
  }, [customerId, chargebacksByCustomer, chargebackBillIds]);

  function applyOcr(data: OcrExtraction, raw: string) {
    setOcrText(raw);
    setShowReview(true);
    if (data.date && invoiceDate === today) setInvoiceDate(data.date);
    if (data.dueDate && dueDateState === dueDefault) setDueDateState(data.dueDate);
    if (data.invoiceNumber && notes === "") {
      setNotes(`Source invoice #${data.invoiceNumber}`);
    } else if (data.vendorName && notes === "") {
      setNotes(`From ${data.vendorName}`);
    }
    if (data.lineItems && data.lineItems.length > 0) {
      // Only replace lines if the user hasn't started entering any real data.
      const userEmpty = lines.every(
        (l) =>
          l.description.trim() === "" &&
          l.accountId === "" &&
          parseAmount(l.unitPrice) === 0,
      );
      if (userEmpty) {
        setLines(
          data.lineItems.map((li) => ({
            description: li.description ?? "",
            accountId: "",
            quantity: li.quantity != null ? String(li.quantity) : "1",
            unitPrice:
              li.unitPrice != null
                ? li.unitPrice.toFixed(2)
                : li.total != null && li.quantity
                  ? (li.total / li.quantity).toFixed(2)
                  : "",
            dimensions: {},
          })),
        );
      }
    }
  }

  const subtotal = useMemo(
    () =>
      lines.reduce(
        (s, l) => s + parseAmount(l.quantity) * parseAmount(l.unitPrice),
        0,
      ),
    [lines],
  );

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, blankLine()]);
  }

  function removeLine(i: number) {
    setLines((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i),
    );
  }

  /** Append new lines to the table, replacing any leading blank line. */
  function appendLines(newLines: Line[]) {
    if (newLines.length === 0) return;
    setLines((prev) => {
      const onlyBlank =
        prev.length === 1 &&
        prev[0].description.trim() === "" &&
        prev[0].accountId === "" &&
        parseAmount(prev[0].unitPrice) === 0;
      return onlyBlank ? newLines : [...prev, ...newLines];
    });
  }

  function toggleBill(id: string) {
    setSelectedBillIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePriceEntry(id: string) {
    setSelectedPriceEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addSelectedChargebacks() {
    const picks = pendingChargebacks.filter((r) => selectedBillIds.has(r.billId));
    if (picks.length === 0) return;
    const newLines: Line[] = picks.map((r) => ({
      description: r.description,
      accountId: SERVICE_REVENUE_ACCOUNT_ID,
      quantity: "1",
      unitPrice: r.rebillAmount.toFixed(2),
      dimensions: {},
    }));
    appendLines(newLines);
    setChargebackBillIds((prev) => [...prev, ...picks.map((p) => p.billId)]);
    setSelectedBillIds(new Set());
  }

  function addSelectedPriceListEntries() {
    const picks = priceListEntries.filter((e) =>
      selectedPriceEntryIds.has(e.id),
    );
    if (picks.length === 0) return;
    const newLines: Line[] = picks.map((e) => ({
      description: e.label,
      accountId: SERVICE_REVENUE_ACCOUNT_ID,
      quantity:
        e.includedQuantity != null && e.includedQuantity > 0
          ? String(e.includedQuantity)
          : "1",
      unitPrice: e.unitPrice.toFixed(2),
      dimensions: {},
    }));
    appendLines(newLines);
    setSelectedPriceEntryIds(new Set());
  }

  const allBillsSelected =
    pendingChargebacks.length > 0 &&
    pendingChargebacks.every((r) => selectedBillIds.has(r.billId));
  function toggleAllBills() {
    if (allBillsSelected) {
      setSelectedBillIds(new Set());
    } else {
      setSelectedBillIds(new Set(pendingChargebacks.map((r) => r.billId)));
    }
  }

  const selectedChargebackTotal = useMemo(
    () =>
      pendingChargebacks
        .filter((r) => selectedBillIds.has(r.billId))
        .reduce((s, r) => s + r.rebillAmount, 0),
    [pendingChargebacks, selectedBillIds],
  );

  return (
    <form action={formAction} className="flex flex-col gap-3.5 px-6 py-3.5 pb-8">
      {state.error && (
        <div
          className="rounded-md px-3 py-2 text-[12.5px]"
          style={{
            background: "var(--p-review-bg)",
            color: "var(--p-review-fg)",
            border: "1px solid var(--p-review-fg)",
          }}
        >
          {state.error}
        </div>
      )}

      <OcrUpload formType="invoice" onExtracted={applyOcr} />
      {showReview && <ReviewBanner onDismiss={() => setShowReview(false)} />}
      <input type="hidden" name="ocrText" value={ocrText} />
      <PeriodStatusBanner date={invoiceDate} periods={accountingPeriods} />

      {/* Hidden inputs for chargeback bill IDs already applied. */}
      {chargebackBillIds.map((id) => (
        <input
          key={id}
          type="hidden"
          name="chargebackBillIds[]"
          value={id}
        />
      ))}

      <Card title="Header" bodyPadding>
        <div className="flex flex-col gap-3">
          <Row>
            <SmartSelectField
              label="Customer"
              name="customerId"
              required
              value={customerId}
              onChange={(v) => {
                setCustomerId(v);
                // Reset chargeback selection state on customer change.
                setSelectedBillIds(new Set());
                setChargebackBillIds([]);
                // Pull tax defaults from the picked customer unless the
                // user has already overridden them on this form.
                if (!taxTouched) {
                  const c = customers.find((cc) => cc.id === v);
                  if (c) {
                    const rate = parseFloat(c.taxRate ?? "0") || 0;
                    setTaxRatePct(
                      (rate * 100).toFixed(4).replace(/\.?0+$/, "") || "0",
                    );
                    setTaxExempt(!!c.taxExempt);
                  }
                }
              }}
              options={customerOptions}
              emptyLabel="Select customer…"
            />
            <div />
          </Row>
          <Row>
            <Field
              label="Invoice date"
              name="invoiceDate"
              type="date"
              required
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
            <Field
              label="Due date"
              name="dueDate"
              type="date"
              required
              value={dueDateState}
              onChange={(e) => setDueDateState(e.target.value)}
            />
          </Row>
          {/* Tax. Rate as percent for UX; the action converts to decimal.
              Defaults from the customer's row on customer-change, unless
              the user has already edited the tax inputs on this form. */}
          <Row>
            <div className="flex flex-col gap-1">
              <label
                className="text-[11px] uppercase tracking-wider"
                style={{ color: "var(--ink-3)" }}
              >
                Tax rate (%)
              </label>
              <input
                type="number"
                name="taxRatePct"
                step="0.0001"
                min="0"
                max="100"
                value={taxRatePct}
                onChange={(e) => {
                  setTaxRatePct(e.target.value);
                  setTaxTouched(true);
                }}
                className="px-2 py-1 text-[12.5px] rounded-md outline-none"
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--line-2)",
                  color: "var(--ink)",
                  fontFamily: "var(--font-mono)",
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                className="text-[11px] uppercase tracking-wider"
                style={{ color: "var(--ink-3)" }}
              >
                Exemption
              </label>
              <label
                className="inline-flex items-center gap-2 text-[12.5px] py-1"
                style={{ color: "var(--ink-2)" }}
              >
                <input
                  type="checkbox"
                  name="taxExempt"
                  checked={taxExempt}
                  onChange={(e) => {
                    setTaxExempt(e.target.checked);
                    setTaxTouched(true);
                  }}
                />
                Tax exempt — no sales tax on this invoice
              </label>
            </div>
          </Row>
          <TextareaField
            label="Notes"
            name="notes"
            placeholder="Optional notes for the customer"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </Card>

      {/* Widget 1: Pending vendor chargebacks for the selected customer. */}
      {customerId && pendingChargebacks.length > 0 && (
        <Card
          title="Pending vendor chargebacks"
          actions={
            <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
              {pendingChargebacks.length} bill
              {pendingChargebacks.length === 1 ? "" : "s"} ready to rebill
            </span>
          }
        >
          <Table>
            <THead>
              <TR hover={false}>
                <TH>
                  <input
                    type="checkbox"
                    aria-label="Select all chargebacks"
                    checked={allBillsSelected}
                    onChange={toggleAllBills}
                  />
                </TH>
                <TH>Bill #</TH>
                <TH>Vendor</TH>
                <TH>Method</TH>
                <TH num>Bill total</TH>
                <TH num>Rebill</TH>
              </TR>
            </THead>
            <TBody>
              {pendingChargebacks.map((r) => {
                const checked = selectedBillIds.has(r.billId);
                return (
                  <TR key={r.billId} hover={false}>
                    <TD>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleBill(r.billId)}
                        aria-label={`Select ${r.billNumber}`}
                      />
                    </TD>
                    <TD mono>{r.billNumber}</TD>
                    <TD>{r.vendorName}</TD>
                    <TD style={{ color: "var(--ink-3)" }}>{r.methodLabel}</TD>
                    <TD num>
                      {formatMoney(r.total, "USD", { compact: true })}
                    </TD>
                    <TD num>
                      {formatMoney(r.rebillAmount, "USD", { compact: true })}
                    </TD>
                  </TR>
                );
              })}
              <TR total hover={false}>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD>Selected total</TD>
                <TD>{""}</TD>
                <TD num>
                  {formatMoney(selectedChargebackTotal, "USD", {
                    compact: true,
                  })}
                </TD>
              </TR>
            </TBody>
          </Table>
          <div className="p-3.5 flex justify-end">
            <Button
              type="button"
              variant="primary"
              onClick={addSelectedChargebacks}
              disabled={selectedBillIds.size === 0}
            >
              Add selected to invoice
            </Button>
          </div>
        </Card>
      )}

      {/* Widget 2: Pull from current price list. Collapsible. */}
      {customerId && priceListEntries.length > 0 && (
        <section
          className="rounded-lg overflow-hidden"
          style={{
            border: "1px solid var(--line)",
            background: "var(--raised)",
          }}
        >
          <details>
            <summary
              className="flex items-center justify-between gap-3 px-3.5 py-2 cursor-pointer"
              style={{
                borderBottom: "1px solid var(--line)",
                listStyle: "none",
              }}
            >
              <h3 className="text-[12.5px] font-semibold tracking-tight m-0">
                Pull from price list
              </h3>
              <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                {priceListEntries.length} item
                {priceListEntries.length === 1 ? "" : "s"}
              </span>
            </summary>
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>{""}</TH>
                  <TH>Code</TH>
                  <TH>Label</TH>
                  <TH num>Qty</TH>
                  <TH num>Unit price</TH>
                </TR>
              </THead>
              <TBody>
                {priceListEntries.map((e) => {
                  const checked = selectedPriceEntryIds.has(e.id);
                  return (
                    <TR key={e.id} hover={false}>
                      <TD>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePriceEntry(e.id)}
                          aria-label={`Select ${e.label}`}
                        />
                      </TD>
                      <TD mono style={{ color: "var(--ink-3)" }}>
                        {e.code}
                      </TD>
                      <TD>{e.label}</TD>
                      <TD num>
                        {e.includedQuantity != null && e.includedQuantity > 0
                          ? e.includedQuantity
                          : 1}
                      </TD>
                      <TD num>
                        {formatMoney(e.unitPrice, "USD", { compact: true })}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <div className="p-3.5 flex justify-end">
              <Button
                type="button"
                variant="primary"
                onClick={addSelectedPriceListEntries}
                disabled={selectedPriceEntryIds.size === 0}
              >
                Add selected to invoice
              </Button>
            </div>
          </details>
        </section>
      )}

      <Card
        title="Line items"
        actions={
          <button
            type="button"
            onClick={addLine}
            style={{
              color: "var(--ink-3)",
              textDecoration: "none",
              cursor: "pointer",
              background: "transparent",
              border: "none",
              fontSize: 11.5,
            }}
          >
            + Add line
          </button>
        }
      >
        <Table>
          <THead>
            <TR hover={false}>
              <TH>#</TH>
              <TH>Description</TH>
              <TH>Account</TH>
              <TH num>Qty</TH>
              <TH num>Unit price</TH>
              <TH num>Amount</TH>
              <TH>{""}</TH>
            </TR>
          </THead>
          <TBody>
            {lines.map((line, i) => {
              const amount =
                parseAmount(line.quantity) * parseAmount(line.unitPrice);
              return (
                <TR key={i} hover={false}>
                  <TD mono style={{ color: "var(--ink-3)", width: 40 }}>
                    {i + 1}
                  </TD>
                  <TD>
                    <input
                      type="text"
                      name={`lines[${i}][description]`}
                      value={line.description}
                      onChange={(e) =>
                        updateLine(i, { description: e.target.value })
                      }
                      placeholder="Service description"
                      className="px-2 py-1 text-[12.5px] rounded-md outline-none w-full"
                      style={{
                        background: "var(--paper)",
                        border: "1px solid var(--line-2)",
                        color: "var(--ink)",
                      }}
                    />
                  </TD>
                  <TD>
                    <div className="flex flex-col gap-1">
                      <SmartSelect
                        name={`lines[${i}][accountId]`}
                        value={line.accountId}
                        onChange={(v) => updateLine(i, { accountId: v })}
                        options={revenueAccountOptions}
                        emptyLabel="— Select revenue account —"
                        ariaLabel="Revenue account"
                      />
                      {dimensionsWithValues.map(({ dimension }) => (
                        <SmartSelect
                          key={dimension.id}
                          name={`lines[${i}][dim][${dimension.key}]`}
                          value={line.dimensions[dimension.key] ?? ""}
                          onChange={(v) =>
                            updateLine(i, {
                              dimensions: {
                                ...line.dimensions,
                                [dimension.key]: v,
                              },
                            })
                          }
                          options={dimensionOptions.get(dimension.key) ?? []}
                          emptyLabel={`— ${dimension.label} —`}
                          clearable
                          ariaLabel={dimension.label}
                        />
                      ))}
                    </div>
                  </TD>
                  <TD num>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      name={`lines[${i}][quantity]`}
                      value={line.quantity}
                      onChange={(e) =>
                        updateLine(i, { quantity: e.target.value })
                      }
                      placeholder="1"
                      className="px-2 py-1 text-[12.5px] rounded-md outline-none text-right w-20"
                      style={{
                        background: "var(--paper)",
                        border: "1px solid var(--line-2)",
                        color: "var(--ink)",
                        fontFamily: "var(--font-mono)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    />
                  </TD>
                  <TD num>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      name={`lines[${i}][unitPrice]`}
                      value={line.unitPrice}
                      onChange={(e) =>
                        updateLine(i, {
                          unitPrice: formatMoneyInput(e.target.value),
                        })
                      }
                      placeholder="0.00"
                      className="px-2 py-1 text-[12.5px] rounded-md outline-none text-right w-28"
                      style={{
                        background: "var(--paper)",
                        border: "1px solid var(--line-2)",
                        color: "var(--ink)",
                        fontFamily: "var(--font-mono)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    />
                  </TD>
                  <TD num>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatMoney(amount, "USD")}
                    </span>
                  </TD>
                  <TD>
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      disabled={lines.length <= 1}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--ink-3)",
                        cursor: lines.length <= 1 ? "not-allowed" : "pointer",
                        opacity: lines.length <= 1 ? 0.4 : 1,
                        padding: 4,
                        fontSize: 14,
                      }}
                      aria-label={`Remove line ${i + 1}`}
                    >
                      ×
                    </button>
                  </TD>
                </TR>
              );
            })}
            <TR total hover={false}>
              <TD>{""}</TD>
              <TD>{""}</TD>
              <TD>Subtotal</TD>
              <TD>{""}</TD>
              <TD>{""}</TD>
              <TD num>{formatMoney(subtotal, "USD")}</TD>
              <TD>{""}</TD>
            </TR>
            {/* Tax + Total rows. When exempt or rate is 0, tax shows 0
                and Total === Subtotal. The math runs live so the user
                sees the final invoice amount before submitting. */}
            {(() => {
              const ratePct = parseFloat(taxRatePct);
              const rate =
                taxExempt || !Number.isFinite(ratePct) || ratePct <= 0
                  ? 0
                  : ratePct / 100;
              const taxAmount = Math.round(subtotal * rate * 100) / 100;
              const total = subtotal + taxAmount;
              return (
                <>
                  <TR hover={false}>
                    <TD>{""}</TD>
                    <TD>{""}</TD>
                    <TD style={{ color: "var(--ink-3)" }}>
                      Tax
                      {taxExempt
                        ? " (exempt)"
                        : ratePct > 0
                          ? ` (${ratePct}%)`
                          : ""}
                    </TD>
                    <TD>{""}</TD>
                    <TD>{""}</TD>
                    <TD num style={{ color: "var(--ink-3)" }}>
                      {formatMoney(taxAmount, "USD")}
                    </TD>
                    <TD>{""}</TD>
                  </TR>
                  <TR total hover={false}>
                    <TD>{""}</TD>
                    <TD>{""}</TD>
                    <TD style={{ fontWeight: 600 }}>Total</TD>
                    <TD>{""}</TD>
                    <TD>{""}</TD>
                    <TD num style={{ fontWeight: 600 }}>
                      {formatMoney(total, "USD")}
                    </TD>
                    <TD>{""}</TD>
                  </TR>
                </>
              );
            })()}
          </TBody>
        </Table>
      </Card>

      <div className="flex gap-2 items-center">
        <Button variant="primary" type="submit" name="action" value="post">
          Save & post
        </Button>
        <Button variant="secondary" type="submit" name="action" value="draft">
          Save as draft
        </Button>
        <ButtonLink variant="ghost" href="/invoices">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
