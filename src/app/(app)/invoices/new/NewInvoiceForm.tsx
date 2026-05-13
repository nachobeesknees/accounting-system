"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { formatMoneyInput, formatUSD, parseAmount } from "@/lib/money";
import type { Account, Customer } from "@/lib/types";
import {
  createInvoiceAction,
  type CreateInvoiceState,
} from "./actions";

type Line = {
  description: string;
  accountId: string;
  quantity: string;
  unitPrice: string;
};

function blankLine(): Line {
  return { description: "", accountId: "", quantity: "1", unitPrice: "" };
}

const INITIAL_STATE: CreateInvoiceState = { error: null };

export function NewInvoiceForm({
  customers,
  revenueAccounts,
  today,
  dueDefault,
}: {
  customers: Customer[];
  revenueAccounts: Account[];
  today: string;
  dueDefault: string;
}) {
  const [state, formAction] = useFormState(createInvoiceAction, INITIAL_STATE);
  const [lines, setLines] = useState<Line[]>([blankLine()]);

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

      <Card title="Header" bodyPadding>
        <div className="flex flex-col gap-3">
          <Row>
            <SelectField label="Customer" name="customerId" required defaultValue="">
              <option value="" disabled>
                Select customer…
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </SelectField>
            <div />
          </Row>
          <Row>
            <Field
              label="Invoice date"
              name="invoiceDate"
              type="date"
              required
              defaultValue={today}
            />
            <Field
              label="Due date"
              name="dueDate"
              type="date"
              required
              defaultValue={dueDefault}
            />
          </Row>
          <TextareaField
            label="Notes"
            name="notes"
            placeholder="Optional notes for the customer"
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
                    <select
                      name={`lines[${i}][accountId]`}
                      value={line.accountId}
                      onChange={(e) =>
                        updateLine(i, { accountId: e.target.value })
                      }
                      className="px-2 py-1 text-[12.5px] rounded-md outline-none w-full"
                      style={{
                        background: "var(--paper)",
                        border: "1px solid var(--line-2)",
                        color: "var(--ink)",
                      }}
                    >
                      <option value="">— Select revenue account —</option>
                      {revenueAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </select>
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
                      {formatUSD(amount)}
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
              <TD num>{formatUSD(subtotal)}</TD>
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
