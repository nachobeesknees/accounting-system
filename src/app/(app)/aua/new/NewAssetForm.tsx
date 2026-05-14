"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { SmartSelectField } from "@/components/ui/SmartSelect";
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
  // When the user arrived from an entity page (?entity=...), the entity is
  // mandatory and locked — assets are entity-scoped. Without that param the
  // selector is shown but still required.
  const fromEntity = !!defaultEntityId;
  const lockedEntity = fromEntity
    ? entities.find((e) => e.id === defaultEntityId)
    : undefined;
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

        {fromEntity && lockedEntity && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            Creating asset inside entity{" "}
            <strong>
              {lockedEntity.code} — {lockedEntity.name}
            </strong>
            .
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
              {fromEntity && lockedEntity ? (
                <div className="flex flex-col gap-1">
                  <span
                    className="text-[11.5px]"
                    style={{ color: "var(--ink-3)" }}
                  >
                    Entity
                  </span>
                  <div
                    className="px-2.5 py-1.5 text-[13px] rounded-md"
                    style={{
                      background: "var(--raised)",
                      border: "1px solid var(--line-2)",
                      color: "var(--ink-2)",
                    }}
                  >
                    {lockedEntity.code} — {lockedEntity.name}
                  </div>
                  <input
                    type="hidden"
                    name="entityId"
                    value={lockedEntity.id}
                  />
                </div>
              ) : (
                <SmartSelectField
                  label="Entity"
                  name="entityId"
                  required
                  defaultValue=""
                  options={entities.map((e) => {
                    const c = customerById.get(e.clientId);
                    return {
                      value: e.id,
                      label: `${e.code} — ${e.name}${c ? ` (${c.name})` : ""}`,
                      search: e.code,
                    };
                  })}
                  emptyLabel="Select entity…"
                />
              )}
              <Field
                label="Valuation date"
                name="valuationDate"
                type="date"
                defaultValue={today}
                help="The date this asset's current carrying value is as-of. Drives the AUA report."
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
                label="External reference"
                name="externalRef"
                placeholder="Account or parcel ID"
                mono
              />
            </Row>
            <Row>
              <Field label="Acquired date" name="acquiredDate" type="date" />
              <div />
            </Row>
            <TextareaField label="Notes" name="notes" placeholder="Optional notes" />
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Link
            href={
              fromEntity && lockedEntity
                ? `/entities/${lockedEntity.id}`
                : "/entities"
            }
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
