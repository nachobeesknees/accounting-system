"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { SmartSelectField } from "@/components/ui/SmartSelect";
import { createEntityAction, type CreateEntityState } from "./actions";
import type { Currency, Customer, Region, RegionGroup } from "@/lib/types";

const initial: CreateEntityState = { error: null };

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

export function NewEntityForm({
  customers,
  currencies,
  regions,
  regionGroups,
  nextCode,
  defaultClientId,
  defaultCurrency,
}: {
  customers: Customer[];
  currencies: Currency[];
  regions: Region[];
  regionGroups: RegionGroup[];
  nextCode: string;
  defaultClientId?: string;
  defaultCurrency: string;
}) {
  const [state, action] = useActionState(createEntityAction, initial);
  const groupById = new Map(regionGroups.map((g) => [g.id, g.name] as const));

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

        <Card title="Entity details">
          <div className="flex flex-col gap-3">
            <Row>
              <Field
                label="Code"
                name="code"
                required
                mono
                defaultValue={nextCode}
                placeholder="ENT-011"
              />
              <Field label="Name" name="name" required placeholder="Acme Holdings LLC" />
            </Row>
            <Row>
              <SmartSelectField
                label="Client"
                name="clientId"
                required
                defaultValue={defaultClientId ?? ""}
                options={customers.map((c) => ({
                  value: c.id,
                  label: c.name,
                  search: c.code,
                }))}
                emptyLabel="Select client…"
              />
              <SelectField label="Kind" name="kind" required defaultValue="llc">
                {KIND_OPTIONS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </SelectField>
            </Row>
            <Row>
              <Field
                label="Jurisdiction"
                name="jurisdiction"
                placeholder="Delaware, USA"
              />
              <Field label="Formation date" name="formationDate" type="date" />
            </Row>
            <Row>
              <Field
                label="EIN"
                name="ein"
                mono
                placeholder="00-0000000"
                pattern="\d{2}-?\d{7}"
                help="Federal EIN — 9 digits, with or without a dash."
              />
              <Field
                label="Registration #"
                name="registrationNumber"
                mono
                placeholder="Corporate filing #"
                help="State filing number — e.g. Delaware corp ID."
              />
            </Row>
            <Row>
              <SelectField label="Status" name="status" defaultValue="active">
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="dormant">Dormant</option>
                <option value="dissolved">Dissolved</option>
              </SelectField>
            </Row>
            <Row>
              <SmartSelectField
                label="Functional currency"
                name="currencyCode"
                defaultValue={defaultCurrency}
                options={currencies
                  .filter((c) => c.isActive)
                  .map((c) => ({
                    value: c.code,
                    label: `${c.code} — ${c.name}`,
                    search: c.code,
                  }))}
              />
              <Field
                label="Ownership %"
                name="ownershipPercent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="100"
                help="Client's beneficial ownership (0–100). Leave blank if unspecified."
              />
            </Row>
            <Row>
              <SmartSelectField
                label="Region"
                name="regionId"
                defaultValue=""
                options={regions.map((r) => ({
                  value: r.id,
                  label: r.name,
                  group: r.groupId ? groupById.get(r.groupId) : undefined,
                }))}
                emptyLabel="— None —"
                clearable
              />
              <div />
            </Row>
            <TextareaField label="Notes" name="notes" placeholder="Optional notes" />
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Link
            href="/entities"
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
            Create entity
          </Button>
        </div>
      </div>
    </form>
  );
}
