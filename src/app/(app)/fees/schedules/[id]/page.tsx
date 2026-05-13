import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { getFeeScheduleById } from "@/lib/data";
import {
  deleteScheduleAction,
  updateScheduleAction,
} from "./actions";

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

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const schedule = await getFeeScheduleById(id);
  if (!schedule) notFound();

  return (
    <>
      <PageHeader
        title={schedule.name}
        meta="Fee schedule"
        actions={
          <>
            <ButtonLink href="/fees?tab=schedules" variant="secondary">
              ← All schedules
            </ButtonLink>
            <Pill variant={statusVariant(schedule.isActive ? "active" : "inactive")}>
              {statusLabel(schedule.isActive ? "active" : "inactive")}
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

        <form action={updateScheduleAction}>
          <input type="hidden" name="id" value={schedule.id} />
          <Card title="Schedule details">
            <div className="flex flex-col gap-3">
              <Row>
                <Field label="Name" name="name" required defaultValue={schedule.name} />
                <SelectField
                  label="Entity kind"
                  name="entityKind"
                  required
                  defaultValue={schedule.entityKind}
                >
                  {KIND_OPTIONS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </SelectField>
              </Row>
              <Row>
                <Field
                  label="Annual fee"
                  name="annualFee"
                  required
                  mono
                  inputMode="decimal"
                  defaultValue={schedule.annualFee}
                />
                <Field
                  label="Included hours"
                  name="includedHours"
                  required
                  mono
                  inputMode="decimal"
                  defaultValue={schedule.includedHours}
                />
              </Row>
              <Row>
                <Field
                  label="Applicable year"
                  name="applicableYear"
                  mono
                  type="number"
                  defaultValue={schedule.applicableYear ?? ""}
                />
                <label className="flex items-end gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    name="isActive"
                    defaultChecked={schedule.isActive}
                  />
                  <span style={{ color: "var(--ink-2)" }}>Active</span>
                </label>
              </Row>
              <TextareaField
                label="Notes"
                name="notes"
                defaultValue={schedule.notes ?? ""}
              />
            </div>
            <div className="flex justify-end gap-2 mt-3.5">
              <Button variant="primary" type="submit">
                Save changes
              </Button>
            </div>
          </Card>
        </form>

        <form action={deleteScheduleAction}>
          <input type="hidden" name="id" value={schedule.id} />
          <Card title="Danger zone">
            <div className="flex items-center justify-between gap-3 text-[12.5px]">
              <span style={{ color: "var(--ink-3)" }}>
                Deleting a schedule leaves its existing entity assignments in
                place (they retain their captured amount/hours).
              </span>
              <Button variant="danger" type="submit">
                Delete schedule
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}
