"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, SelectField } from "@/components/ui/Field";
import {
  createBankAccountAction,
  type CreateBankState,
} from "./actions";
import type { Account, Customer, Entity } from "@/lib/types";

const initial: CreateBankState = { error: null };

export function NewBankAccountForm({
  glAccounts,
  entities,
  customers,
}: {
  glAccounts: Account[];
  entities: Entity[];
  customers: Customer[];
}) {
  const [state, action] = useActionState(createBankAccountAction, initial);

  // Filter GL to cash-class accounts (sub_type=current_asset) — best-effort UX hint
  const cashAccounts = glAccounts.filter(
    (a) => a.accountType === "asset" && a.code.startsWith("1"),
  );

  return (
    <form action={action}>
      <div className="px-6 my-3.5 flex flex-col gap-3.5">
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

        <Card title="Account details">
          <div className="flex flex-col gap-3">
            <Row>
              <Field
                label="Account name"
                name="name"
                required
                placeholder="Operating, Trust, Reserve, etc."
              />
              <SelectField label="GL account" name="accountId" required defaultValue="">
                <option value="" disabled>
                  Select GL account…
                </option>
                {cashAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </SelectField>
            </Row>
            <Row>
              <Field
                label="Institution"
                name="institution"
                placeholder="JPMorgan Private Bank"
              />
              <Field
                label="Last 4 of account number"
                name="lastFour"
                mono
                maxLength={4}
                placeholder="0000"
              />
            </Row>
            <Row>
              <Field
                label="Currency"
                name="currencyCode"
                mono
                defaultValue="USD"
                maxLength={3}
              />
              <Field
                label="Current balance"
                name="currentBalance"
                mono
                inputMode="decimal"
                placeholder="0.00"
              />
            </Row>
            <Row>
              <Field label="Balance as-of date" name="balanceAsOf" type="date" />
              <SelectField label="Entity (optional)" name="entityId" defaultValue="">
                <option value="">Internal / unassigned</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} — {e.name}
                  </option>
                ))}
              </SelectField>
            </Row>
            <Row>
              <SelectField
                label="Client (optional)"
                name="clientId"
                defaultValue=""
              >
                <option value="">Internal / inherit from entity</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
              <div />
            </Row>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Link
            href="/bank"
            className="px-3 py-1.5 text-[13px] rounded-md"
            style={{
              border: "1px solid var(--line-2)",
              color: "var(--ink-2)",
              textDecoration: "none",
            }}
          >
            Cancel
          </Link>
          <Button variant="primary" type="submit">
            Create bank account
          </Button>
        </div>
      </div>
    </form>
  );
}
