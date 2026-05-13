import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import {
  getCustomers,
  getEntities,
  getTimeEntryById,
  getUsers,
} from "@/lib/data";
import {
  deleteTimeEntryAction,
  updateTimeEntryAction,
} from "./actions";
import { Attachments } from "@/components/Attachments";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const entry = await getTimeEntryById(id);
  if (!entry) notFound();

  const [users, customers, entities] = await Promise.all([
    getUsers(),
    getCustomers(),
    getEntities(),
  ]);

  return (
    <>
      <PageHeader
        title="Time entry"
        meta={entry.description}
        actions={
          <ButtonLink href="/time" variant="secondary">
            ← All entries
          </ButtonLink>
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

        <form action={updateTimeEntryAction}>
          <input type="hidden" name="id" value={entry.id} />
          <Card title="Edit entry">
            <div className="flex flex-col gap-3">
              <Row>
                <Field
                  label="Date"
                  name="entryDate"
                  type="date"
                  required
                  defaultValue={entry.entryDate}
                />
                <Field
                  label="Duration (hours)"
                  name="durationHours"
                  required
                  mono
                  inputMode="decimal"
                  defaultValue={entry.durationHours}
                />
              </Row>
              <Row>
                <SelectField label="User" name="userId" required defaultValue={entry.userId}>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </SelectField>
                <Field
                  label="Rate (per hr)"
                  name="rateAtLog"
                  mono
                  inputMode="decimal"
                  defaultValue={entry.rateAtLog ?? ""}
                />
              </Row>
              <TextareaField
                label="Description"
                name="description"
                required
                defaultValue={entry.description}
              />
              <Row>
                <SelectField
                  label="Client"
                  name="clientId"
                  defaultValue={entry.clientId ?? ""}
                >
                  <option value="">— None —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Entity"
                  name="entityId"
                  defaultValue={entry.entityId ?? ""}
                >
                  <option value="">— None —</option>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.code} — {e.name}
                    </option>
                  ))}
                </SelectField>
              </Row>
              <Row>
                <Field
                  label="Task type"
                  name="taskType"
                  defaultValue={entry.taskType ?? ""}
                />
                <label className="flex items-end gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    name="isBillable"
                    defaultChecked={entry.isBillable}
                  />
                  <span style={{ color: "var(--ink-2)" }}>Billable</span>
                </label>
              </Row>
            </div>
            <div className="flex justify-end gap-2 mt-3.5">
              <Button variant="primary" type="submit">
                Save changes
              </Button>
            </div>
          </Card>
        </form>

        <Attachments
          recordType="time_entry"
          recordId={entry.id}
          redirectPath={`/time/${entry.id}`}
        />

        <form action={deleteTimeEntryAction}>
          <input type="hidden" name="id" value={entry.id} />
          <Card title="Danger zone">
            <div className="flex items-center justify-between gap-3 text-[12.5px]">
              <span style={{ color: "var(--ink-3)" }}>
                Deleting this entry removes it from utilization reports.
              </span>
              <Button variant="danger" type="submit">
                Delete entry
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}
