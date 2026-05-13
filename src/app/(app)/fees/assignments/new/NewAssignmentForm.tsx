"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/MoneyInput";
import {
  createAssignmentAction,
  type CreateAssignmentState,
} from "./actions";
import type { Customer, Entity, FeeSchedule } from "@/lib/types";

const initial: CreateAssignmentState = { error: null };

export function NewAssignmentForm({
  entities,
  customers,
  schedules,
  defaultEntityId,
}: {
  entities: Entity[];
  customers: Customer[];
  schedules: FeeSchedule[];
  defaultEntityId?: string;
}) {
  const [state, action] = useActionState(createAssignmentAction, initial);
  const [entityId, setEntityId] = useState(defaultEntityId ?? entities[0]?.id ?? "");
  const customerById = new Map(customers.map((c) => [c.id, c] as const));

  const selectedEntity = useMemo(
    () => entities.find((e) => e.id === entityId),
    [entityId, entities],
  );

  // Suggest matching schedules for the selected entity's kind
  const matchingSchedules = useMemo(() => {
    if (!selectedEntity) return [];
    return schedules.filter(
      (s) => s.entityKind === selectedEntity.kind && s.isActive,
    );
  }, [selectedEntity, schedules]);

  const [scheduleId, setScheduleId] = useState("");
  const selectedSchedule = matchingSchedules.find((s) => s.id === scheduleId);

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

        <Card title="Assign fee to entity">
          <div className="flex flex-col gap-3">
            <Row>
              <SelectField
                label="Entity"
                name="entityId"
                required
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
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
                label="Billing year"
                name="billingYear"
                required
                type="number"
                mono
                defaultValue={String(new Date().getFullYear())}
              />
            </Row>
            <Row>
              <SelectField
                label="Apply schedule (optional)"
                name="feeScheduleId"
                value={scheduleId}
                onChange={(e) => setScheduleId(e.target.value)}
              >
                <option value="">Custom (no template)</option>
                {matchingSchedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — ${parseFloat(s.annualFee).toLocaleString()}/yr,{" "}
                    {parseFloat(s.includedHours).toFixed(0)} hrs
                  </option>
                ))}
              </SelectField>
              <SelectField label="Status" name="status" defaultValue="draft">
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="billed">Billed</option>
                <option value="paid">Paid</option>
                <option value="void">Void</option>
              </SelectField>
            </Row>
            <Row>
              <MoneyInput
                label="Annual fee"
                name="annualFee"
                required
                key={`fee-${scheduleId}`}
                defaultValue={selectedSchedule?.annualFee ?? ""}
              />
              <Field
                label="Included hours"
                name="includedHours"
                required
                mono
                inputMode="decimal"
                key={`hrs-${scheduleId}`}
                defaultValue={selectedSchedule?.includedHours ?? ""}
              />
            </Row>
            <TextareaField label="Notes" name="notes" />
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Link
            href="/fees"
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
            Create assignment
          </Button>
        </div>
      </div>
    </form>
  );
}
