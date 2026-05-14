"use client";

import { useFormState } from "react-dom";

import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  Field,
  Row,
  SelectField,
  TextareaField,
} from "@/components/ui/Field";
import { SmartSelectField } from "@/components/ui/SmartSelect";
import { MoneyInput } from "@/components/ui/MoneyInput";
import type { Account, BankAccount, Vendor } from "@/lib/types";

import {
  createRecurringAction,
  type CreateRecurringState,
} from "./actions";

const INITIAL_STATE: CreateRecurringState = {};

export function NewRecurringForm({
  expenseAccounts,
  vendors,
  bankAccounts,
  defaultNextPaymentDate,
}: {
  expenseAccounts: Account[];
  vendors: Vendor[];
  bankAccounts: BankAccount[];
  defaultNextPaymentDate: string;
}) {
  const [state, formAction] = useFormState(
    createRecurringAction,
    INITIAL_STATE,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3.5 px-6 py-3.5 pb-8"
    >
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

      <Card title="Details" bodyPadding>
        <div className="flex flex-col gap-3">
          <Row>
            <Field
              label="Name"
              name="name"
              required
              placeholder="e.g. Office rent"
            />
            <MoneyInput
              label="Amount"
              name="amount"
              required
              placeholder="0.00"
            />
          </Row>
          <Row>
            <SelectField
              label="Frequency"
              name="frequency"
              required
              defaultValue="monthly"
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="semiannual">Semi-annual</option>
              <option value="annual">Annual</option>
            </SelectField>
            <Field
              label="Next payment date"
              name="nextPaymentDate"
              type="date"
              required
              defaultValue={defaultNextPaymentDate}
            />
          </Row>
          <Row>
            <SmartSelectField
              label="Expense account"
              name="expenseAccountId"
              required
              options={expenseAccounts.map((a) => ({
                value: a.id,
                label: `${a.code} — ${a.name}`,
                search: a.code,
              }))}
              emptyLabel="— Select expense account —"
            />
            <SmartSelectField
              label="Vendor"
              name="vendorId"
              options={vendors.map((v) => ({
                value: v.id,
                label: `${v.code} — ${v.name}`,
                search: v.code,
              }))}
              emptyLabel="— None —"
              clearable
            />
          </Row>
          <Row>
            <SmartSelectField
              label="Bank account"
              name="bankAccountId"
              options={bankAccounts.map((b) => {
                const suffix = [
                  b.institution,
                  b.lastFour ? `••${b.lastFour}` : null,
                ]
                  .filter(Boolean)
                  .join(" ");
                return {
                  value: b.id,
                  label: suffix ? `${b.name} — ${suffix}` : b.name,
                  search: b.lastFour ?? undefined,
                };
              })}
              emptyLabel="— Default —"
              clearable
            />
            <div />
          </Row>
          <TextareaField
            label="Notes"
            name="notes"
            placeholder="Optional notes"
          />
        </div>
      </Card>

      <div className="flex gap-2 items-center">
        <Button variant="primary" type="submit">
          Save
        </Button>
        <ButtonLink variant="ghost" href="/cash-forecast/recurring">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
