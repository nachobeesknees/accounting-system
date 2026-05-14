"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, Row, TextareaField } from "@/components/ui/Field";
import { SmartSelectField } from "@/components/ui/SmartSelect";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { formatMoney, parseAmount } from "@/lib/money";
import type { Customer, Entity, EntityFee } from "@/lib/types";
import { generateInvoiceAction, type GenerateState } from "./actions";

export type AddonOption = {
  key: string;
  label: string;
  /** Numeric string from price list entry */
  unitPrice: string;
};

type AddonRowState = {
  enabled: boolean;
  quantity: string;
};

const INITIAL_STATE: GenerateState = { error: undefined };

export function GenerateInvoiceForm({
  customers,
  customerEntities,
  feesByEntity,
  addonOptions,
  preselectedCustomer,
  today,
  dueDefault,
  defaultBillingYear,
}: {
  customers: Customer[];
  customerEntities: Record<string, Entity[]>;
  feesByEntity: Record<string, EntityFee[]>;
  addonOptions: AddonOption[];
  preselectedCustomer: string;
  today: string;
  dueDefault: string;
  defaultBillingYear: number;
}) {
  const [state, formAction] = useFormState(
    generateInvoiceAction,
    INITIAL_STATE,
  );

  const [customerId, setCustomerId] = useState<string>(preselectedCustomer);
  const [billingYearStr, setBillingYearStr] = useState<string>(
    String(defaultBillingYear),
  );
  const [addonState, setAddonState] = useState<Record<string, AddonRowState>>(
    () => {
      const initial: Record<string, AddonRowState> = {};
      for (const opt of addonOptions) {
        initial[opt.key] = { enabled: false, quantity: "1" };
      }
      return initial;
    },
  );

  const billingYear = parseInt(billingYearStr, 10);

  // Entity-fee preview rows for current customer + year.
  const previewRows = useMemo(() => {
    if (!customerId) return [];
    const ents = customerEntities[customerId] ?? [];
    const rows: { entity: Entity; fee: EntityFee }[] = [];
    for (const ent of ents) {
      const fees = feesByEntity[ent.id] ?? [];
      for (const fee of fees) {
        if (fee.billingYear !== billingYear) continue;
        if (parseAmount(fee.annualFee) <= 0) continue;
        rows.push({ entity: ent, fee });
      }
    }
    return rows;
  }, [customerId, billingYear, customerEntities, feesByEntity]);

  const feesTotal = useMemo(
    () => previewRows.reduce((s, r) => s + parseAmount(r.fee.annualFee), 0),
    [previewRows],
  );

  const addonsTotal = useMemo(() => {
    let sum = 0;
    for (const opt of addonOptions) {
      const row = addonState[opt.key];
      if (!row?.enabled) continue;
      const qty = parseAmount(row.quantity);
      if (qty <= 0) continue;
      sum += qty * parseAmount(opt.unitPrice);
    }
    return sum;
  }, [addonOptions, addonState]);

  const grandTotal = feesTotal + addonsTotal;

  function updateAddon(key: string, patch: Partial<AddonRowState>) {
    setAddonState((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? { enabled: false, quantity: "1" }), ...patch },
    }));
  }

  const hasCustomer = customerId !== "";

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
            <SmartSelectField
              label="Customer"
              name="customerId"
              required
              value={customerId}
              onChange={setCustomerId}
              options={customers.map((c) => ({
                value: c.id,
                label: `${c.code} — ${c.name}`,
                search: c.code,
              }))}
              emptyLabel="Select customer…"
            />
            <Field
              label="Billing year"
              name="billingYear"
              type="number"
              required
              min={2000}
              max={2100}
              step={1}
              value={billingYearStr}
              onChange={(e) => setBillingYearStr(e.target.value)}
            />
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

      <Card title="Annual fees for this client">
        {!hasCustomer ? (
          <Empty
            title="Select a customer"
            body="Pick a customer above to preview their billable annual entity fees."
          />
        ) : previewRows.length === 0 ? (
          <Empty
            title={`No entity fees for ${Number.isFinite(billingYear) ? billingYear : "this year"}`}
            body="Use Fees → Annual fee assignments to add fees for this client's entities first."
          />
        ) : (
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Entity</TH>
                <TH num>Billing year</TH>
                <TH num>Fee</TH>
              </TR>
            </THead>
            <TBody>
              {previewRows.map(({ entity, fee }) => (
                <TR key={fee.id} hover={false}>
                  <TD>
                    <span style={{ color: "var(--ink)" }}>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          color: "var(--ink-3)",
                          marginRight: 8,
                        }}
                      >
                        {entity.code}
                      </span>
                      {entity.name}
                    </span>
                  </TD>
                  <TD num>{fee.billingYear}</TD>
                  <TD num>{formatMoney(fee.annualFee, "USD")}</TD>
                </TR>
              ))}
              <TR total hover={false}>
                <TD>Total fees</TD>
                <TD>{""}</TD>
                <TD num>{formatMoney(feesTotal, "USD")}</TD>
              </TR>
            </TBody>
          </Table>
        )}
      </Card>

      <Card title="Optional add-on charges">
        {addonOptions.length === 0 ? (
          <Empty
            title="No service items in the current price list"
            body="Add service-type entries to the active price list to make them available here."
          />
        ) : (
          <Table>
            <THead>
              <TR hover={false}>
                <TH style={{ width: 40 }}>{""}</TH>
                <TH>Charge</TH>
                <TH num>Unit price</TH>
                <TH num>Qty</TH>
                <TH num>Amount</TH>
              </TR>
            </THead>
            <TBody>
              {addonOptions.map((opt) => {
                const row = addonState[opt.key] ?? {
                  enabled: false,
                  quantity: "1",
                };
                const unit = parseAmount(opt.unitPrice);
                const qty = parseAmount(row.quantity);
                const amount = row.enabled && qty > 0 ? unit * qty : 0;
                return (
                  <TR key={opt.key} hover={false}>
                    <TD>
                      <input
                        type="checkbox"
                        name={`addons[${opt.key}][enabled]`}
                        checked={row.enabled}
                        onChange={(e) =>
                          updateAddon(opt.key, { enabled: e.target.checked })
                        }
                        aria-label={`Include ${opt.label}`}
                      />
                      {/* Always emit the label & unit price so the server
                          gets them even if React's controlled checkbox
                          changes order. */}
                      <input
                        type="hidden"
                        name={`addons[${opt.key}][label]`}
                        value={opt.label}
                      />
                      <input
                        type="hidden"
                        name={`addons[${opt.key}][unit_price]`}
                        value={opt.unitPrice}
                      />
                    </TD>
                    <TD>{opt.label}</TD>
                    <TD num>{formatMoney(unit, "USD")}</TD>
                    <TD num>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        name={`addons[${opt.key}][quantity]`}
                        value={row.quantity}
                        onChange={(e) =>
                          updateAddon(opt.key, { quantity: e.target.value })
                        }
                        disabled={!row.enabled}
                        className="px-2 py-1 text-[12.5px] rounded-md outline-none text-right w-20"
                        style={{
                          background: "var(--paper)",
                          border: "1px solid var(--line-2)",
                          color: "var(--ink)",
                          fontFamily: "var(--font-mono)",
                          fontVariantNumeric: "tabular-nums",
                          opacity: row.enabled ? 1 : 0.5,
                        }}
                      />
                    </TD>
                    <TD num>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontVariantNumeric: "tabular-nums",
                          color: row.enabled ? "var(--ink-2)" : "var(--ink-4)",
                        }}
                      >
                        {formatMoney(amount, "USD")}
                      </span>
                    </TD>
                  </TR>
                );
              })}
              <TR total hover={false}>
                <TD>{""}</TD>
                <TD>Add-ons total</TD>
                <TD>{""}</TD>
                <TD>{""}</TD>
                <TD num>{formatMoney(addonsTotal, "USD")}</TD>
              </TR>
            </TBody>
          </Table>
        )}
      </Card>

      <Card title="Totals">
        <Table>
          <TBody>
            <TR hover={false}>
              <TD>Annual fees total</TD>
              <TD num>{formatMoney(feesTotal, "USD")}</TD>
            </TR>
            <TR hover={false}>
              <TD>Add-ons total</TD>
              <TD num>{formatMoney(addonsTotal, "USD")}</TD>
            </TR>
            <TR total hover={false}>
              <TD>Grand total</TD>
              <TD num>{formatMoney(grandTotal, "USD")}</TD>
            </TR>
          </TBody>
        </Table>
      </Card>

      <div className="flex gap-2 items-center">
        <Button variant="primary" type="submit" name="action" value="submit">
          Save & submit for CFO approval
        </Button>
        <Button variant="secondary" type="submit" name="action" value="draft">
          Save draft
        </Button>
        <ButtonLink variant="ghost" href="/invoices">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
