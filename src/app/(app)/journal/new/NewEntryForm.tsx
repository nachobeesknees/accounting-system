"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, SelectField } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { formatMoneyInput, formatMoney, parseAmount } from "@/lib/money";
import type {
  Account,
  Dimension,
  DimensionValue,
  FiscalPeriod,
} from "@/lib/types";
import { createEntry, type CreateEntryState } from "./actions";

type Line = {
  accountId: string;
  description: string;
  debit: string;
  credit: string;
  dimensions: Record<string, string>;
};

function blankLine(): Line {
  return {
    accountId: "",
    description: "",
    debit: "",
    credit: "",
    dimensions: {},
  };
}

const INITIAL_STATE: CreateEntryState = { error: null };

export function NewEntryForm({
  accounts,
  periods,
  today,
  dimensionsWithValues,
}: {
  accounts: Account[];
  periods: FiscalPeriod[];
  today: string;
  dimensionsWithValues: Array<{ dimension: Dimension; values: DimensionValue[] }>;
}) {
  const [state, formAction] = useFormState(createEntry, INITIAL_STATE);
  const [lines, setLines] = useState<Line[]>([blankLine(), blankLine()]);

  const debitTotal = useMemo(
    () => lines.reduce((s, l) => s + parseAmount(l.debit), 0),
    [lines],
  );
  const creditTotal = useMemo(
    () => lines.reduce((s, l) => s + parseAmount(l.credit), 0),
    [lines],
  );
  const balanced = Math.abs(debitTotal - creditTotal) < 0.005 && debitTotal > 0;

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function setDebit(i: number, value: string) {
    setLines((prev) =>
      prev.map((l, idx) =>
        idx === i ? { ...l, debit: value, credit: value ? "" : l.credit } : l,
      ),
    );
  }

  function setCredit(i: number, value: string) {
    setLines((prev) =>
      prev.map((l, idx) =>
        idx === i ? { ...l, credit: value, debit: value ? "" : l.debit } : l,
      ),
    );
  }

  function addLine() {
    setLines((prev) => [...prev, blankLine()]);
  }

  function removeLine(i: number) {
    setLines((prev) =>
      prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i),
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
            <Field
              label="Entry date"
              name="entryDate"
              type="date"
              required
              defaultValue={today}
            />
            <Field
              label="Description"
              name="description"
              required
              placeholder="What is this entry for?"
            />
          </Row>
          <Row>
            <Field
              label="Reference"
              name="reference"
              placeholder="Optional reference"
            />
            <SelectField label="Source" name="source" defaultValue="manual">
              <option value="manual">Manual</option>
              <option value="invoice">Invoice</option>
              <option value="bill">Bill</option>
              <option value="reconciliation">Reconciliation</option>
            </SelectField>
          </Row>
          <Row>
            <SelectField
              label="Period"
              name="fiscalPeriodId"
              defaultValue={periods[0]?.id ?? ""}
            >
              <option value="">— None —</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.status})
                </option>
              ))}
            </SelectField>
            <div />
          </Row>
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
              <TH>Account</TH>
              <TH>Description</TH>
              <TH num>Debit</TH>
              <TH num>Credit</TH>
              <TH>{""}</TH>
            </TR>
          </THead>
          <TBody>
            {lines.map((line, i) => (
              <TR key={i} hover={false}>
                <TD
                  mono
                  style={{ color: "var(--ink-3)", width: 40 }}
                >
                  {i + 1}
                </TD>
                <TD>
                  <div className="flex flex-col gap-1">
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
                      <option value="">— Select account —</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </select>
                    {dimensionsWithValues.map(({ dimension, values }) => (
                      <select
                        key={dimension.id}
                        name={`lines[${i}][dim][${dimension.key}]`}
                        value={line.dimensions[dimension.key] ?? ""}
                        onChange={(e) =>
                          updateLine(i, {
                            dimensions: {
                              ...line.dimensions,
                              [dimension.key]: e.target.value,
                            },
                          })
                        }
                        className="px-2 py-1 text-[11.5px] rounded-md outline-none w-full"
                        style={{
                          background: "var(--paper)",
                          border: "1px solid var(--line-2)",
                          color: "var(--ink-2)",
                        }}
                      >
                        <option value="">— {dimension.label} —</option>
                        {values.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    ))}
                  </div>
                </TD>
                <TD>
                  <input
                    type="text"
                    name={`lines[${i}][description]`}
                    value={line.description}
                    onChange={(e) =>
                      updateLine(i, { description: e.target.value })
                    }
                    placeholder="Memo"
                    className="px-2 py-1 text-[12.5px] rounded-md outline-none w-full"
                    style={{
                      background: "var(--paper)",
                      border: "1px solid var(--line-2)",
                      color: "var(--ink)",
                    }}
                  />
                </TD>
                <TD num>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    name={`lines[${i}][debit]`}
                    value={line.debit}
                    onChange={(e) => setDebit(i, formatMoneyInput(e.target.value))}
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
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    name={`lines[${i}][credit]`}
                    value={line.credit}
                    onChange={(e) => setCredit(i, formatMoneyInput(e.target.value))}
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
                <TD>
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    disabled={lines.length <= 2}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--ink-3)",
                      cursor: lines.length <= 2 ? "not-allowed" : "pointer",
                      opacity: lines.length <= 2 ? 0.4 : 1,
                      padding: 4,
                      fontSize: 14,
                    }}
                    aria-label={`Remove line ${i + 1}`}
                  >
                    ×
                  </button>
                </TD>
              </TR>
            ))}
            <TR total hover={false}>
              <TD>{""}</TD>
              <TD>Totals</TD>
              <TD>
                <Pill variant={balanced ? "active" : "review"}>
                  {balanced ? "Balanced" : "Unbalanced"}
                </Pill>
              </TD>
              <TD num>{formatMoney(debitTotal, "USD")}</TD>
              <TD num>{formatMoney(creditTotal, "USD")}</TD>
              <TD>{""}</TD>
            </TR>
          </TBody>
        </Table>
      </Card>

      <div className="flex gap-2 items-center">
        <Button variant="secondary" type="submit" name="action" value="draft">
          Save as draft
        </Button>
        <Button variant="primary" type="submit" name="action" value="post">
          Save & post
        </Button>
        <ButtonLink variant="ghost" href="/journal">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
