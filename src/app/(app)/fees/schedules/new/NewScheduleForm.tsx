"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { createScheduleAction, type CreateScheduleState } from "./actions";

const initial: CreateScheduleState = { error: null };

const KIND_OPTIONS = [
  { value: "llc", label: "LLC" },
  { value: "trust", label: "Trust" },
  { value: "scorp", label: "S-Corp" },
  { value: "ccorp", label: "C-Corp" },
  { value: "partnership", label: "Partnership" },
  { value: "foundation", label: "Foundation" },
  { value: "individual", label: "Individual" },
  { value: "other", label: "Other" },
];

export function NewScheduleForm() {
  const [state, action] = useActionState(createScheduleAction, initial);
  const currentYear = new Date().getFullYear();

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

        <Card title="Schedule details">
          <div className="flex flex-col gap-3">
            <Row>
              <Field
                label="Name"
                name="name"
                required
                placeholder="LLC Standard — 2027"
              />
              <SelectField
                label="Entity kind"
                name="entityKind"
                required
                defaultValue="llc"
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </SelectField>
            </Row>
            <Row>
              <MoneyInput
                label="Annual fee"
                name="annualFee"
                required
                placeholder="0.00"
              />
              <Field
                label="Included hours"
                name="includedHours"
                required
                mono
                inputMode="decimal"
                placeholder="0"
              />
            </Row>
            <Row>
              <Field
                label="Applicable year"
                name="applicableYear"
                mono
                type="number"
                defaultValue={String(currentYear)}
                placeholder={String(currentYear)}
              />
              <div />
            </Row>
            <TextareaField label="Notes" name="notes" />
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Link
            href="/fees?tab=schedules"
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
            Create schedule
          </Button>
        </div>
      </div>
    </form>
  );
}
