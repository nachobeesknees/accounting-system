"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { createAssetAction, type CreateAssetState } from "./actions";
import type { Customer, Entity } from "@/lib/types";

const initial: CreateAssetState = { error: null };

const KIND_OPTIONS = [
  { value: "real_estate", label: "Real Estate" },
  { value: "securities", label: "Securities" },
  { value: "cash", label: "Cash" },
  { value: "private_equity", label: "Private Equity" },
  { value: "art", label: "Art" },
  { value: "vehicle", label: "Vehicle" },
  { value: "business_interest", label: "Business Interest" },
  { value: "intellectual_property", label: "Intellectual Property" },
  { value: "other", label: "Other" },
];

export function NewAssetForm({
  entities,
  customers,
  defaultEntityId,
}: {
  entities: Entity[];
  customers: Customer[];
  defaultEntityId?: string;
}) {
  const [state, action] = useActionState(createAssetAction, initial);
  const customerById = new Map(customers.map((c) => [c.id, c] as const));

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

        <Card title="Asset details">
          <div className="flex flex-col gap-3">
            <Row>
              <Field
                label="Name"
                name="name"
                required
                placeholder="401 Pine Tower (Seattle)"
              />
              <SelectField label="Kind" name="kind" required defaultValue="real_estate">
                {KIND_OPTIONS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </SelectField>
            </Row>
            <Row>
              <SelectField
                label="Entity"
                name="entityId"
                required
                defaultValue={defaultEntityId ?? ""}
              >
                <option value="" disabled>
                  Select entity…
                </option>
                {entities.map((e) => {
                  const c = customerById.get(e.clientId);
                  return (
                    <option key={e.id} value={e.id}>
                      {e.code} — {e.name}
                      {c ? ` (${c.name})` : ""}
                    </option>
                  );
                })}
              </SelectField>
              <Field
                label="Currency"
                name="currencyCode"
                mono
                defaultValue="USD"
                maxLength={3}
              />
            </Row>
            <Row>
              <Field
                label="External reference"
                name="externalRef"
                placeholder="Account or parcel ID"
                mono
              />
              <Field label="Acquired date" name="acquiredDate" type="date" />
            </Row>
            <TextareaField label="Notes" name="notes" placeholder="Optional notes" />
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Link
            href="/aua"
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
            Create asset
          </Button>
        </div>
      </div>
    </form>
  );
}
