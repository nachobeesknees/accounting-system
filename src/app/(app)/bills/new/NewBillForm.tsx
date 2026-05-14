"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";

import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { formatMoneyInput, formatUSD, parseAmount } from "@/lib/money";
import type {
  Account,
  Customer,
  Dimension,
  DimensionValue,
  Entity,
  Vendor,
} from "@/lib/types";

import { createBillAction, type CreateBillState } from "./actions";

type Recipient = "none" | "client" | "entity";
type CbMethod = "cost" | "markup" | "fixed" | "included";

type Line = {
  description: string;
  accountId: string;
  quantity: string;
  unitPrice: string;
  dimensions: Record<string, string>;
};

function blankLine(accountId = ""): Line {
  return {
    description: "",
    accountId,
    quantity: "1",
    unitPrice: "",
    dimensions: {},
  };
}

const INITIAL_STATE: CreateBillState = { error: null };

export function NewBillForm({
  vendors,
  expenseAccounts,
  customers,
  entities,
  today,
  defaultDueDate,
  dimensionsWithValues,
}: {
  vendors: Vendor[];
  expenseAccounts: Account[];
  customers: Customer[];
  entities: Entity[];
  today: string;
  defaultDueDate: string;
  dimensionsWithValues: Array<{ dimension: Dimension; values: DimensionValue[] }>;
}) {
  const [state, formAction] = useFormState(createBillAction, INITIAL_STATE);
  const [vendorId, setVendorId] = useState<string>(vendors[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>([
    blankLine(vendors[0]?.defaultExpenseAccountId ?? ""),
  ]);
  const [recipient, setRecipient] = useState<Recipient>("none");
  const [cbMethod, setCbMethod] = useState<CbMethod>("cost");
  const [markupPct, setMarkupPct] = useState<string>("");
  const [rebillAmount, setRebillAmount] = useState<string>("");

  const subtotal = useMemo(
    () =>
      lines.reduce(
        (s, l) => s + parseAmount(l.quantity) * parseAmount(l.unitPrice),
        0,
      ),
    [lines],
  );

  const customerById = useMemo(
    () => new Map(customers.map((c) => [c.id, c] as const)),
    [customers],
  );

  const previewRebill = useMemo<string | null>(() => {
    if (recipient === "none") return null;
    switch (cbMethod) {
      case "cost":
        return `At cost: ${formatUSD(subtotal, { paren: true })}`;
      case "markup": {
        const pct = parseAmount(markupPct);
        const amt = Math.round(subtotal * (1 + pct / 100) * 100) / 100;
        return `With ${pct || 0}% markup: ${formatUSD(amt, { paren: true })}`;
      }
      case "fixed": {
        const amt = parseAmount(rebillAmount);
        return `Fixed: ${formatUSD(amt, { paren: true })}`;
      }
      case "included":
        return "Included in annual fee — no separate invoice will be generated.";
      default:
        return null;
    }
  }, [recipient, cbMethod, subtotal, markupPct, rebillAmount]);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    const fallback =
      vendors.find((v) => v.id === vendorId)?.defaultExpenseAccountId ?? "";
    setLines((prev) => [...prev, blankLine(fallback)]);
  }

  function removeLine(i: number) {
    setLines((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i),
    );
  }

  function onVendorChange(newId: string) {
    setVendorId(newId);
    const defaultAcct =
      vendors.find((v) => v.id === newId)?.defaultExpenseAccountId ?? "";
    if (defaultAcct) {
      setLines((prev) =>
        prev.map((l) => (l.accountId ? l : { ...l, accountId: defaultAcct })),
      );
    }
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
            <SelectField
              label="Vendor"
              name="vendorId"
              required
              value={vendorId}
              onChange={(e) => onVendorChange(e.target.value)}
            >
              <option value="">— Select vendor —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.code} — {v.name}
                </option>
              ))}
            </SelectField>
            <Field
              label="Reference"
              name="reference"
              placeholder="Vendor's invoice/bill #"
            />
          </Row>
          <Row>
            <Field
              label="Bill date"
              name="billDate"
              type="date"
              required
              defaultValue={today}
            />
            <Field
              label="Due date"
              name="dueDate"
              type="date"
              required
              defaultValue={defaultDueDate}
            />
          </Row>
          <TextareaField
            label="Notes"
            name="notes"
            placeholder="Optional notes"
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
              <TH>Expense account</TH>
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
                      placeholder="Description"
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
                        {expenseAccounts.map((a) => (
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
                  <TD num>
                    <input
                      type="number"
                      step="0.01"
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
                  <TD num mono>
                    {formatUSD(amount, { paren: true })}
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
              <TD>{""}</TD>
              <TD>{""}</TD>
              <TD>Subtotal</TD>
              <TD num mono>
                {formatUSD(subtotal, { paren: true })}
              </TD>
              <TD>{""}</TD>
            </TR>
          </TBody>
        </Table>
      </Card>

      <Card title="Chargeback" bodyPadding>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span
              className="text-[11.5px]"
              style={{ color: "var(--ink-3)" }}
            >
              Rebill to
            </span>
            <div className="flex gap-4 flex-wrap">
              {(
                [
                  ["none", "None"],
                  ["client", "Client"],
                  ["entity", "Entity"],
                ] as const
              ).map(([val, label]) => (
                <label
                  key={val}
                  className="flex items-center gap-1.5 text-[12.5px] cursor-pointer"
                  style={{ color: "var(--ink-2)" }}
                >
                  <input
                    type="radio"
                    name="chargebackRecipient"
                    value={val}
                    checked={recipient === val}
                    onChange={() => setRecipient(val)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {recipient === "client" && (
            <Row>
              <SelectField
                label="Client"
                name="chargebackClientId"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  — Select client —
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
              <div />
            </Row>
          )}

          {recipient === "entity" && (
            <Row>
              <SelectField
                label="Entity"
                name="chargebackEntityId"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  — Select entity —
                </option>
                {entities.map((e) => {
                  const owner = customerById.get(e.clientId);
                  return (
                    <option key={e.id} value={e.id}>
                      {e.name}
                      {owner ? ` · ${owner.name}` : ""}
                    </option>
                  );
                })}
              </SelectField>
              <div />
            </Row>
          )}

          {recipient !== "none" && (
            <>
              <div className="flex flex-col gap-1">
                <span
                  className="text-[11.5px]"
                  style={{ color: "var(--ink-3)" }}
                >
                  Method
                </span>
                <div className="flex gap-4 flex-wrap">
                  {(
                    [
                      ["cost", "At cost"],
                      ["markup", "Markup %"],
                      ["fixed", "Fixed amount"],
                      ["included", "Included in annual fee"],
                    ] as const
                  ).map(([val, label]) => (
                    <label
                      key={val}
                      className="flex items-center gap-1.5 text-[12.5px] cursor-pointer"
                      style={{ color: "var(--ink-2)" }}
                    >
                      <input
                        type="radio"
                        name="chargebackType"
                        value={val}
                        checked={cbMethod === val}
                        onChange={() => setCbMethod(val)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {cbMethod === "markup" && (
                <Row>
                  <Field
                    label="Markup % (e.g. 15 = 15%)"
                    name="markupPct"
                    type="number"
                    step="0.01"
                    min="0"
                    mono
                    value={markupPct}
                    onChange={(e) => setMarkupPct(e.target.value)}
                  />
                  <div />
                </Row>
              )}

              {cbMethod === "fixed" && (
                <Row>
                  <Field
                    label="Fixed rebill amount"
                    name="rebillAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    mono
                    value={rebillAmount}
                    onChange={(e) => setRebillAmount(e.target.value)}
                  />
                  <div />
                </Row>
              )}

              {previewRebill && (
                <div
                  className="text-[12.5px] rounded-md px-3 py-2"
                  style={{
                    background: "var(--rail)",
                    color: "var(--ink-2)",
                    border: "1px solid var(--line)",
                  }}
                >
                  {previewRebill}
                </div>
              )}

              <TextareaField
                label="Chargeback notes"
                name="chargebackNotes"
                placeholder="Optional context for the rebill"
              />
            </>
          )}
        </div>
      </Card>

      <div className="flex gap-2 items-center">
        <Button variant="secondary" type="submit" name="action" value="draft">
          Save as draft
        </Button>
        <Button variant="primary" type="submit" name="action" value="approve">
          Save & approve
        </Button>
        <ButtonLink variant="ghost" href="/bills">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
