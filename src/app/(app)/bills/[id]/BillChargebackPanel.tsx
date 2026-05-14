"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { formatMoney, parseAmount } from "@/lib/money";
import type { Bill, BillChargebackType, Customer, Entity } from "@/lib/types";

import { setBillChargebackAction } from "./actions";

type Recipient = "none" | "client" | "entity";

function deriveRecipient(bill: Bill): Recipient {
  if (bill.chargebackEntityId) return "entity";
  if (bill.chargebackClientId) return "client";
  return "none";
}

function deriveMethod(bill: Bill): BillChargebackType {
  return bill.chargebackType ?? "cost";
}

function deriveMarkupInput(bill: Bill): string {
  // Stored as decimal (0.15) — display to user as percent (15).
  if (!bill.markupPct) return "";
  const pct = parseFloat(bill.markupPct) * 100;
  if (!Number.isFinite(pct)) return "";
  // Drop trailing zeros so "15.00" → "15".
  return pct.toString();
}

export function BillChargebackPanel({
  bill,
  total,
  customers,
  entities,
}: {
  bill: Bill;
  total: number;
  customers: Customer[];
  entities: Entity[];
}) {
  const [recipient, setRecipient] = useState<Recipient>(deriveRecipient(bill));
  const [method, setMethod] = useState<BillChargebackType>(deriveMethod(bill));
  const [markupPct, setMarkupPct] = useState<string>(deriveMarkupInput(bill));
  const [rebillAmount, setRebillAmount] = useState<string>(
    bill.rebillAmount ?? "",
  );

  const customerById = useMemo(
    () => new Map(customers.map((c) => [c.id, c] as const)),
    [customers],
  );

  const previewRebill = useMemo<string | null>(() => {
    if (recipient === "none") return null;
    switch (method) {
      case "cost":
        return `At cost: ${formatMoney(total, "USD", { paren: true , compact: true })}`;
      case "markup": {
        const pct = parseAmount(markupPct);
        const amt = Math.round(total * (1 + pct / 100) * 100) / 100;
        return `With ${pct || 0}% markup: ${formatMoney(amt, "USD", { paren: true , compact: true })}`;
      }
      case "fixed": {
        const amt = parseAmount(rebillAmount);
        return `Fixed: ${formatMoney(amt, "USD", { paren: true , compact: true })}`;
      }
      case "included":
        return "Included in annual fee — no separate invoice will be generated.";
      default:
        return null;
    }
  }, [recipient, method, total, markupPct, rebillAmount]);

  return (
    <form action={setBillChargebackAction} className="p-3.5">
      <input type="hidden" name="billId" value={bill.id} />
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
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
              defaultValue={bill.chargebackClientId ?? ""}
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
              defaultValue={bill.chargebackEntityId ?? ""}
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
                      checked={method === val}
                      onChange={() => setMethod(val)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {method === "markup" && (
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

            {method === "fixed" && (
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
              defaultValue={bill.chargebackNotes ?? ""}
            />
          </>
        )}

        <div className="flex gap-2 justify-end">
          {bill.chargebackType && (
            <Button
              type="submit"
              variant="secondary"
              name="intent"
              value="clear"
            >
              Clear chargeback
            </Button>
          )}
          <Button type="submit" variant="primary" name="intent" value="save">
            Save chargeback
          </Button>
        </div>
      </div>
    </form>
  );
}
