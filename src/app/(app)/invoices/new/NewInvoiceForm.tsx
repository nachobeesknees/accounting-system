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
}: {
  customers: Customer[];
  revenueAccounts: Account[];
  today: string;
  dueDefault: string;
  dimensionsWithValues: Array<{ dimension: Dimension; values: DimensionValue[] }>;
  accountingPeriods: AccountingPeriod[];
}) {
  const [state, formAction] = useFormState(createInvoiceAction, INITIAL_STATE);
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [customerId, setCustomerId] = useState<string>("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDateState, setDueDateState] = useState(dueDefault);
  const [notes, setNotes] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [showReview, setShowReview] = useState(false);

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

      <Card title="Header" bodyPadding>
        <div className="flex flex-col gap-3">
          <Row>
            <SmartSelectField
              label="Customer"
              name="customerId"
              required
              value={customerId}
              onChange={setCustomerId}
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
          <TextareaField
            label="Notes"
            name="notes"
            placeholder="Optional notes for the customer"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </Card>

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
