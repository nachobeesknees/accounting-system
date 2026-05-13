"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import {
  createPriceListAction,
  type CreatePriceListState,
} from "./actions";
import type { Office } from "@/lib/types";

const initial: CreatePriceListState = { error: null };

export function NewPriceListForm({ offices }: { offices: Office[] }) {
  const [state, action] = useActionState(createPriceListAction, initial);
  const today = new Date().toISOString().slice(0, 10);

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
        <Card title="Price list details">
          <div className="flex flex-col gap-3">
            <Row>
              <SelectField label="Office" name="officeId" required defaultValue="">
                <option value="" disabled>
                  Select office…
                </option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} — {o.name}
                  </option>
                ))}
              </SelectField>
              <Field
                label="Name"
                name="name"
                required
                placeholder="Office SF — 2027 Standard"
              />
            </Row>
            <Row>
              <Field
                label="Effective date"
                name="effectiveDate"
                type="date"
                required
                defaultValue={today}
              />
              <Field label="Version" name="versionNumber" mono type="number" defaultValue="1" />
            </Row>
            <Row>
              <label className="flex items-end gap-2 text-[13px]">
                <input type="checkbox" name="isCurrent" />
                <span style={{ color: "var(--ink-2)" }}>
                  Make current for this office (deactivates the previous current)
                </span>
              </label>
              <div />
            </Row>
            <TextareaField label="Notes" name="notes" />
          </div>
        </Card>
        <div className="flex justify-end gap-2">
          <Link
            href="/price-lists"
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
            Create price list
          </Button>
        </div>
      </div>
    </form>
  );
}
