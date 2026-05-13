import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import {
  getCustomers,
  getEntities,
  getEntityFeeById,
  getFeeSchedules,
} from "@/lib/data";
import {
  deleteAssignmentAction,
  updateAssignmentAction,
} from "./actions";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const fee = await getEntityFeeById(id);
  if (!fee) notFound();

  const [entities, customers, schedules] = await Promise.all([
    getEntities(),
    getCustomers(),
    getFeeSchedules(),
  ]);
  const customerById = new Map(customers.map((c) => [c.id, c] as const));
  const entity = entities.find((e) => e.id === fee.entityId);
  const client = entity ? customerById.get(entity.clientId) : undefined;
  const matchingSchedules = entity
    ? schedules.filter((s) => s.entityKind === entity.kind)
    : schedules;

  return (
    <>
      <PageHeader
        title={`${entity?.code ?? "Entity fee"} · ${fee.billingYear}`}
        meta={entity ? `${entity.name}${client ? ` · ${client.name}` : ""}` : undefined}
        actions={
          <>
            <ButtonLink href="/fees" variant="secondary">
              ← All fees
            </ButtonLink>
            <Pill variant={statusVariant(fee.status)}>
              {statusLabel(fee.status)}
            </Pill>
          </>
        }
      />

      <div className="px-6 my-3.5 flex flex-col gap-3.5 pb-8">
        {error && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            {error}
          </div>
        )}
        {saved && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            Saved.
          </div>
        )}

        <form action={updateAssignmentAction}>
          <input type="hidden" name="id" value={fee.id} />
          <Card title="Assignment details">
            <div className="flex flex-col gap-3">
              <Row>
                <SelectField label="Entity" name="entityId" required defaultValue={fee.entityId}>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.code} — {e.name}
                    </option>
                  ))}
                </SelectField>
                <Field
                  label="Billing year"
                  name="billingYear"
                  required
                  type="number"
                  mono
                  defaultValue={String(fee.billingYear)}
                />
              </Row>
              <Row>
                <SelectField
                  label="Schedule"
                  name="feeScheduleId"
                  defaultValue={fee.feeScheduleId ?? ""}
                >
                  <option value="">Custom (no template)</option>
                  {matchingSchedules.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField label="Status" name="status" defaultValue={fee.status}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="billed">Billed</option>
                  <option value="paid">Paid</option>
                  <option value="void">Void</option>
                </SelectField>
              </Row>
              <Row>
                <Field
                  label="Annual fee"
                  name="annualFee"
                  required
                  mono
                  inputMode="decimal"
                  defaultValue={fee.annualFee}
                />
                <Field
                  label="Included hours"
                  name="includedHours"
                  required
                  mono
                  inputMode="decimal"
                  defaultValue={fee.includedHours}
                />
              </Row>
              <TextareaField label="Notes" name="notes" defaultValue={fee.notes ?? ""} />
            </div>
            <div className="flex justify-end gap-2 mt-3.5">
              <Button variant="primary" type="submit">
                Save changes
              </Button>
            </div>
          </Card>
        </form>

        {entity && (
          <Link
            href={`/entities/${entity.id}`}
            style={{
              color: "var(--ink-3)",
              fontSize: 12,
              textDecoration: "underline",
            }}
          >
            View entity →
          </Link>
        )}

        <form action={deleteAssignmentAction}>
          <input type="hidden" name="id" value={fee.id} />
          <Card title="Danger zone">
            <div className="flex items-center justify-between gap-3 text-[12.5px]">
              <span style={{ color: "var(--ink-3)" }}>
                Deleting this assignment removes the entity's fee record for{" "}
                {fee.billingYear}. The invoice (if any) is not deleted.
              </span>
              <Button variant="danger" type="submit">
                Delete assignment
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}
