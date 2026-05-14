"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, TextareaField } from "@/components/ui/Field";
import { SmartSelectField } from "@/components/ui/SmartSelect";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { createTimeEntryAction, type CreateTimeState } from "./actions";
import type {
  Customer,
  EmployeeRate,
  Entity,
  EntityFee,
  FeeFrequency,
  User,
} from "@/lib/types";

function frequencyShortLabel(f: FeeFrequency | undefined | null): string {
  switch (f) {
    case "monthly":
      return "monthly";
    case "quarterly":
      return "quarterly";
    case "semiannual":
      return "semi-annual";
    case "one_time":
      return "one-time";
    case "annual":
    default:
      return "annual";
  }
}

const initial: CreateTimeState = { error: null };

export function NewTimeForm({
  users,
  rates,
  customers,
  entities,
  feesByEntityId,
  currentUserId,
}: {
  users: User[];
  rates: EmployeeRate[];
  customers: Customer[];
  entities: Entity[];
  feesByEntityId: Record<string, EntityFee[]>;
  currentUserId: string;
}) {
  const [state, action] = useActionState(createTimeEntryAction, initial);
  const today = new Date().toISOString().slice(0, 10);

  const [userId, setUserId] = useState(currentUserId);
  const [clientId, setClientId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [entityFeeId, setEntityFeeId] = useState("");

  const defaultRate = useMemo(() => {
    const r = rates.find((r) => r.userId === userId && r.isDefault);
    return r ? r.billableRate : "";
  }, [userId, rates]);

  const filteredEntities = useMemo(() => {
    if (!clientId) return entities;
    return entities.filter((e) => e.clientId === clientId);
  }, [clientId, entities]);

  const entityFees = useMemo(() => {
    if (!entityId) return [];
    return feesByEntityId[entityId] ?? [];
  }, [entityId, feesByEntityId]);

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

        <Card title="Log time">
          <div className="flex flex-col gap-3">
            <Row>
              <Field label="Date" name="entryDate" type="date" required defaultValue={today} />
              <Field
                label="Duration (hours)"
                name="durationHours"
                required
                mono
                inputMode="decimal"
                placeholder="1.50"
              />
            </Row>
            <Row>
              <SmartSelectField
                label="User"
                name="userId"
                required
                value={userId}
                onChange={setUserId}
                options={users.map((u) => ({
                  value: u.id,
                  label: `${u.fullName} (${u.role})`,
                  search: u.email,
                }))}
              />
              <MoneyInput
                label="Rate (per hr)"
                name="rateAtLog"
                key={`rate-${userId}-${defaultRate}`}
                defaultValue={defaultRate}
              />
            </Row>
            <TextareaField
              label="Description"
              name="description"
              required
              placeholder="What was the work?"
            />
            <Row>
              <SmartSelectField
                label="Client"
                name="clientId"
                value={clientId}
                onChange={setClientId}
                options={customers.map((c) => ({
                  value: c.id,
                  label: c.name,
                  search: c.code,
                }))}
                emptyLabel="— None / internal —"
                clearable
              />
              <SmartSelectField
                label="Entity"
                name="entityId"
                value={entityId}
                onChange={(v) => {
                  setEntityId(v);
                  setEntityFeeId("");
                }}
                options={filteredEntities.map((e) => ({
                  value: e.id,
                  label: `${e.code} — ${e.name}`,
                  search: e.code,
                }))}
                emptyLabel="— None —"
                clearable
              />
            </Row>
            {entityId && entityFees.length > 0 && (
              <Row>
                <SmartSelectField
                  label="Service (optional)"
                  name="entityFeeId"
                  value={entityFeeId}
                  onChange={setEntityFeeId}
                  options={entityFees.map((f) => ({
                    value: f.id,
                    label: `${f.billingYear} · ${frequencyShortLabel(f.frequency)} · $${f.annualFee}/yr`,
                  }))}
                  emptyLabel="— No specific service —"
                  clearable
                />
                <div />
              </Row>
            )}
            <Row>
              <Field label="Task type" name="taskType" placeholder="Bookkeeping, Tax, Advisory…" />
              <label className="flex items-end gap-2 text-[13px]">
                <input type="checkbox" name="isBillable" defaultChecked />
                <span style={{ color: "var(--ink-2)" }}>Billable</span>
              </label>
            </Row>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Link
            href="/time"
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
            Save entry
          </Button>
        </div>
      </div>
    </form>
  );
}
