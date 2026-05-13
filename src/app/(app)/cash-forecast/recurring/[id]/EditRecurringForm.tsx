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
import { parseAmount } from "@/lib/money";
import type {
  Account,
  BankAccount,
  RecurringPayment,
  Vendor,
} from "@/lib/types";

import {
  deleteRecurringAction,
  updateRecurringAction,
  type UpdateRecurringState,
} from "./actions";

const INITIAL_STATE: UpdateRecurringState = {};

export function EditRecurringForm({
  payment,
  expenseAccounts,
  vendors,
  bankAccounts,
}: {
  payment: RecurringPayment;
  expenseAccounts: Account[];
  vendors: Vendor[];
  bankAccounts: BankAccount[];
}) {
  const [state, formAction] = useFormState(
    updateRecurringAction,
    INITIAL_STATE,
  );

  return (
    <>
      <form
        action={formAction}
        className="flex flex-col gap-3.5"
      >
        <input type="hidden" name="id" value={payment.id} />
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
                defaultValue={payment.name}
              />
              <Field
                label="Amount"
                name="amount"
                type="number"
                step="0.01"
                min="0"
                required
                mono
                defaultValue={parseAmount(payment.amount).toFixed(2)}
              />
            </Row>
            <Row>
              <SelectField
                label="Frequency"
                name="frequency"
                required
                defaultValue={payment.frequency}
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
                defaultValue={payment.nextPaymentDate}
              />
            </Row>
            <Row>
              <SelectField
                label="Expense account"
                name="expenseAccountId"
                required
                defaultValue={payment.expenseAccountId}
              >
                <option value="">— Select expense account —</option>
                {expenseAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Vendor"
                name="vendorId"
                defaultValue={payment.vendorId ?? ""}
              >
                <option value="">— None —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.code} — {v.name}
                  </option>
                ))}
              </SelectField>
            </Row>
            <Row>
              <SelectField
                label="Bank account"
                name="bankAccountId"
                defaultValue={payment.bankAccountId ?? ""}
              >
                <option value="">— Default —</option>
                {bankAccounts.map((b) => {
                  const suffix = [
                    b.institution,
                    b.lastFour ? `••${b.lastFour}` : null,
                  ]
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
              <label className="flex flex-col gap-1">
                <span
                  className="text-[11.5px]"
                  style={{ color: "var(--ink-3)" }}
                >
                  Status
                </span>
                <label className="flex items-center gap-2 px-2.5 py-1.5 text-[13px]">
                  <input
                    type="checkbox"
                    name="isActive"
                    value="1"
                    defaultChecked={payment.isActive}
                  />
                  <span>Active</span>
                </label>
              </label>
            </Row>
            <TextareaField
              label="Notes"
              name="notes"
              defaultValue={payment.notes ?? ""}
              placeholder="Optional notes"
            />
          </div>
        </Card>

        <div className="flex gap-2 items-center">
          <Button variant="primary" type="submit" name="action" value="save">
            Save
          </Button>
          <Button
            variant="secondary"
            type="submit"
            name="action"
            value="deactivate"
            disabled={!payment.isActive}
          >
            Deactivate
          </Button>
          <ButtonLink variant="ghost" href="/cash-forecast/recurring">
            Cancel
          </ButtonLink>
        </div>
      </form>

      <form
        action={deleteRecurringAction}
        onSubmit={(e) => {
          if (
            !window.confirm(
              "Delete this recurring payment? This cannot be undone.",
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={payment.id} />
        <Button variant="danger" type="submit">
          Delete recurring payment
        </Button>
      </form>
    </>
  );
}
